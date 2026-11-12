interface Env {
  saxon_trip_db: D1Database;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  ALLOWED_ORIGINS: string;
}

type PartyEvent = {
  id: string;
  name: string;
  reveal_at: string;
};

type PhotoRow = {
  id: string;
  event_id: string;
  user_id: string;
  storage_path: string;
  thumbnail_path: string;
  full_version: number;
  thumbnail_version: number;
  created_at: string;
  bytes: number;
};

type CloudinaryAsset = {
  public_id: string;
  version: number;
  format: string;
  bytes: number;
};

type AuthUser = {
  id: string;
};

const EVENT_ID = "saxon-trip";
const PHOTO_LIMIT = 24;
const MAX_PHOTO_BYTES = 750 * 1024;
const MAX_THUMBNAIL_BYTES = 80 * 1024;
const MAX_EVENT_STORAGE_BYTES = 512 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isAllowedOrigin(origin: string, env: Env) {
  return env.ALLOWED_ORIGINS.split(",")
    .map((allowed) => allowed.trim())
    .filter(Boolean)
    .includes(origin);
}

function corsHeaders(origin: string | null) {
  const headers = new Headers({ Vary: "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
) {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

async function authenticate(request: Request, env: Env): Promise<AuthUser> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError("A guest session is required.", 401);
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: authorization,
    },
  });
  if (!response.ok) {
    throw new HttpError("Your guest session has expired. Reload the page.", 401);
  }

  const user = (await response.json()) as AuthUser;
  if (typeof user.id !== "string" || !user.id) {
    throw new HttpError("Could not verify the guest session.", 401);
  }
  return user;
}

async function getEvent(env: Env): Promise<PartyEvent> {
  const event = await env.saxon_trip_db.prepare(
    "SELECT id, name, reveal_at FROM events WHERE id = ?",
  )
    .bind(EVENT_ID)
    .first<PartyEvent>();
  if (!event) throw new HttpError("The Saxon trip event is not configured.", 503);
  return event;
}

async function getGuestPhotoCount(env: Env, userId: string): Promise<number> {
  const result = await env.saxon_trip_db.prepare(
    "SELECT COUNT(*) AS count FROM photos WHERE event_id = ? AND user_id = ?",
  )
    .bind(EVENT_ID, userId)
    .first<{ count: number }>();
  return result?.count ?? 0;
}

async function getEventStorageBytes(env: Env): Promise<number> {
  const result = await env.saxon_trip_db.prepare(
    "SELECT COALESCE(SUM(bytes), 0) AS bytes FROM photos WHERE event_id = ?",
  )
    .bind(EVENT_ID)
    .first<{ bytes: number }>();
  return result?.bytes ?? 0;
}

function cloudinaryApiUrl(env: Env, resource: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(env.CLOUDINARY_CLOUD_NAME)) {
    throw new HttpError("Cloudinary is not configured.", 503);
  }
  return `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/${resource}`;
}

async function cloudinarySignature(
  parameters: Record<string, string>,
  env: Env,
) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new HttpError("Cloudinary is not configured.", 503);
  }
  const source = Object.entries(parameters)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(`${source}${env.CLOUDINARY_API_SECRET}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function uploadCloudinaryImage(
  file: File,
  publicId: string,
  env: Env,
): Promise<CloudinaryAsset> {
  const form = new FormData();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const parameters = {
    overwrite: "false",
    public_id: publicId,
    timestamp,
    type: "authenticated",
    unique_filename: "false",
    use_filename: "false",
  };
  form.set("file", file, `${publicId.split("/").pop()}.jpg`);
  for (const [key, value] of Object.entries(parameters)) {
    form.set(key, value);
  }
  form.set("api_key", env.CLOUDINARY_API_KEY);
  form.set("signature", await cloudinarySignature(parameters, env));

  const response = await fetch(cloudinaryApiUrl(env, "upload"), {
    method: "POST",
    body: form,
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new HttpError("Cloudinary returned an invalid upload response.", 502);
  }
  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "object" &&
      result.error !== null &&
      "message" in result.error &&
      typeof result.error.message === "string"
        ? result.error.message
        : "Cloudinary could not store this photo.";
    throw new HttpError(message, response.status === 413 ? 413 : 502);
  }
  if (
    typeof result !== "object" ||
    result === null ||
    !("public_id" in result) ||
    !("version" in result) ||
    !("format" in result) ||
    !("bytes" in result) ||
    result.public_id !== publicId ||
    typeof result.version !== "number" ||
    result.format !== "jpg" ||
    typeof result.bytes !== "number"
  ) {
    throw new HttpError("Cloudinary returned incomplete photo details.", 502);
  }
  return result as CloudinaryAsset;
}

async function deleteCloudinaryImage(publicId: string, env: Env) {
  const form = new FormData();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const parameters = {
    invalidate: "true",
    public_id: publicId,
    timestamp,
    type: "authenticated",
  };
  for (const [key, value] of Object.entries(parameters)) {
    form.set(key, value);
  }
  form.set("api_key", env.CLOUDINARY_API_KEY);
  form.set("signature", await cloudinarySignature(parameters, env));
  const response = await fetch(cloudinaryApiUrl(env, "destroy"), {
    method: "POST",
    body: form,
  });
  const result = (await response.json()) as { result?: string };
  if (!response.ok || result.result !== "ok") {
    throw new Error(`Cloudinary cleanup failed for ${publicId}.`);
  }
}

async function cloudinaryDeliveryUrl(
  publicId: string,
  version: number,
  env: Env,
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(env.CLOUDINARY_CLOUD_NAME)) {
    throw new HttpError("Cloudinary is not configured.", 503);
  }
  if (!env.CLOUDINARY_API_SECRET) {
    throw new HttpError("Cloudinary is not configured.", 503);
  }
  const source = `${publicId}.jpg`;
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(`${source}${env.CLOUDINARY_API_SECRET}`),
  );
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const signature = btoa(binary)
    .slice(0, 8)
    .replaceAll("/", "_")
    .replaceAll("+", "-");
  const encodedId = publicId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/authenticated/s--${signature}--/v${version}/${encodedId}.jpg`;
}

