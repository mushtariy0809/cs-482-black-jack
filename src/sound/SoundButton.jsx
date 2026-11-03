import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { updateSettings, useSoundSettings } from './SoundManager.js';
import './sound.css';

const SLIDERS = [
  { key: 'master', label: 'Master' },
  { key: 'music', label: 'Music' },
  { key: 'sfx', label: 'Effects' }
];

function SpeakerIcon({ muted }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />
      {muted ? (
        <path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M13 7.2a4 4 0 0 1 0 5.6M15.3 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

// Figma's "Sound" button: opens mute + volume controls. Settings persist in localStorage.
// compact shows just the icon (used in the header).
export default function SoundButton({ compact = false }) {
  const settings = useSoundSettings();
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={'sound-control' + (compact ? ' is-compact' : '')} ref={root}>
      <button
        className="sound-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={compact ? 'Sound settings' : undefined}
        onClick={() => setOpen(!open)}
      >
        <SpeakerIcon muted={settings.muted} />
        {!compact && <span>Sound</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="sound-panel"
            role="dialog"
            aria-label="Sound settings"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <button
              className={'sound-mute' + (settings.muted ? '' : ' primary')}
              aria-pressed={settings.muted}
              onClick={() => updateSettings({ muted: !settings.muted })}
            >
              <SpeakerIcon muted={settings.muted} />
              {settings.muted ? 'Sound off' : 'Sound on'}
            </button>

            {SLIDERS.map(slider => (
              <label key={slider.key} className="sound-slider">
                <span>{slider.label}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings[slider.key]}
                  disabled={settings.muted}
                  onChange={event => updateSettings({ [slider.key]: Number(event.target.value) })}
                />
                <span className="sound-value">{Math.round(settings[slider.key] * 100)}</span>
              </label>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
