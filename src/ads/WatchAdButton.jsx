import React from 'react';
import { adAvailability, useNow } from './useVideoAds.js';
import './ads.css';

// Header button next to the chip count (U21): "▶ +100" when an ad is ready,
// a countdown during the 30s break, and disabled after the daily limit.
export default function WatchAdButton({ status, onWatch }) {
  const waiting = Boolean(status?.nextAt);
  const now = useNow(waiting);
  const { ready, label, waitMs } = adAvailability(status, now);

  let shown = `+${status?.reward ?? 100}`;
  if (status && status.remaining === 0) shown = 'Done today';
  else if (waitMs > 0) shown = `${Math.ceil(waitMs / 1000)}s`;

  const left = status ? ` · ${status.remaining} of ${status.perDay} left today` : '';

  return (
    <button
      type="button"
      className={'watch-ad-button' + (ready ? ' is-ready' : '')}
      disabled={!ready}
      onClick={onWatch}
      title={label + left}
      aria-label={label + left}
    >
      <span className="watch-ad-play" aria-hidden="true">▶</span>
      <span>{shown}</span>
    </button>
  );
}
