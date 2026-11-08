import { useEffect, useRef, useState } from "react";
import {
  createPhotoDownloadUrl,
  type GalleryPhoto,
} from "../lib/party";
import SavePhotosButton from "./SavePhotosButton";

type PhotoGalleryProps = {
  photos: GalleryPhoto[];
  loading: boolean;
  error: string;
};

function formatNumber(number: number) {
  return number.toString().padStart(2, "0");
}

function GalleryStatus({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`grid min-h-[130px] place-items-center border border-border text-center font-mono text-[10px] ${error ? "text-[#ff887b]" : "text-text"}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export default function PhotoGallery({
  photos,
  loading,
  error,
}: PhotoGalleryProps) {
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

  // Keep the gallery's scroll position when entering and leaving the viewer.
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
        const fileName = `saxon-trip-${formatNumber(photoNumber)}.${extension}`;
        const downloadUrl = await createPhotoDownloadUrl(photo, fileName);
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(
            `Could not prepare photo ${formatNumber(photoNumber)}.`,
          );
        }
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
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "The selected photos could not be prepared.",
      );
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
      // The share call must happen from a user gesture for mobile browsers.
      const shareRequest = navigator.share({
        files,
        title: "Saxon Trip photos",
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

  const shellClass =
    "mx-auto flex min-h-screen w-[min(100%,390px)] flex-col bg-background px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] max-[360px]:px-4";

  if (activePhoto && viewerIndex !== null) {
    return (
      <main className={`${shellClass} photo-viewer-shell`}>
        <header className="flex min-h-10.5 items-center justify-between border-0 font-mono text-accent">
          <button
            className="inline-flex items-center gap-[7px] border-0 bg-transparent p-0 font-mono text-[11px] text-accent"
            type="button"
            onClick={() => {
              setViewerIndex(null);
              setPreparedFiles(null);
              setSaveMessage("");
              setSaveError("");
              setShareCompleted(false);
            }}
          >
            <svg
              className="h-[18px] w-[18px] stroke-current"
              aria-hidden="true"
              viewBox="0 0 18 18"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            >
              <path d="M11.5 3.5 6 9l5.5 5.5M6.5 9h9" />
            </svg>
            BACK TO GALLERY
          </button>
          <span className="font-mono text-[9px] text-text">
            {formatNumber(viewerIndex + 1)} / {formatNumber(photos.length)}
          </span>
        </header>

        <section className="flex min-h-[84px] items-end justify-between gap-[10px] py-[18px] pb-6">
          <h1 className="font-display text-[28px] leading-[1.5] text-accent max-[360px]:text-2xl">
            SAXON TRIP
          </h1>
          <span className="font-mono text-[9px] text-text">TRIP PHOTOS</span>
        </section>

        <figure className="grid h-[min(410px,55vh)] min-h-[240px] w-full place-items-center bg-[#090c08]">
          <img
            className="block h-full w-full object-contain"
            src={activePhoto.signedUrl}
            alt={`Party photo ${viewerIndex + 1}`}
          />
        </figure>

        <nav
          className="flex min-h-[54px] items-center justify-between gap-[10px] py-[18px]"
          aria-label="Browse photos"
        >
          <button
            className="grid h-6 w-6 place-items-center border-0 bg-transparent p-0 text-accent disabled:opacity-40"
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
            <svg
              className="h-[18px] w-[18px] stroke-current"
              aria-hidden="true"
              viewBox="0 0 18 18"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            >
              <path d="M11.5 3.5 6 9l5.5 5.5" />
            </svg>
          </button>
          <span className="font-mono text-[10px] text-text">
            PHOTO {formatNumber(viewerIndex + 1)} OF{" "}
            {formatNumber(photos.length)}
          </span>
          <button
            className="grid h-6 w-6 place-items-center border-0 bg-transparent p-0 text-accent disabled:opacity-40"
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
            <svg
              className="h-[18px] w-[18px] stroke-current"
              aria-hidden="true"
              viewBox="0 0 18 18"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            >
              <path d="m6.5 3.5 5.5 5.5-5.5 5.5" />
            </svg>
          </button>
        </nav>

        <section
          className="flex flex-col gap-3 border-t-0 pt-[14px]"
          aria-label="Save photo"
        >
          <SavePhotosButton
            disabled={saving || shareCompleted}
            label={
              saving
                ? saveProgress
                : shareCompleted
                  ? "SAVED"
                  : preparedFiles
                    ? "OPEN SAVE MENU"
                    : "SAVE PHOTO"
            }
            onClick={() => handleSave([activePhoto])}
            showArrow={!shareCompleted}
          />
          <p className="text-center text-[11px] leading-[1.5] text-text">
            Photos prepare first. Tap again to open the share menu and save to
            Photos or Files.
          </p>
          {saveMessage && (
            <p
              className="font-mono text-[9px] text-accent"
              role="status"
            >
              {saveMessage}
            </p>
          )}
          {saveError && (
            <p className="text-[10px] text-[#ff887b]" role="alert">
              {saveError}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-accent font-mono text-accent">
        <a
          className="text-xs font-semibold tracking-[-0.5px] no-underline"
          href="/"
          aria-label="Saxon Trip Camera home"
        >
          SAXON TRIP CAMERA
        </a>
        <span className="text-[9px] text-text">ONE-TIME TRIP</span>
      </header>

      <section
        className="flex min-h-[90px] items-center justify-between gap-[10px] py-5 pb-4"
        aria-labelledby="gallery-title"
      >
        <h1
          id="gallery-title"
          className="font-display text-4xl leading-[1.5] text-accent max-[360px]:text-[32px]"
        >
          {selectedIds.size} SELECTED
        </h1>
        <button
          className="cursor-pointer border-0 bg-transparent px-0 py-1 font-mono text-xs text-accent underline"
          type="button"
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

      <div className="flex min-h-[38px] items-start justify-between gap-[10px] border-t border-border py-[10px] pb-[14px] font-mono text-[10px] leading-[14px] text-text">
        <span>CHOOSE PHOTOS TO SAVE</span>
        <button
          className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[10px] leading-[14px] text-accent disabled:cursor-default disabled:opacity-45"
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
        <GalleryStatus>DEVELOPING THE PHOTOS…</GalleryStatus>
      ) : error ? (
        <GalleryStatus error>{error}</GalleryStatus>
      ) : photos.length === 0 ? (
        <GalleryStatus>NO PHOTOS MADE IT ONTO THE ROLL.</GalleryStatus>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1">
            {photos.map((photo, index) => {
              const isSelected = selectedIds.has(photo.id);
              return (
                <article
                  className={`relative aspect-[114/125] overflow-hidden bg-[#252a23] ${isSelected ? "outline-3 -outline-offset-[3px] outline-accent" : ""}`}
                  key={photo.id}
                >
                  <button
                    className="block h-full w-full cursor-zoom-in border-0 bg-transparent p-0"
                    type="button"
                    aria-label={`Open photo ${index + 1}`}
                    onClick={() => openPhoto(index)}
                  >
                    <img
                      className="block h-full w-full object-cover transition-transform duration-200 hover:scale-[1.035]"
                      src={photo.signedUrl}
                      alt=""
                      loading="lazy"
                    />
                  </button>
                  <span className="pointer-events-none absolute bottom-[5px] left-[5px] bg-[rgb(17_21_15_/_78%)] px-[5px] py-[2px] font-mono text-[8px] leading-[11px] text-accent">
                    {formatNumber(index + 1)}
                  </span>
                  <button
                    className={`absolute right-[7px] top-[7px] grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-full border bg-[rgb(17_21_15_/_78%)] p-0 text-background ${isSelected ? "border-accent bg-accent" : "border-[#eef0e7]"}`}
                    type="button"
                    aria-label={`${isSelected ? "Deselect" : "Select"} photo ${index + 1}`}
                    aria-pressed={isSelected}
                    onClick={() => toggleSelected(photo.id)}
                  >
                    {isSelected && (
                      <svg
                        className="h-[14px] w-[14px] stroke-current"
                        aria-hidden="true"
                        viewBox="0 0 14 14"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.6"
                      >
                        <path d="m2.5 7 3 3 6-6" />
                      </svg>
                    )}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="flex min-h-[42px] items-start justify-between gap-[10px] py-[14px] font-mono text-[10px] leading-[14px] text-text">
            <span>{photos.length} PHOTOS IN THE GALLERY</span>
            <span className="text-accent">{selectedIds.size} SELECTED</span>
          </div>

          <section
            className="sticky bottom-0 z-[5] mt-auto flex flex-col gap-[10px] bg-[linear-gradient(to_bottom,transparent,var(--color-background)_14px)] py-4 pb-[calc(10px+env(safe-area-inset-bottom))]"
            aria-label="Save selected photos"
          >
            <SavePhotosButton
              disabled={
                selectedPhotos.length === 0 || saving || shareCompleted
              }
              label={
                saving
                  ? saveProgress
                  : shareCompleted
                    ? "SAVED"
                    : preparedFiles
                      ? `OPEN SAVE MENU (${preparedFiles.length})`
                      : selectedPhotos.length
                        ? `SAVE ${selectedPhotos.length} ${selectedPhotos.length === 1 ? "PHOTO" : "PHOTOS"}`
                        : "SELECT PHOTOS TO SAVE"
              }
              onClick={() => handleSave(selectedPhotos)}
              showArrow={!shareCompleted}
            />
            <p className="text-center text-[10px] leading-[1.4] text-text">
              Photos prepare first. Tap again to open the share menu and save to
              Photos or Files.
            </p>
            {saveMessage && (
              <p
                className="font-mono text-[9px] text-accent"
                role="status"
              >
                {saveMessage}
              </p>
            )}
            {saveError && (
              <p className="text-[10px] text-[#ff887b]" role="alert">
                {saveError}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
