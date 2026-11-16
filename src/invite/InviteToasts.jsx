import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LockIcon } from '../lobby/tableInfo.jsx';
import { dismissInvite, useTables } from '../realtime/useTables.js';
import './invite.css';

// Popups for friend invites (U1). App puts them in its bottom-left .toast-stack,
// away from the ad column. onJoin(invite) takes the player to the table; blockedReason disables Join (e.g. mid-hand).
export default function InviteToasts({ onJoin, blockedReason = '' }) {
  const { invites, mySeat } = useTables();
  // No need to invite you to the table you're already at
  const shown = invites.filter(invite => invite.tableId !== mySeat?.tableId);

  return (
    <AnimatePresence>
      {shown.map(invite => (
        <motion.div
          key={invite.tableId}
          className="toast invite-toast"
          role="status"
          layout
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
        >
          <span className="toast-icon" aria-hidden="true">✉</span>
          <div className="toast-body">
            <strong>{invite.fromName} invited you</strong>
            <span>
              {invite.hasPin && <LockIcon />} {invite.tableName} · {invite.players} / {invite.maxSeats} players
            </span>
            {blockedReason && <span className="toast-note">{blockedReason}</span>}
          </div>
          <div className="toast-actions">
            <button type="button" className="primary" disabled={Boolean(blockedReason)} onClick={() => onJoin(invite)}>
              Join
            </button>
            <button type="button" onClick={() => dismissInvite(invite.tableId)}>Not now</button>
          </div>
        </motion.div>
      ))}
  </AnimatePresence>
  );
}
