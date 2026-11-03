import type { PartyEvent } from "../lib/party";

type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

type CameraScreenProps = {
  event: PartyEvent | null;
  loading: boolean;
  configured: boolean;
  photoLimit: number;
  remaining: number;
  takingPhoto: boolean;
  previewImageFailed: boolean;
  error: string;
  revealed: boolean;
  countdown: Countdown;
  revealDate: string;
  onPreviewImageError: () => void;
  onSelectPhoto: (file: File | undefined) => void;
};

function formatNumber(number: number) {
  return number.toString().padStart(2, "0");
}

function StatusPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-22 flex-col justify-center gap-1.75 border border-border p-3.5 text-[11px] leading-normal text-text">
      {children}
    </div>
  );
}

export default function CameraScreen({
  event,
  loading,
  configured,
  photoLimit,
  remaining,
  takingPhoto,
  previewImageFailed,
  error,
  revealed,
  countdown,
  revealDate,
  onPreviewImageError,
  onSelectPhoto,
}: CameraScreenProps) {
  const totalHours = countdown.days * 24 + countdown.hours;
  const shutterDisabled = takingPhoto || remaining === 0;

  return (
    <main className="mx-auto flex min-h-screen w-[min(100%,390px)] flex-col bg-background p-6">
      <header className="mb-5 flex min-h-7 items-start justify-between gap-3 border-b border-accent pb-3 font-mono text-accent">
        <a
          className="text-[9px] font-semibold tracking-[-0.03em] no-underline"
          href="/"
          aria-label="Party Camera home"
        >
          PARTY CAMERA
        </a>
        <span className="text-[8px]">HALLOWEEN / 2026</span>
      </header>

      <section className="flex flex-1 flex-col" aria-labelledby="page-title">
        <div className="mb-3.5">
          <p className="mb-2 flex items-center gap-1.75 font-mono text-[8px] tracking-[0.16em] text-accent">
            <span className="h-1.5 w-1.5 shrink-0 bg-accent" />
            YOU HAD TO BE THERE.
          </p>
          <h1
            id="page-title"
            className="font-display text-[clamp(48px,14vw,57px)] font-normal leading-[0.96] tracking-tight text-heading"
          >
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

        <section
          className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 max-[360px]:grid-cols-[27px_minmax(0,1fr)] max-[360px]:gap-2"
          aria-label="Party photo preview"
        >
          <div className="flex h-full flex-col items-start justify-between py-1">
            <span className="font-display text-[22px] leading-[0.95] text-accent">
              31
              <br />
              OCT
            </span>
            <span className="font-mono text-[7px] leading-[1.3] text-text">
              ONE
              <br />
              NIGHT
            </span>
          </div>
          <div className="relative aspect-290/215 w-full bg-accent p-0.75">
            {previewImageFailed ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2.25bg-[linear-gradient(135deg,transparent_48%,rgb(175_186_154_/_9%)_49%_51%,transparent_52%)_0_0/16px_16px] bg-[#252a23] text-center font-mono text-[8px] text-text">
                <span>YOUR PHOTO GOES HERE</span>
                <code className="text-[7px] text-accent">
                  public/photos/IMG_7897.jpg
                </code>
              </div>
            ) : (
              <img
                className="block h-full w-full object-cover"
                src="/photos/IMG_7897.jpg"
                alt="Halloween party preview"
                onError={onPreviewImageError}
              />
            )}
            {!revealed && (
              <span className="absolute -right-2 bottom-4.25 whitespace-nowrap bg-accent px-2.25 py-1.5 font-mono text-[7px] font-semibold text-background">
                NO PEEKING UNTIL REVEAL ↗
              </span>
            )}
          </div>
        </section>

        <p className="my-3.5 mb-4 text-[10px] leading-normal text-text">
          {revealed
            ? "The night, from every angle. All the party photos are finally here."
            : `${photoLimit} shots each. One special night. Your camera lives right here in your browser.`}
        </p>

        {loading ? (
          <StatusPanel>Getting your camera ready…</StatusPanel>
        ) : !configured ? (
          <StatusPanel>
            <strong className="text-[13px] text-accent">
              Almost ready to shoot.
            </strong>
            <span>
              Add your Supabase project URL and anon key to{" "}
              <code className="text-[10px] text-accent">.env.local</code>, then
              run the setup in{" "}
              <code className="text-[10px] text-accent">
                supabase/schema.sql
              </code>
              .
            </span>
          </StatusPanel>
        ) : error && !event ? (
          <StatusPanel>
            <strong className="text-[13px] text-accent">
              Couldn’t join the party.
            </strong>
            <span>{error}</span>
          </StatusPanel>
        ) : event ? (
          <section
            className="flex flex-col gap-2.75"
            aria-label="Camera and reveal countdown"
          >
            <div className="flex min-h-12 items-center justify-between border-y border-border py-1.75">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[8px] text-accent">
                  {takingPhoto ? "CAMERA / SAVING" : "YOUR CAMERA / READY"}
                </span>
                <span className="font-mono text-[7px] tracking-[0.08em] text-text">
                  SHOTS REMAINING
                </span>
              </div>
              <div
                className="flex items-baseline font-display text-[30px] leading-none text-accent"
                aria-label={`${remaining} shots remaining`}
              >
                <span>{formatNumber(remaining)}</span>
                <small className="ml-1 font-mono text-xs">/ {photoLimit}</small>
              </div>
            </div>

            <label
              className={`relative flex min-h-12 items-center justify-center gap-2.5 bg-accent font-mono text-xs font-semibold text-background transition-[filter,transform] duration-150 hover:-translate-y-px hover:brightness-95 focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-text ${shutterDisabled ? "cursor-not-allowed opacity-[0.63]" : "cursor-pointer"}`}
            >
              <input
                className="absolute h-px w-px overflow-hidden opacity-0"
                type="file"
                accept="image/*"
                capture="environment"
                disabled={shutterDisabled}
                onChange={(change) => {
                  onSelectPhoto(change.currentTarget.files?.[0]);
                  change.currentTarget.value = "";
                }}
              />
              <img className="h-4 w-5" src="/icons/camera.svg" alt="" />
              <span>
                {takingPhoto
                  ? "Saving your shot"
                  : remaining === 0
                    ? "Roll finished"
                    : "Take a photo"}
              </span>
            </label>

            <p className="mb-1.25 flex items-center justify-center gap-1.5 text-[8px] text-text">
              <span
                className="inline-block h-3 w-3 shrink-0 bg-current text-text [mask:url('/icons/lock-keyhole.svg')_center/contain_no-repeat]"
                aria-hidden="true"
              />
              All photos stay private &amp; unseen until reveal.
            </p>

            <div className="flex h-28.25 flex-col gap-2.5 border border-border bg-background px-4 py-3.5 max-[360px]:p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] leading-3 tracking-[1px] text-text">
                  THE BIG REVEAL
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[9px] leading-3 text-accent">
                  <span
                    className="inline-block h-3 w-3 shrink-0 bg-current text-accent [mask:url('/icons/lock-keyhole.svg')_center/contain_no-repeat]"
                    aria-hidden="true"
                  />
                  LOCKED
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.75">
                  <span className="text-xs font-semibold leading-3.75 text-accent max-[360px]:text-[8px]">
                    {revealDate}
                  </span>
                  <span className="font-mono text-[9px] leading-3 tracking-[1px] text-text">
                    REVEAL IN →
                  </span>
                </div>
                <div
                  className="flex w-24.75 flex-col font-mono"
                  aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds until reveal`}
                >
                  <span className="text-center text-[22px] leading-7.25 tracking-[-1px] text-accent">
                    {formatNumber(totalHours)}:{formatNumber(countdown.minutes)}:
                    {formatNumber(countdown.seconds)}
                  </span>
                  <span className="grid grid-cols-3 text-center text-[8px] leading-2.5 tracking-[2px] text-text">
                    <span>HR</span>
                    <span>MIN</span>
                    <span>SEC</span>
                  </span>
                </div>
              </div>
              <span className="text-[10px] leading-3 text-text">
                At reveal, this link becomes our shared gallery.
              </span>
            </div>
          </section>
        ) : null}

        {error && event && (
          <p className="mt-2.5 text-[11px] leading-normal text-[#ff887b]" role="alert">
            {error}
          </p>
        )}

        <footer className="mt-5 flex items-center justify-between gap-2.5 border-t border-border pt-3 font-mono text-[8px] leading-2.5 tracking-[0.5px] text-text">
          <span>HALLOWEEN ’26 · ONE NIGHT ONLY</span>
        </footer>
      </section>
    </main>
  );
}
