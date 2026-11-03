import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { joinTable, useTables } from '../realtime/useTables.js';
import { FILTERS } from './tableInfo.jsx';
import LobbyHero from './LobbyHero.jsx';
import AdBanner from './AdBanner.jsx';
import TableCarousel from './TableCarousel.jsx';
import AllTablesDropdown from './AllTablesDropdown.jsx';
import PasswordPrompt from './PasswordPrompt.jsx';
import { readLastTable, saveLastTable } from './lastTable.js';
import './lobby.css';

// onJoined(table) is called after the server gives us a seat.
// focusTableId opens the carousel on that table; notice is a one-line message above it.
export default function Lobby({ onJoined, onCreate, focusTableId = null, notice = '' }) {
  const { tables, reservation } = useTables();
  const [filter, setFilter] = useState('all');
  const [activeId, setActiveId] = useState(focusTableId);
  const [joiningId, setJoiningId] = useState(null);
  const [passwordFor, setPasswordFor] = useState(null);
  const [error, setError] = useState('');
  const lastIndex = useRef(0);

  const shown = useMemo(
    () => tables.filter(FILTERS.find(f => f.id === filter).test),
    [tables, filter]
  );

  // Keep the carousel on a real table. If the one you're looking at
  // disappears, move to the nearest one instead of jumping to the start.
  useEffect(() => {
    if (shown.length === 0) return;
    const i = shown.findIndex(t => t.id === activeId);
    if (i === -1) {
      setActiveId(shown[Math.min(lastIndex.current, shown.length - 1)].id);
    } else {
      lastIndex.current = i;
    }
  }, [shown, activeId]);

  function changeFilter(next) {
    const nextShown = tables.filter(FILTERS.find(f => f.id === next).test);
    if (!nextShown.some(t => t.id === activeId)) {
      lastIndex.current = 0;
      setActiveId(nextShown[0]?.id ?? null);
    }
    setFilter(next);
  }

  function pickFromList(tableId) {
    if (!shown.some(t => t.id === tableId)) setFilter('all');
    setActiveId(tableId);
  }

  // Returns an error message, or null when joined
  async function join(table, password) {
    setJoiningId(table.id);
    const result = await joinTable({ tableId: table.id, password });
    setJoiningId(null);

    if (!result.ok) return result.message;

    saveLastTable(table.id);
    setPasswordFor(null);
    onJoined(result.table);
    return null;
  }

  async function requestJoin(table) {
    setError('');
    const seatHeldHere = reservation?.tableId === table.id;

    if (table.visibility === 'private' && !seatHeldHere) {
      setPasswordFor(table);
      return;
    }

    const message = await join(table);
    if (message) setError(message);
  }

  return (
    <div className="lobby">
      <div className="lobby-title">
        <h1>Find your table.</h1>
        <button className="primary create-button" onClick={onCreate} disabled={!onCreate}>
          + Create table
        </button>
      </div>

      <LobbyHero
        tables={tables}
        reservation={reservation}
        lastTableId={readLastTable()}
        onJoin={requestJoin}
        joiningId={joiningId}
      />

      <AdBanner />

      <section className="lobby-tables" aria-label="Choose a table">
        <div className="lobby-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="Table type">
            {FILTERS.map(f => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                className={filter === f.id ? 'is-selected' : ''}
                onClick={() => changeFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {error && <p className="form-error lobby-error" role="alert">{error}</p>}
          {!error && notice && <p className="lobby-notice" role="status">{notice}</p>}

          <AllTablesDropdown tables={tables} activeId={activeId} onPick={pickFromList} />
        </div>

        <TableCarousel
          tables={shown}
          activeId={activeId}
          onActiveChange={setActiveId}
          onJoin={requestJoin}
          joiningId={joiningId}
          keyboardEnabled={!passwordFor}
        />

        {/* Inside the table picker so it can never cover the ads */}
        <AnimatePresence>
          {passwordFor && (
            <PasswordPrompt
              table={passwordFor}
              onSubmit={password => join(passwordFor, password)}
              onCancel={() => setPasswordFor(null)}
            />
          )}
        </AnimatePresence>
      </section>

      <div className="lobby-footer">
        <span>Play chips only</span>
      </div>
    </div>
  );
}
