import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './table.css';

// Shown when leaving in the middle of a hand: the bet is lost (README penalty)
export default function LeaveConfirm({ stake, onConfirm, onCancel }) {
  const stay = useRef(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    stay.current?.focus();
    function onKey(event) {
      if (event.key === 'Escape') cancel.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div
      className="leave-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.div
        className="panel leave-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        aria-describedby="leave-text"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
      >
        <h2 id="leave-title">Leave in the middle of a hand?</h2>
        <p id="leave-text">
          You'll lose your {stake.toLocaleString()}-chip bet. Your seat is saved for 10 seconds if you change your mind.
        </p>
        <div className="leave-actions">
          <button ref={stay} onClick={onCancel}>Stay</button>
          <button className="leave-confirm" onClick={onConfirm}>Leave and lose bet</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
