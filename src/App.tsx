import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { PHOTO_LIMIT, type GalleryPhoto, type PartyEvent, joinParty, loadGallery, takePhoto } from './lib/party';
import { isSupabaseConfigured } from './lib/supabase';

type Countdown = { days: number; hours: number; minutes: number; seconds: number };

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
  return number.toString().padStart(2, '0');
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [event, setEvent] = useState<PartyEvent | null>(null);
  const [remaining, setRemaining] = useState(PHOTO_LIMIT);
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [error, setError] = useState('');

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
        if (active) setError(cause instanceof Error ? cause.message : 'Could not join this party.');
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
    loadGallery(event.id)
      .then((photos) => {
        if (active) setGallery(photos);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load the gallery.');
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
    setError('');

    if (!file.type.startsWith('image/')) {
      setError('Choose an image to take your shot.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)) {
      setError('Use a JPEG, PNG, WebP or HEIC photo.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('That photo is over 10 MB. Choose a smaller image.');
      return;
    }
    if (remaining <= 0) {
      setError('Your camera is out of shots.');
      return;
    }

    setTakingPhoto(true);
    try {
      const nextRemaining = await takePhoto(file, event.id, user.id);
      setRemaining(nextRemaining);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your photo. Please try again.');
    } finally {
      setTakingPhoto(false);
    }
  }

  const revealDate = event
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(event.reveal_at))
    : '';
  const totalHours = countdown.days * 24 + countdown.hours;

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Party Camera home">PARTY CAMERA</a>
        <span className="topbar-note">HALLOWEEN / 2026</span>
      </header>

      <section className="camera-card" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="kicker"><span className="live-dot" /> YOU HAD TO BE THERE.</p>
          <h1 id="page-title">
            {revealed ? <>THE BIG<br />REVEAL.</> : <>DRESSED TO<br />DIE FOR.</>}
          </h1>
        </div>

        <section className="party-evidence" aria-label="Party photo preview">
          <div className="poster-rail">
            <span className="party-date">31<br />OCT</span>
            <span className="photo-number">ONE<br />NIGHT</span>
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
            {!revealed && <span className="sealed-sticker">NO PEEKING UNTIL REVEAL ↗</span>}
          </div>
        </section>

        <p className="intro">
          {revealed
            ? 'The night, from every angle. All the party photos are finally here.'
            : '24 shots each. One special night. Your camera lives right here in your browser.'}
        </p>

        {loading ? (
          <div className="status-panel" role="status">Getting your camera ready…</div>
        ) : !isSupabaseConfigured ? (
          <div className="status-panel setup-panel">
            <strong>Almost ready to shoot.</strong>
            <span>Add your Supabase project URL and anon key to <code>.env.local</code>, then run the setup in <code>supabase/schema.sql</code>.</span>
          </div>
        ) : error && !event ? (
          <div className="status-panel error-panel" role="alert">
            <strong>Couldn’t join the party.</strong>
            <span>{error}</span>
          </div>
        ) : event && revealed ? (
          <section className="gallery-section" aria-label="Party photo gallery">
            <div className="gallery-heading">
              <span className="photo-total">{gallery.length} PHOTOS</span>
              <span className="gallery-caption">Collected from the whole party</span>
            </div>
            {gallery.length ? (
              <div className="photo-grid">
                {gallery.map((photo, index) => (
                  <a className="photo-tile" href={photo.signedUrl} target="_blank" rel="noreferrer" key={photo.id}>
                    <img src={photo.signedUrl} alt={`Party memory ${index + 1}`} loading="lazy" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="empty-gallery">No photos yet. Be the first to start the roll.</div>
            )}
          </section>
        ) : event ? (
          <section className="camera-body" aria-label="Camera and reveal countdown">
            <div className="camera-status">
              <div className="camera-state">
                <span className="counter-label">{takingPhoto ? 'CAMERA / SAVING' : 'YOUR CAMERA / READY'}</span>
                <span className="shots-remaining">SHOTS REMAINING</span>
              </div>
              <div className="shot-count" aria-label={`${remaining} shots remaining`}>
                <span>{formatNumber(remaining)}</span><small> / {PHOTO_LIMIT}</small>
              </div>
            </div>

            <label className={`shutter-button${takingPhoto || remaining === 0 ? ' is-disabled' : ''}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={takingPhoto || remaining === 0}
                onChange={(change) => {
                  void onSelectPhoto(change.currentTarget.files?.[0]);
                  change.currentTarget.value = '';
                }}
              />
              <img className="shutter-icon" src="/icons/camera.svg" alt="" />
              <span>{takingPhoto ? 'Saving your shot' : remaining === 0 ? 'Roll finished' : 'Take a photo'}</span>
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
                  <span className="countdown-clock">{formatNumber(totalHours)}:{formatNumber(countdown.minutes)}:{formatNumber(countdown.seconds)}</span>
                  <span className="countdown-units">
                    <span>HR</span>
                    <span>MIN</span>
                    <span>SEC</span>
                  </span>
                </div>
              </div>
              <span className="reveal-hint">At reveal, this link becomes our shared gallery.</span>
            </div>
          </section>
        ) : null}

        {error && event && <p className="inline-error" role="alert">{error}</p>}

        <footer className="card-footer">
          <span>HALLOWEEN ’26 · ONE NIGHT ONLY</span>
        </footer>
      </section>
    </main>
  );
}
