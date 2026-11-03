import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { STATUS_LABELS, TableIcons, seatText } from './tableInfo.jsx';

export default function AllTablesDropdown({ tables, activeId, onPick }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  // Close on outside click or Escape
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
    <div className="all-tables" ref={root}>
      <button className="all-tables-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        All tables (
        {/* Pulses when a table is added or removed */}
        <motion.span
          key={tables.length}
          className="all-tables-count"
          initial={{ scale: 1.6, color: '#f2d388' }}
          animate={{ scale: 1, color: '#c1f4dc' }}
          transition={{ type: 'spring', stiffness: 380, damping: 16 }}
        >
          {tables.length}
        </motion.span>
        ) <span aria-hidden="true">▾</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            className="all-tables-list"
            role="listbox"
            aria-label="All tables"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tables.map(table => (
              <li key={table.id} role="option" aria-selected={table.id === activeId}>
                <button
                  className={table.id === activeId ? 'is-current' : ''}
                  onClick={() => {
                    onPick(table.id);
                    setOpen(false);
                  }}
                >
                  <span className="row-name">
                    {table.name}
                    <TableIcons table={table} />
                  </span>
                  <span className="row-seats">{seatText(table)}</span>
                  <span className={`status-badge status-${table.status}`}>{STATUS_LABELS[table.status]}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