async function handleParty(env: Env, user: AuthUser, origin: string | null) {
  const [event, photoCount] = await Promise.all([
    getEvent(env),
    getGuestPhotoCount(env, user.id),
  ]);
  return jsonResponse(
    { event, remaining: Math.max(0, PHOTO_LIMIT - photoCount) },
    200,
    origin,
  );
}

async function handleUpload(
  request: Request,
  env: Env,
  user: AuthUser,
  origin: string | null,
) {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (
    contentLength >
    MAX_PHOTO_BYTES + MAX_THUMBNAIL_BYTES + 64 * 1024
  ) {
    throw new HttpError("The compressed photo upload is too large.", 413);
  }

  const form = await request.formData();
  if (form.get("eventId") !== EVENT_ID) {
    throw new HttpError("Unknown event.", 404);
  }
  const file = form.get("photo");
  const thumbnail = form.get("thumbnail");
  if (!(file instanceof File) || !(thumbnail instanceof File)) {
    throw new HttpError("Choose a photo to upload.", 400);
  }
  if (file.type !== "image/jpeg" || thumbnail.type !== "image/jpeg") {
    throw new HttpError("Photos must be resized to JPEG before upload.", 415);
  }
  if (file.size > MAX_PHOTO_BYTES || thumbnail.size > MAX_THUMBNAIL_BYTES) {
    throw new HttpError("This compressed photo exceeds the upload size limit.", 413);
  }

  const event = await getEvent(env);
  if (Date.parse(event.reveal_at) <= Date.now()) {
    throw new HttpError("This event is no longer accepting photos.", 409);
  }
  if ((await getGuestPhotoCount(env, user.id)) >= PHOTO_LIMIT) {
    throw new HttpError("Your camera is out of shots.", 409);
  }
  if ((await getEventStorageBytes(env)) >= MAX_EVENT_STORAGE_BYTES) {
    throw new HttpError("The trip photo storage limit has been reached.", 507);
  }

  const photoId = crypto.randomUUID();
  const fullId = `${EVENT_ID}/${photoId}/full`;
  const thumbnailId = `${EVENT_ID}/${photoId}/thumb`;
  const uploaded: string[] = [];
  let fullAsset: CloudinaryAsset;
  let thumbnailAsset: CloudinaryAsset;
  try {
    fullAsset = await uploadCloudinaryImage(file, fullId, env);
    uploaded.push(fullId);
    thumbnailAsset = await uploadCloudinaryImage(thumbnail, thumbnailId, env);
    uploaded.push(thumbnailId);
  } catch (cause) {
    for (const publicId of uploaded) {
      try {
        await deleteCloudinaryImage(publicId, env);
      } catch (cleanupCause) {
        console.error("Could not clean up an incomplete Cloudinary upload.", cleanupCause);
      }
    }
    throw cause;
  }

  const totalBytes = fullAsset.bytes + thumbnailAsset.bytes;
  const now = new Date().toISOString();
  let insertResult: D1Result;
  try {
    insertResult = await env.saxon_trip_db.prepare(
      `INSERT INTO photos (
         id, event_id, user_id, storage_path, thumbnail_path,
         full_version, thumbnail_version, created_at, bytes
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM events WHERE id = ? AND reveal_at > ?
       )
       AND (
         SELECT COUNT(*) FROM photos WHERE event_id = ? AND user_id = ?
       ) < ?
       AND (
         SELECT COALESCE(SUM(bytes), 0) FROM photos WHERE event_id = ?
       ) + ? <= ?`,
    )
      .bind(
        photoId,
        EVENT_ID,
        user.id,
        fullId,
        thumbnailId,
        fullAsset.version,
        thumbnailAsset.version,
        now,
        totalBytes,
        EVENT_ID,
        now,
        EVENT_ID,
        user.id,
        PHOTO_LIMIT,
        EVENT_ID,
        totalBytes,
        MAX_EVENT_STORAGE_BYTES,
      )
      .run();
  } catch (cause) {
    for (const publicId of uploaded) {
      try {
        await deleteCloudinaryImage(publicId, env);
      } catch (cleanupCause) {
        console.error("Could not clean up a failed Cloudinary photo save.", cleanupCause);
      }
    }
    throw cause;
  }

  if (insertResult.meta.changes !== 1) {
    for (const publicId of uploaded) {
      await deleteCloudinaryImage(publicId, env);
    }
    const [updatedEvent, count, bytes] = await Promise.all([
      getEvent(env),
      getGuestPhotoCount(env, user.id),
      getEventStorageBytes(env),
    ]);
    if (Date.parse(updatedEvent.reveal_at) <= Date.now()) {
      throw new HttpError("This event is no longer accepting photos.", 409);
    }
    if (count >= PHOTO_LIMIT) {
      throw new HttpError("Your camera is out of shots.", 409);
    }
    if (bytes + totalBytes > MAX_EVENT_STORAGE_BYTES) {
      throw new HttpError("The trip photo storage limit has been reached.", 507);
    }
    throw new HttpError("Could not save your photo. Please try again.", 500);
  }

  const photoCount = await getGuestPhotoCount(env, user.id);
  return jsonResponse(
    { remaining: Math.max(0, PHOTO_LIMIT - photoCount) },
    201,
    origin,
  );
}

