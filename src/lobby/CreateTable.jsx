import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { createTable } from '../realtime/useTables.js';
import { StatusBadge, TableIcons } from './tableInfo.jsx';
import { saveLastTable } from './lastTable.js';
import './lobby.css';

// Figma "Table setup" (3:78). Public tables only this iteration:
// private tables, passwords and invite codes come next iteration.
const DEFAULT_BETS = { minBet: 10, maxBet: 500 };
const MAX_SEATS = 5;

function nameProblem(name) {
  const clean = name.trim();
  if (clean.length === 0) return 'Give your table a name.';
  if (clean.length < 3) return 'Table name must be at least 3 characters.';
  if (clean.length > 30) return 'Table name must be 30 characters or less.';
  return '';
}

function Choice({ label, options, value, onChange }) {
  return (
    <fieldset className="setup-choice">
      <legend>{label}</legend>
      <div className="setup-options">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'primary' : ''}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// onCreated(result) gets the server reply: { table, seat, role }
export default function CreateTable({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('people');
  const [seat, setSeat] = useState('player');
  const [touched, setTouched] = useState(false);
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  // Skip on touch screens, where focusing pops the keyboard over the form
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) input.current?.focus();
  }, []);

  const localProblem = nameProblem(name);
  const shownNameError = nameError || (touched ? localProblem : '');

  async function submit(event) {
    event.preventDefault();
    setTouched(true);
    setFormError('');
    if (localProblem) {
      input.current?.focus();
      return;
    }

    setBusy(true);
    const result = await createTable({ name: name.trim(), mode, seat });
    setBusy(false);

    if (!result.ok) {
      if (['invalid_name', 'duplicate_name'].includes(result.code)) {
        setNameError(result.message);
        input.current?.focus();
      } else {
        setFormError(result.message);
      }
      return;
    }

    saveLastTable(result.table.id);
    onCreated(result);
  }

  // What the table will look like in the lobby
  const preview = {
    name: name.trim() || 'Your table',
    visibility: 'public',
    mode,
    players: seat === 'player' ? 1 : 0,
    status: 'waiting',
    ...DEFAULT_BETS
  };

  return (
    <motion.div
      className="table-setup"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="setup-title">
        <button type="button" className="setup-back" onClick={onCancel}>‹ Lobby</button>
        <h1>Your table. Your people.</h1>
      </div>

      <div className="setup-layout">
        <form className="panel setup-form" onSubmit={submit} noValidate>
          <label className="setup-field">
            <span className="setup-label-row">
              Table name
              <span className="setup-count" aria-hidden="true">{name.trim().length} / 30</span>
            </span>
            <input
              ref={input}
              value={name}
              maxLength={40}
              placeholder="Friday Night Club"
              onChange={event => {
                setName(event.target.value);
                setNameError('');
              }}
              // Only complain about an empty name on submit, not just for clicking away
              onBlur={() => {
                if (name) setTouched(true);
              }}
              aria-invalid={Boolean(shownNameError)}
              aria-describedby={shownNameError ? 'table-name-error' : undefined}
            />
            {shownNameError && (
              <span id="table-name-error" className="form-error" role="alert">{shownNameError}</span>
            )}
          </label>

          <Choice
            label="Players"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'people', label: 'People' },
              { value: 'bots', label: 'Bots' }
            ]}
          />

          <Choice
            label="Your seat"
            value={seat}
            onChange={setSeat}
            options={[
              { value: 'player', label: 'Player' },
              { value: 'dealer', label: 'Dealer' }
            ]}
          />

          {formError && <p className="form-error" role="alert">{formError}</p>}

          <button type="submit" className="primary wide setup-submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create table →'}
          </button>
        </form>

        <aside className="panel setup-preview" aria-label="Lobby preview">
          <h2>In the lobby</h2>
          <div className="preview-slide">
            <img src="/assets/imgTable.png" alt="" />
            <div className="slide-info">
              <div className="slide-heading">
                <h3>{preview.name}</h3>
                <TableIcons table={preview} />
              </div>
              <p className="slide-meta">
                <span>{preview.players} / {MAX_SEATS} players</span>
                <span aria-hidden="true">·</span>
                <span>Bets {preview.minBet} – {preview.maxBet}</span>
              </p>
              <StatusBadge status={preview.status} />
            </div>
          </div>
          <p className="setup-hint">
            Public table · anyone in the lobby can join. Up to {MAX_SEATS} players plus the dealer.
          </p>
        </aside>
      </div>
    </motion.div>
  );
}
