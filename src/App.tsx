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

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Party Camera home">
          <span className="wordmark-icon" aria-hidden="true">✳</span>
          PARTY CAMERA
        </a>
        <span className="topbar-note">ONE NIGHT. ONE ROLL.</span>
      </header>

      <section className="camera-card" aria-labelledby="page-title">
        <div className="card-topline">
          <span className="eyebrow"><span className="live-dot" /> THE PARTY CAM</span>
          <span className="roll-label">ROLL NO. 001</span>
        </div>

        <div className="hero-copy">
          <p className="kicker">{revealed ? 'THE WAIT IS OVER' : 'PHOTOS NOW. MEMORIES LATER.'}</p>
          <h1 id="page-title">{revealed ? 'The party, in full.' : 'You had to be there.'}</h1>
          <p className="intro">
            {revealed
              ? 'Every guest’s photos, all in one place.'
              : 'Take a few shots. Nobody sees a thing until the big reveal.'}
          </p>
        </div>

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
            <div className="camera-top">
              <div className="viewfinder">
                <span className="viewfinder-label">YOUR CAMERA</span>
                <span className="viewfinder-icon" aria-hidden="true">✳</span>
                <span className="viewfinder-hint">{takingPhoto ? 'DEVELOPING…' : 'READY WHEN YOU ARE'}</span>
              </div>
              <div className="shot-counter" aria-label={`${remaining} shots remaining`}>
                <span className="counter-label">SHOTS LEFT</span>
                <span className="counter-number">{formatNumber(remaining)}</span>
                <span className="counter-total">/ {PHOTO_LIMIT}</span>
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
              <span className="shutter-icon" aria-hidden="true">{takingPhoto ? '…' : '↗'}</span>
              <span>{takingPhoto ? 'Saving your shot' : remaining === 0 ? 'Roll finished' : 'Take a photo'}</span>
            </label>

            <p className="privacy-note"><span aria-hidden="true">◉</span> Your photos stay under wraps until reveal.</p>

            <div className="reveal-panel">
              <div className="reveal-copy">
                <span className="reveal-label">THE BIG REVEAL</span>
                <span className="reveal-date">{revealDate}</span>
              </div>
              <div className="countdown" aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds until reveal`}>
                <span>{countdown.days}<small>D</small></span>
                <i>:</i>
                <span>{formatNumber(countdown.hours)}<small>H</small></span>
                <i>:</i>
                <span>{formatNumber(countdown.minutes)}<small>M</small></span>
                <i>:</i>
                <span>{formatNumber(countdown.seconds)}<small>S</small></span>
              </div>
            </div>
          </section>
        ) : null}

        {error && event && (
          <p className="inline-error" role="alert">{error}</p>
        )}

        <footer className="card-footer">
          <span>MADE FOR THE MOMENTS IN BETWEEN</span>
          <span>✳</span>
        </footer>
      </section>

      <p className="page-footnote">A little mystery makes a better memory.</p>
    </main>
  );
}