async function handleGallery(env: Env, origin: string | null) {
  const event = await getEvent(env);
  if (Date.parse(event.reveal_at) > Date.now()) {
    throw new HttpError("The trip gallery is still locked.", 403);
  }

  const { results } = await env.saxon_trip_db.prepare(
    `SELECT id, event_id, user_id, storage_path, thumbnail_path,
            full_version, thumbnail_version, created_at, bytes
     FROM photos WHERE event_id = ? ORDER BY created_at ASC`,
  )
    .bind(EVENT_ID)
    .all<PhotoRow>();

  const photos = await Promise.all(
    results.map(async (photo) => ({
      id: photo.id,
      signedUrl: await cloudinaryDeliveryUrl(
        photo.storage_path,
        photo.full_version,
        env,
      ),
      thumbnailUrl: await cloudinaryDeliveryUrl(
        photo.thumbnail_path,
        photo.thumbnail_version,
        env,
      ),
      storagePath: photo.storage_path,
      createdAt: photo.created_at,
    })),
  );
  return jsonResponse(photos, 200, origin);
}

async function handleMediaSign(
  request: Request,
  env: Env,
  user: AuthUser,
  origin: string | null,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError("Invalid photo request.", 400);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("storagePath" in body) ||
    typeof body.storagePath !== "string"
  ) {
    throw new HttpError("A photo path is required.", 400);
  }

  const photo = await env.saxon_trip_db.prepare(
    `SELECT id, event_id, user_id, storage_path, thumbnail_path,
            full_version, thumbnail_version, created_at, bytes
     FROM photos WHERE event_id = ? AND storage_path = ?`,
  )
    .bind(EVENT_ID, body.storagePath)
    .first<PhotoRow>();
  if (!photo) throw new HttpError("Photo not found.", 404);

  const event = await getEvent(env);
  if (photo.user_id !== user.id && Date.parse(event.reveal_at) > Date.now()) {
    throw new HttpError("This photo is still private.", 403);
  }

  return jsonResponse(
    {
      signedUrl: await cloudinaryDeliveryUrl(
        photo.storage_path,
        photo.full_version,
        env,
      ),
    },
    200,
    origin,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin && !isAllowedOrigin(origin, env)) {
      return jsonResponse({ error: "Origin is not allowed." }, 403, null);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const url = new URL(request.url);
      const user = await authenticate(request, env);
      if (request.method === "GET" && url.pathname === "/api/party") {
        return await handleParty(env, user, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/photos") {
        return await handleUpload(request, env, user, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/photos") {
        return await handleGallery(env, origin);
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/photos/sign"
      ) {
        return await handleMediaSign(request, env, user, origin);
      }
      return jsonResponse({ error: "Not found." }, 404, origin);
    } catch (cause) {
      if (cause instanceof HttpError) {
        return jsonResponse({ error: cause.message }, cause.status, origin);
      }
      console.error("Saxon trip API request failed.", cause);
      return jsonResponse(
        { error: "The request could not be completed. Please try again." },
        500,
        origin,
      );
    }
  },
};
