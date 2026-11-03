import React from 'react';
import { useTables } from './useTables.js';

// Small status pill shown only when the live connection is down
export default function ConnectionPill() {
  const { connection, offline } = useTables();
  if (connection !== 'reconnecting') return null;

  return (
    <span className="connection-pill" role="status">
      <span className="connection-dot" aria-hidden="true" />
      {offline ? 'Offline · demo tables' : 'Reconnecting…'}
    </span>
  );
}
