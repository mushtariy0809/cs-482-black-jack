import React from 'react';
import { motion } from 'framer-motion';

export const STATUS_LABELS = { waiting: 'Waiting', in_game: 'In game', full: 'Full' };

export const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'open', label: 'Open', test: t => t.visibility === 'public' && t.mode === 'people' },
  { id: 'friends', label: 'Friends only', test: t => t.visibility === 'private' },
  { id: 'practice', label: 'Practice', test: t => t.mode === 'bots' }
];

export function seatText(table) {
  if (table.solo) return 'Solo vs. dealer · Always open';
  return `${table.players} / ${table.maxSeats} players`;
}

export function betText(table) {
  return `Bets ${table.minBet.toLocaleString()} – ${table.maxBet.toLocaleString()}`;
}

// Pulses once whenever the status changes (keyed on status)
export function StatusBadge({ status }) {
  return (
    <motion.span
      key={status}
      className={`status-badge status-${status}`}
      initial={{ scale: 1.25, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
    >
      {STATUS_LABELS[status]}
    </motion.span>
  );
}

export function LockIcon() {
  return (
    <svg className="table-icon" width="16" height="16" viewBox="0 0 16 16" aria-label="Private" role="img">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function BotIcon() {
  return (
    <svg className="table-icon" width="16" height="16" viewBox="0 0 16 16" aria-label="Bots" role="img">
      <rect x="2.5" y="5" width="11" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="9" r="1.2" fill="currentColor" />
      <circle cx="10" cy="9" r="1.2" fill="currentColor" />
      <path d="M8 5V2.5M6.5 2.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TableIcons({ table }) {
  return (
    <>
      {table.visibility === 'private' && <LockIcon />}
      {table.mode === 'bots' && <BotIcon />}
    </>
  );
}
