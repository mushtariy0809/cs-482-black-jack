import React from 'react';
import { motion } from 'framer-motion';
import { adAvailability, useNow } from './useVideoAds.js';
import './ads.css';

// Shown when the balance can't cover the table's minimum bet (U21).
// Lives in App's .toast-stack so it never covers the ads or the cards.
export default function OutOfChipsToast({ status, minBet, error, onWatch, onDismiss }) {
  const now = useNow(Boolean(status?.nextAt));
  const { ready, label } = adAvailability(status, now);
  const doneForToday = status?.remaining === 0;

  return (
    <motion.div
      className="toast broke-toast"
      role="alert"
      layout
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
    >
      <span className="toast-icon" aria-hidden="true">🪙</span>
      <div className="toast-body">
        <strong>Out of chips</strong>
        <span>
          {doneForToday
            ? `You've watched all ${status.perDay} ads today. Free chips are back tomorrow.`
            : `You need ${minBet} chips to bet. Watch a short video for +${status?.reward ?? 100} chips.`}
        </span>
        {error && <span className="toast-note">{error}</span>}
      </div>
      <div className="toast-actions">
        {!doneForToday && (
          <button type="button" className="primary" disabled={!ready} onClick={onWatch}>
            {ready ? '▶ Watch ad' : label}
          </button>
        )}
        <button type="button" onClick={onDismiss}>{doneForToday ? 'OK' : 'Not now'}</button>
      </div>
    </motion.div>
  );
}
