import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import type { GalleryPhoto, PartyEvent } from "./lib/party";
import {
  joinParty,
  loadGallery,
  PHOTO_LIMIT,
  takePhoto,
} from "./lib/party";
import { isSupabaseConfigured } from "./lib/supabase";
import CameraScreen from "./components/CameraScreen";
import PhotoGallery from "./components/PhotoGallery";

type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getCountdown(milliseconds: number): Countdown {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [event, setEvent] = useState<PartyEvent | null>(null);
  const [remaining, setRemaining] = useState(PHOTO_LIMIT);
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    joinParty()
      .then((result) => {
        if (!active) return;
        setUser(result.user);
        setEvent(result.event);
        setRemaining(result.remaining);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not join this party.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const revealed = Boolean(event && now >= new Date(event.reveal_at).getTime());

  useEffect(() => {
    if (!revealed || !event) return;

    let active = true;
    setGalleryLoading(true);
    loadGallery(event.id)
      .then((photos) => {
        if (active) setGallery(photos);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the gallery.",
          );
        }
      })
      .finally(() => {
        if (active) setGalleryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [revealed, event]);

  const countdown = useMemo(
    () => getCountdown(event ? new Date(event.reveal_at).getTime() - now : 0),
    [event, now],
  );

  async function onSelectPhoto(file: File | undefined) {
    if (!file || !event || !user) return;
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Choose an image to take your shot.");
      return;
    }
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(file.type)
    ) {
      setError("Use a JPEG, PNG, WebP or HEIC photo.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("That photo is over 10 MB. Choose a smaller image.");
      return;
    }
    if (remaining <= 0) {
      setError("Your camera is out of shots.");
      return;
    }

    setTakingPhoto(true);
    try {
      const nextRemaining = await takePhoto(file, event.id, user.id);
      setRemaining(nextRemaining);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save your photo. Please try again.",
      );
    } finally {
      setTakingPhoto(false);
    }
  }

  const revealDate = event
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(event.reveal_at))
    : "";

  if (event && revealed) {
    return (
      <PhotoGallery photos={gallery} loading={galleryLoading} error={error} />
    );
  }

  return (
    <CameraScreen
      event={event}
      loading={loading}
      configured={isSupabaseConfigured}
      photoLimit={PHOTO_LIMIT}
      remaining={remaining}
      takingPhoto={takingPhoto}
      previewImageFailed={previewImageFailed}
      error={error}
      revealed={revealed}
      countdown={countdown}
      revealDate={revealDate}
      onPreviewImageError={() => setPreviewImageFailed(true)}
      onSelectPhoto={(file) => void onSelectPhoto(file)}
    />
  );
}
