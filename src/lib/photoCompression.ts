const MAX_PHOTO_BYTES = 750 * 1024;
const MAX_THUMBNAIL_BYTES = 80 * 1024;

function loadImage(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser could not read that photo. Try a JPEG or PNG."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The photo could not be compressed."));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function encodeImage(
  image: HTMLImageElement,
  maxEdge: number,
  maxBytes: number,
): Promise<Blob> {
  let scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process photos.");

  for (let resize = 0; resize < 5; resize += 1) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.84, 0.76, 0.68, 0.6]) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= maxBytes) return blob;
    }
    scale *= 0.8;
  }
  throw new Error("This photo could not be reduced enough to upload.");
}

export async function compressPhoto(file: File): Promise<{
  photo: File;
  thumbnail: File;
}> {
  const { image, url } = await loadImage(file);
  try {
    const [photo, thumbnail] = await Promise.all([
      encodeImage(image, 1920, MAX_PHOTO_BYTES),
      encodeImage(image, 480, MAX_THUMBNAIL_BYTES),
    ]);
    return {
      photo: new File([photo], "photo.jpg", { type: "image/jpeg" }),
      thumbnail: new File([thumbnail], "thumbnail.jpg", {
        type: "image/jpeg",
      }),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
