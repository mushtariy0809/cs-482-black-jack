import React from 'react';
import { seatText } from './tableInfo.jsx';

// Top banner. Shows, in order of priority:
// 1. the table where your seat is being held (Rejoin)
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
        <button className="primary hero-button" disabled={full || joiningId === table.id} onClick={() => onJoin(table)}>
          {full ? 'Full' : joiningId === table.id ? 'Joining…' : action}
        </button>
      </div>
    </section>
  );
}
