import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPhotoDownloadUrl,
  joinParty,
  loadGallery,
  PHOTO_LIMIT,
  takePhoto,
  type GalleryPhoto,
  type PartyEvent,
} from "./lib/party";
import { isSupabaseConfigured } from "./lib/supabase";

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

function formatNumber(number: number) {
  return number.toString().padStart(2, "0");
}

function PhotoGallery({
  photos,
  loading,
  error,
}: {
  photos: GalleryPhoto[];
  loading: boolean;
  error: string;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [shareCompleted, setShareCompleted] = useState(false);
  const [preparedFiles, setPreparedFiles] = useState<File[] | null>(null);
  const galleryScrollPosition = useRef<number | null>(null);
  const selectedPhotos = photos.filter((photo) => selectedIds.has(photo.id));
  const allSelected = photos.length > 0 && selectedIds.size === photos.length;
  const activePhoto = viewerIndex === null ? null : photos[viewerIndex];

  useEffect(() => {
    if (viewerIndex !== null) {
      window.scrollTo(0, 0);
    } else if (galleryScrollPosition.current !== null) {
      window.scrollTo(0, galleryScrollPosition.current);
      galleryScrollPosition.current = null;
    }
  }, [viewerIndex]);

  useEffect(() => {
    if (viewerIndex === null) return;
    const currentViewerIndex = viewerIndex;

    function changePhoto(index: number) {
      setViewerIndex(index);
      setPreparedFiles(null);
      setSaveMessage("");
      setSaveError("");
      setShareCompleted(false);
    }

    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") {
        setViewerIndex(null);
        setPreparedFiles(null);
        setSaveMessage("");
        setSaveError("");
        setShareCompleted(false);
      }
      if (keyEvent.key === "ArrowLeft") {
        changePhoto((currentViewerIndex - 1 + photos.length) % photos.length);
      }
      if (keyEvent.key === "ArrowRight") {
        changePhoto((currentViewerIndex + 1) % photos.length);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photos.length, viewerIndex]);

  function toggleSelected(photoId: string) {
    setSelectedIds((current) => {
      const updated = new Set(current);
      if (updated.has(photoId)) updated.delete(photoId);
      else updated.add(photoId);
      return updated;
    });
    setPreparedFiles(null);
    setSaveMessage("");
    setSaveError("");
    setShareCompleted(false);
  }

  async function preparePhotos(photosToSave: GalleryPhoto[]) {
    if (saving || photosToSave.length === 0) return;

    setSaving(true);
    setPreparedFiles(null);
    setSaveMessage("");
    setSaveError("");
    setShareCompleted(false);

    try {
      const files: File[] = [];
      for (const [index, photo] of photosToSave.entries()) {
        setSaveProgress(`PREPARING ${index + 1} / ${photosToSave.length}`);
        const photoNumber = photos.indexOf(photo) + 1;
        const extension =
          photo.storagePath.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `halloween-home-${formatNumber(photoNumber)}.${extension}`;
        const downloadUrl = await createPhotoDownloadUrl(photo, fileName);
        const response = await fetch(downloadUrl);
        if (!response.ok)
          throw new Error(
            `Could not prepare photo ${formatNumber(photoNumber)}.`,
          );
        const blob = await response.blob();
        files.push(
          new File([blob], fileName, { type: blob.type || "image/jpeg" }),
        );
      }
      if (!navigator.share || !navigator.canShare?.({ files })) {
        throw new Error(
          "This browser cannot share photo files. Open the party link in Safari or Chrome on your phone.",
        );
      }
      setPreparedFiles(files);
      setSaveMessage("PHOTOS READY. TAP AGAIN TO SHARE.");
    } catch (cause) {
      const reason =
        cause instanceof Error
          ? cause.message
          : "The selected photos could not be prepared.";
      setSaveError(reason);
    } finally {
      setSaving(false);
      setSaveProgress("");
    }
  }

  async function openShareMenu(files: File[]) {
    if (saving) return;
    if (!navigator.share || !navigator.canShare?.({ files })) {
      setSaveError(
        "This browser cannot share photo files. Open the party link in Safari or Chrome on your phone.",
      );
      return;
    }

    setSaving(true);
    setSaveMessage("");
    setSaveError("");
    try {
      const shareRequest = navigator.share({
        files,
        title: "Halloween Home photos",
        text: "Save these photos to your device.",
      });
      setSaveProgress("OPENING SAVE MENU…");
      await shareRequest;
      setPreparedFiles(null);
      setShareCompleted(true);
      setSaveMessage("DONE — CHECK YOUR PHOTOS OR FILES.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setSaveMessage("SHARE CANCELED. NO PHOTOS WERE SAVED.");
        return;
      }
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "The share menu could not be opened.",
      );
    } finally {
      setSaving(false);
      setSaveProgress("");
    }
  }

  function handleSave(photosToSave: GalleryPhoto[]) {
    if (preparedFiles) {
      void openShareMenu(preparedFiles);
    } else {
      void preparePhotos(photosToSave);
    }
  }

  function openPhoto(index: number) {
    galleryScrollPosition.current = window.scrollY;
    setPreparedFiles(null);
    setSaveMessage("");
    setSaveError("");
    setShareCompleted(false);
    setViewerIndex(index);
  }

  if (activePhoto && viewerIndex !== null) {
    return (
      <main className="page-shell gallery-shell photo-viewer-shell">
        <header className="gallery-header">
          <button
            className="viewer-back"
            type="button"
            onClick={() => {
              setViewerIndex(null);
              setPreparedFiles(null);
              setSaveMessage("");
              setSaveError("");
              setShareCompleted(false);
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" fill="none">
              <path d="M11.5 3.5 6 9l5.5 5.5M6.5 9h9" />
            </svg>
            BACK TO GALLERY
          </button>
          <span className="viewer-position">
            {formatNumber(viewerIndex + 1)} / {formatNumber(photos.length)}
          </span>
        </header>

        <section className="viewer-identity">
          <h1>HALLOWEEN HOME</h1>
          <span>HALLOWEEN ’26</span>
        </section>

        <figure className="viewer-photo">
          <img
            src={activePhoto.signedUrl}
            alt={`Party photo ${viewerIndex + 1}`}
          />
        </figure>

        <nav className="photo-navigation" aria-label="Browse photos">
          <button
            type="button"
            aria-label="Previous photo"
            disabled={photos.length < 2}
            onClick={() => {
              setViewerIndex((viewerIndex - 1 + photos.length) % photos.length);
              setPreparedFiles(null);
              setSaveMessage("");
              setSaveError("");
              setShareCompleted(false);
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" fill="none">
              <path d="M11.5 3.5 6 9l5.5 5.5" />
            </svg>
          </button>
          <span>
            PHOTO {formatNumber(viewerIndex + 1)} OF{" "}
            {formatNumber(photos.length)}
          </span>
          <button
            type="button"
            aria-label="Next photo"
            disabled={photos.length < 2}
            onClick={() => {
              setViewerIndex((viewerIndex + 1) % photos.length);
              setPreparedFiles(null);
              setSaveMessage("");
              setSaveError("");
              setShareCompleted(false);
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" fill="none">
              <path d="m6.5 3.5 5.5 5.5-5.5 5.5" />
            </svg>
          </button>
        </nav>

        <section className="viewer-save-panel" aria-label="Save photo">
          <button
            className="save-photos-button"
            type="button"
            disabled={saving || shareCompleted}
            onClick={() => handleSave([activePhoto])}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path d="M10 2.5v10m0 0 4-4m-4 4-4-4M3.5 13.5v3h13v-3" />
            </svg>
            {saving
              ? saveProgress
              : shareCompleted
                ? "SAVED"
                : preparedFiles
                  ? "OPEN SAVE MENU"
                  : "SAVE PHOTO"}
            {!shareCompleted && (
              <svg
                className="save-arrow"
                aria-hidden="true"
                viewBox="0 0 18 18"
                fill="none"
              >
                <path d="M5 13 13 5M5 5h8v8" />
              </svg>
            )}
          </button>
          <p>
            Photos prepare first. Tap again to open the share menu and save to
            Photos or Files.
          </p>
          {saveMessage && (
            <p className="save-message" role="status">
              {saveMessage}
            </p>
          )}
          {saveError && (
            <p className="save-error" role="alert">
              {saveError}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell gallery-shell">
      <header className="gallery-header">
        <a className="gallery-wordmark" href="/" aria-label="Party Camera home">
          PARTY CAMERA
        </a>
        <span className="gallery-edition">HALLOWEEN / 2026</span>
      </header>

      <section className="selection-heading" aria-labelledby="gallery-title">
        <h1 id="gallery-title">{selectedIds.size} SELECTED</h1>
        <button
          type="button"
          className="clear-selection"
          onClick={() => {
            setSelectedIds(new Set());
            setPreparedFiles(null);
            setSaveMessage("");
            setSaveError("");
            setShareCompleted(false);
          }}
        >
          CANCEL
        </button>
      </section>

      <div className="selection-tools">
        <span>CHOOSE PHOTOS TO SAVE</span>
        <button
          type="button"
          onClick={() => {
            setSelectedIds(
              allSelected
                ? new Set()
                : new Set(photos.map((photo) => photo.id)),
            );
            setPreparedFiles(null);
            setSaveMessage("");
            setSaveError("");
            setShareCompleted(false);
          }}
          disabled={loading || photos.length === 0}
        >
          {allSelected ? "DESELECT ALL" : "SELECT ALL"}
        </button>
      </div>

      {loading ? (
        <div className="gallery-status" role="status">
          DEVELOPING THE PHOTOS…
        </div>
      ) : error ? (
        <div className="gallery-status gallery-error" role="alert">
          {error}
        </div>
      ) : photos.length === 0 ? (
        <div className="gallery-status">NO PHOTOS MADE IT ONTO THE ROLL.</div>
      ) : (
        <>
          <div className="contact-sheet">
            {photos.map((photo, index) => {
              const isSelected = selectedIds.has(photo.id);
              return (
                <article
                  className={`photo-tile${isSelected ? " is-selected" : ""}`}
                  key={photo.id}
                >
                  <button
                    className="photo-open-button"
                    type="button"
                    aria-label={`Open photo ${index + 1}`}
                    onClick={() => openPhoto(index)}
                  >
                    <img src={photo.signedUrl} alt="" loading="lazy" />
                  </button>
                  <span className="shot-badge">{formatNumber(index + 1)}</span>
                  <button
                    className="photo-select-button"
                    type="button"
                    aria-label={`${isSelected ? "Deselect" : "Select"} photo ${index + 1}`}
                    aria-pressed={isSelected}
                    onClick={() => toggleSelected(photo.id)}
                  >
                    {isSelected && (
                      <svg aria-hidden="true" viewBox="0 0 14 14" fill="none">
                        <path d="m2.5 7 3 3 6-6" />
                      </svg>
                    )}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="remaining-gallery">
            <span>{photos.length} PHOTOS IN THE GALLERY</span>
            <span>{selectedIds.size} SELECTED</span>
          </div>

          <section
            className="batch-save-panel"
            aria-label="Save selected photos"
          >
            <button
              className="save-photos-button"
              type="button"
              disabled={
                selectedPhotos.length === 0 || saving || shareCompleted
              }
              onClick={() => handleSave(selectedPhotos)}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path d="M10 2.5v10m0 0 4-4m-4 4-4-4M3.5 13.5v3h13v-3" />
              </svg>
              {saving
                ? saveProgress
                : shareCompleted
                  ? "SAVED"
                  : preparedFiles
                    ? `OPEN SAVE MENU (${preparedFiles.length})`
                    : selectedPhotos.length
                      ? `SAVE ${selectedPhotos.length} ${selectedPhotos.length === 1 ? "PHOTO" : "PHOTOS"}`
                      : "SELECT PHOTOS TO SAVE"}
              {!shareCompleted && (
                <svg
                  className="save-arrow"
                  aria-hidden="true"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <path d="M5 13 13 5M5 5h8v8" />
                </svg>
              )}
            </button>
            <p>
              Photos prepare first. Tap again to open the share menu and save to
              Photos or Files.
            </p>
            {saveMessage && (
              <p className="save-message" role="status">
                {saveMessage}
              </p>
            )}
            {saveError && (
              <p className="save-error" role="alert">
                {saveError}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
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
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not join this party.",
          );
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
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the gallery.",
          );
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
  const totalHours = countdown.days * 24 + countdown.hours;

  if (event && revealed) {
    return (
      <PhotoGallery photos={gallery} loading={galleryLoading} error={error} />
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Party Camera home">
          PARTY CAMERA
        </a>
        <span className="topbar-note">HALLOWEEN / 2026</span>
      </header>

      <section className="camera-card" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="kicker">
            <span className="live-dot" /> YOU HAD TO BE THERE.
          </p>
          <h1 id="page-title">
            {revealed ? (
              <>
                THE BIG
                <br />
                REVEAL.
              </>
            ) : (
              <>
                DRESSED TO
                <br />
                DIE FOR.
              </>
            )}
          </h1>
        </div>

        <section className="party-evidence" aria-label="Party photo preview">
          <div className="poster-rail">
            <span className="party-date">
              31
              <br />
              OCT
            </span>
            <span className="photo-number">
              ONE
              <br />
              NIGHT
            </span>
          </div>
          <div className="evidence-print">
            {previewImageFailed ? (
              <div className="party-photo-placeholder">
                <span>YOUR PHOTO GOES HERE</span>
                <code>public/photos/IMG_7897.jpg</code>
              </div>
            ) : (
              <img
                className="party-photo"
                src="/photos/IMG_7897.jpg"
                alt="Halloween party preview"
                onError={() => setPreviewImageFailed(true)}
              />
            )}
            {!revealed && (
              <span className="sealed-sticker">NO PEEKING UNTIL REVEAL ↗</span>
            )}
          </div>
        </section>

        <p className="intro">
          {revealed
            ? "The night, from every angle. All the party photos are finally here."
            : "24 shots each. One special night. Your camera lives right here in your browser."}
        </p>

        {loading ? (
          <div className="status-panel" role="status">
            Getting your camera ready…
          </div>
        ) : !isSupabaseConfigured ? (
          <div className="status-panel setup-panel">
            <strong>Almost ready to shoot.</strong>
            <span>
              Add your Supabase project URL and anon key to{" "}
              <code>.env.local</code>, then run the setup in{" "}
              <code>supabase/schema.sql</code>.
            </span>
          </div>
        ) : error && !event ? (
          <div className="status-panel error-panel" role="alert">
            <strong>Couldn’t join the party.</strong>
            <span>{error}</span>
          </div>
        ) : event ? (
          <section
            className="camera-body"
            aria-label="Camera and reveal countdown"
          >
            <div className="camera-status">
              <div className="camera-state">
                <span className="counter-label">
                  {takingPhoto ? "CAMERA / SAVING" : "YOUR CAMERA / READY"}
                </span>
                <span className="shots-remaining">SHOTS REMAINING</span>
              </div>
              <div
                className="shot-count"
                aria-label={`${remaining} shots remaining`}
              >
                <span>{formatNumber(remaining)}</span>
                <small> / {PHOTO_LIMIT}</small>
              </div>
            </div>

            <label
              className={`shutter-button${takingPhoto || remaining === 0 ? " is-disabled" : ""}`}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={takingPhoto || remaining === 0}
                onChange={(change) => {
                  void onSelectPhoto(change.currentTarget.files?.[0]);
                  change.currentTarget.value = "";
                }}
              />
              <img className="shutter-icon" src="/icons/camera.svg" alt="" />
              <span>
                {takingPhoto
                  ? "Saving your shot"
                  : remaining === 0
                    ? "Roll finished"
                    : "Take a photo"}
              </span>
            </label>

            <p className="privacy-note">
              <span className="lock-icon privacy-lock" aria-hidden="true" />
              All photos stay private &amp; unseen until reveal.
            </p>

            <div className="reveal-panel">
              <div className="reveal-details">
                <span className="reveal-label">THE BIG REVEAL</span>
                <span className="locked-state">
                  <span className="lock-icon locked-lock" aria-hidden="true" />
                  LOCKED
                </span>
              </div>
              <div className="reveal-timing">
                <div className="reveal-copy">
                  <span className="reveal-date">{revealDate}</span>
                  <span className="reveal-label">REVEAL IN →</span>
                </div>
                <div
                  className="countdown"
                  aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds until reveal`}
                >
                  <span className="countdown-clock">
                    {formatNumber(totalHours)}:{formatNumber(countdown.minutes)}
                    :{formatNumber(countdown.seconds)}
                  </span>
                  <span className="countdown-units">
                    <span>HR</span>
                    <span>MIN</span>
                    <span>SEC</span>
                  </span>
                </div>
              </div>
              <span className="reveal-hint">
                At reveal, this link becomes our shared gallery.
              </span>
            </div>
          </section>
        ) : null}

        {error && event && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}

        <footer className="card-footer">
          <span>HALLOWEEN ’26 · ONE NIGHT ONLY</span>
        </footer>
      </section>
    </main>
  );
}
