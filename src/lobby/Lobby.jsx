import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { joinTable, peekInvite, useTables } from '../realtime/useTables.js';
import { FILTERS } from './tableInfo.jsx';
import LobbyHero from './LobbyHero.jsx';
import AdBanner from './AdBanner.jsx';
import TableCarousel from './TableCarousel.jsx';
import AllTablesDropdown from './AllTablesDropdown.jsx';
import PasswordPrompt from './PasswordPrompt.jsx';
import CodeJoin from './CodeJoin.jsx';
import { readLastTable, saveLastTable } from './lastTable.js';
import { play, preload } from '../sound/SoundManager.js';
import './lobby.css';

// onJoined(table) is called after the server gives us a seat.
// autoJoinId joins that table as soon as it shows up (tutorial's "Practice with bots").
// autoJoinCode joins by invite code (an invite link or a friend's invite popup).
export default function Lobby({ onJoined, onCreate, autoJoinId = null, autoJoinCode = null, onAutoJoinHandled }) {
  const { tables, reservation, connection, offline } = useTables();
  const [filter, setFilter] = useState('all');
  const [activeId, setActiveId] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  // { table, inviteCode? } while asking for a private table's PIN
  const [passwordFor, setPasswordFor] = useState(null);
  const [error, setError] = useState('');
  const [divingId, setDivingId] = useState(null);
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

  // Returns an error message, or null when joined (or when the PIN prompt opened instead).
  // inviteCode joins a hidden private table you found through a link or code.
  async function join(table, { password, inviteCode } = {}) {
    setJoiningId(table.id);
    const result = await joinTable(inviteCode ? { inviteCode, password } : { tableId: table.id, password });
    setJoiningId(null);

    if (!result.ok) {
      // The server knows who may skip the PIN (the creator, a held seat), so just ask when it says so
      if (result.code === 'pin_required') {
        setPasswordFor({ table, inviteCode });
        return null;
      }
      return result.message;
    }

    saveLastTable(table.id);
    setPasswordFor(null);
    play('seatJoin');
    preload('table');
    // Let the camera dive into the table first (instant with reduced motion)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setDivingId(table.id);
    setTimeout(() => onJoined(result.table), reduceMotion ? 0 : 450);
    return null;
  }

  const autoJoined = useRef(false);
  useEffect(() => {
    if (!autoJoinId || autoJoined.current) return;
    const table = tables.find(t => t.id === autoJoinId);
    if (!table) return;
    autoJoined.current = true;
    onAutoJoinHandled?.();
    setActiveId(table.id);
    requestJoin(table);
  }, [autoJoinId, tables]);

  // Same for the invite code from a link or a friend's invite.
  // Waits for the connection: an invite link opens the app before the socket is up.
  const codeJoined = useRef(null);
  const ready = connection === 'online' || offline;
  useEffect(() => {
    if (!autoJoinCode || !ready || codeJoined.current === autoJoinCode) return;
    codeJoined.current = autoJoinCode;
    onAutoJoinHandled?.();
    joinByCode(autoJoinCode).then(message => {
      if (message) setError(message);
    });
  }, [autoJoinCode, ready]);

  // A PIN table opens the PIN prompt when the server asks for it (see join)
  async function requestJoin(table) {
    setError('');
    const message = await join(table);
    if (message) setError(message);
  }

  // "Have a code?" and invite links. Returns an error message, or null.
  async function joinByCode(inviteCode) {
    setError('');
    const peek = await peekInvite(inviteCode);
    if (!peek.ok) return peek.message;
    if (peek.needsPin) {
      setPasswordFor({ table: peek.table, inviteCode });
      return null;
    }
    return join(peek.table, { inviteCode });
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

          <CodeJoin onSubmit={joinByCode} />

          <AllTablesDropdown tables={tables} activeId={activeId} onPick={pickFromList} />
        </div>

        <TableCarousel
          tables={shown}
          activeId={activeId}
          onActiveChange={setActiveId}
          onJoin={requestJoin}
          joiningId={joiningId}
          keyboardEnabled={!passwordFor && !divingId}
          divingId={divingId}
        />

        {/* Inside the table picker so it can never cover the ads */}
        <AnimatePresence>
          {passwordFor && (
            <PasswordPrompt
              table={passwordFor.table}
              onSubmit={password => join(passwordFor.table, { password, inviteCode: passwordFor.inviteCode })}
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
