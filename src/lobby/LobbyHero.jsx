import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { seatText } from './tableInfo.jsx';
import { play } from '../sound/SoundManager.js';

const HOLD_SECONDS = 10;
const RING_RADIUS = 22;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

// Drains over the time left on the held seat
function CountdownRing({ expiresAt }) {
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const msLeft = Math.max(0, expiresAt - now);
  const secondsLeft = Math.ceil(msLeft / 1000);

  // Tick for the last 3 seconds
  useEffect(() => {
    if (secondsLeft > 0 && secondsLeft <= 3) play('tick');
  }, [secondsLeft]);
  // Computed once at mount so the ring animates smoothly instead of in 200ms steps
  const [start] = useState(() => {
    const left = Math.max(0, expiresAt - Date.now());
    return { fraction: Math.min(1, left / (HOLD_SECONDS * 1000)), duration: left / 1000 };
  });

  return (
    <span className="countdown" role="timer" aria-label={`${secondsLeft} seconds to rejoin`}>
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle className="countdown-track" cx="28" cy="28" r={RING_RADIUS} />
        <motion.circle
          className="countdown-ring"
          cx="28"
          cy="28"
          r={RING_RADIUS}
          strokeDasharray={RING_LENGTH}
          initial={{ strokeDashoffset: RING_LENGTH * (1 - start.fraction) }}
          animate={{ strokeDashoffset: RING_LENGTH }}
          transition={{ duration: reduceMotion ? 0 : start.duration, ease: 'linear' }}
        />
      </svg>
      <span className={'countdown-number' + (secondsLeft <= 3 ? ' is-urgent' : '')}>{secondsLeft}</span>
    </span>
  );
}

// Top banner. Shows, in order of priority:
// 1. the table where your seat is being held (Rejoin, with a countdown)
// 2. the last table you played at (Join again)
// 3. The Green Room as a featured table
export default function LobbyHero({ tables, reservation, lastTableId, onJoin, joiningId }) {
  const held = reservation && tables.find(t => t.id === reservation.tableId);
  const last = !held && tables.find(t => t.id === lastTableId);
  const table = held || last || tables.find(t => t.id === 'green-room') || tables[0];

  if (!table) return <section className="lobby-hero" aria-label="Featured table" />;

  const label = held || last ? 'YOUR LAST TABLE' : 'FEATURED TABLE';
  const detail = held ? `${seatText(table)} · Your seat is saved` : seatText(table);
  const action = held ? 'Rejoin →' : last ? 'Join again →' : 'Join →';
  const full = !held && table.status === 'full';

  return (
    <section className="lobby-hero" aria-label={label.toLowerCase()}>
      <div className="hero-copy">
        <span className="pill hero-pill">{label}</span>
        <h2>{table.name}</h2>
        <p>{detail}</p>
        <div className="hero-actions">
          <button className="primary hero-button" data-sound="none" disabled={full || joiningId === table.id} onClick={() => onJoin(table)}>
            {full ? 'Full' : joiningId === table.id ? 'Joining…' : action}
          </button>
          {held && <CountdownRing key={reservation.expiresAt} expiresAt={reservation.expiresAt} />}
        </div>
      </div>
    </section>
  );
}
