import React from 'react';
import { useTables } from '../realtime/useTables.js';
import SoundButton from '../sound/SoundButton.jsx';
import { LockIcon } from '../lobby/tableInfo.jsx';
import './table.css';

// Bar above the table (Figma "Bet" 3:1135): back, name, live seat count, Invite, Chat, Leave.
// onInvite is only passed at multiplayer tables (Practice is solo).
export default function TableBar({ table, onLeave, onChat, canChat, onInvite }) {
  const { tables } = useTables();
  const live = tables.find(t => t.id === table.id) ?? table;

  return (
    <div className="table-bar">
      <button className="table-bar-back" aria-label="Back to lobby" onClick={onLeave}>‹</button>
      <h1>{live.visibility === 'private' && <LockIcon />} {live.name}</h1>
      <span className="pill table-bar-seats">
        {live.solo ? 'Solo' : `${live.players} / ${live.maxSeats}`}
      </span>
      <div className="table-bar-actions">
        <SoundButton />
        {onInvite && !live.solo && (
          <button className="table-bar-invite" onClick={onInvite}>+ Invite</button>
        )}
        {canChat && (
          <button onClick={onChat}>Chat</button>
        )}
        <button onClick={onLeave}>Leave</button>
      </div>
    </div>
  );
}
