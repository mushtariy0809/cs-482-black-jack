import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useDialogFocus } from '../components/useDismiss.js';
import { getSettings, play } from '../sound/SoundManager.js';
import './ads.css';

// Full-screen video ad (U21). It's the ad itself, so covering the page is fine.
// No seek bar: the chips are paid only when the video plays to the end
// (the server also checks that enough time passed).
//
// session: { viewId, ad, durationMs }
// onFinish(): asks the server for the reward, resolves to { ok, reward, status, message }
// onClose({ abandoned }): abandoned is true when closed before the reward

function formatSeconds(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `0:${String(s).padStart(2, '0')}`;
}

export default function AdPlayer({ session, onFinish, onClose }) {
  const { ad } = session;
  const video = useRef(null);
  const furthest = useRef(0);
  const resumeOnShow = useRef(false);
  // loading | playing | paused | claiming | done | error
  const [phase, setPhase] = useState('loading');
  const [time, setTime] = useState({ current: 0, duration: ad.durationMs / 1000 });
  const [muted, setMuted] = useState(getSettings().muted);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  const finished = phase === 'done';
  const closeButton = useDialogFocus(() => close());

  function close() {
    onClose({ abandoned: !finished });
  }

  async function start() {
    const element = video.current;
    if (!element) return;
    try {
      await element.play();
    } catch {
      // Autoplay with sound blocked: play muted instead (the player can unmute)
      element.muted = true;
      setMuted(true);
      try {
        await element.play();
      } catch {
        setPhase('paused');
      }
    }
  }

  useEffect(() => {
    start();
  }, []);

  // Pause while the tab is hidden, so the ad isn't "watched" in the background
  useEffect(() => {
    function onVisibility() {
      const element = video.current;
      if (!element) return;
      if (document.hidden && !element.paused) {
        resumeOnShow.current = true;
        element.pause();
      } else if (!document.hidden && resumeOnShow.current) {
        resumeOnShow.current = false;
        element.play().catch(() => setPhase('paused'));
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  async function claim() {
    setPhase('claiming');
    const reply = await onFinish();
    if (reply.ok) {
      setResult(reply);
      setPhase('done');
      play('chipStack');
    } else {
      setMessage(reply.message || 'Could not add your chips. Try another ad.');
      setPhase('error');
    }
  }

  function onTimeUpdate(event) {
    const { currentTime, duration } = event.currentTarget;
    furthest.current = Math.max(furthest.current, currentTime);
    setTime({ current: currentTime, duration: Number.isFinite(duration) ? duration : ad.durationMs / 1000 });
  }

  // No skipping ahead (keyboard media keys, picture-in-picture controls, etc.)
  function onSeeking(event) {
    const element = event.currentTarget;
    if (element.currentTime > furthest.current + 0.5) element.currentTime = furthest.current;
  }

  function togglePlay() {
    const element = video.current;
    if (!element || finished) return;
    if (element.paused) element.play().catch(() => setPhase('paused'));
    else element.pause();
  }

  function toggleMute() {
    const element = video.current;
    if (!element) return;
    element.muted = !element.muted;
    setMuted(element.muted);
  }

  const left = time.duration - time.current;
  const progress = time.duration ? Math.min(1, time.current / time.duration) : 0;

  let footer;
  if (phase === 'done') {
    const remaining = result.status?.remaining;
    footer = (
      <>
        <span className="ad-footer-text">
          <span><strong className="ad-reward-amount">+{result.reward} chips</strong> added to your balance</span>
          {remaining != null && <span className="ad-footer-sub">{remaining} free {remaining === 1 ? 'ad' : 'ads'} left today</span>}
        </span>
        <button type="button" className="primary" onClick={close}>Back to the game</button>
      </>
    );
  } else if (phase === 'error') {
    footer = (
      <>
        <span className="ad-footer-text form-error" role="alert">{message}</span>
        <button type="button" onClick={close}>Close</button>
      </>
    );
  } else {
    footer = (
      <>
        <span className="ad-footer-text">
          <span>{phase === 'claiming' ? 'Adding your chips…' : <>Reward in <strong>{formatSeconds(left)}</strong></>}</span>
          <span className="ad-footer-sub">Watch to the end for free chips</span>
        </span>
        <button type="button" className="ad-skip" onClick={close}>Close · no chips</button>
      </>
    );
  }

  return (
    <motion.div
      className="ad-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="ad-player"
        role="dialog"
        aria-modal="true"
        aria-label={`Video ad from ${ad.sponsor}`}
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
      >
        <div className="ad-screen">
          <video
            ref={video}
            src={ad.video}
            poster={ad.poster}
            playsInline
            preload="auto"
            muted={muted}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback"
            onPlaying={() => setPhase('playing')}
            // A video also pauses right before it ends; that's not a real pause
            onPause={event => {
              if (!event.currentTarget.ended) setPhase(current => (current === 'playing' ? 'paused' : current));
            }}
            onTimeUpdate={onTimeUpdate}
            onSeeking={onSeeking}
            onEnded={claim}
            onError={() => {
              setMessage('This ad could not load. Close it and try again.');
              setPhase('error');
            }}
            onClick={togglePlay}
          />

          <div className="ad-top">
            <span className="ad-badge">AD · {ad.sponsor}</span>
            <button
              ref={closeButton}
              type="button"
              className="ad-icon-button"
              aria-label={muted ? 'Unmute ad' : 'Mute ad'}
              onClick={toggleMute}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>

          {phase === 'paused' && (
            <button type="button" className="ad-resume" onClick={togglePlay}>▶ Resume</button>
          )}
          {phase === 'loading' && <span className="ad-loading" role="status">Loading ad…</span>}

          <div className={'ad-lower-third' + (finished ? ' is-done' : '')}>
            <span className="ad-sponsor">{ad.sponsor}</span>
            <strong className="ad-headline">{ad.headline}</strong>
            <span className="ad-tagline">{ad.tagline}</span>
          </div>

          {finished && (
            <motion.div
              className="ad-reward-burst"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              aria-hidden="true"
            >
              +{result.reward}
            </motion.div>
          )}

          <div
            className="ad-progress"
            role="progressbar"
            aria-label="Ad progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
        </div>

        <div className="ad-footer">{footer}</div>
      </motion.div>
    </motion.div>
  );
}
