import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createTable } from '../realtime/useTables.js';
import { StatusBadge, TableIcons } from './tableInfo.jsx';
import { saveLastTable } from './lastTable.js';
import './lobby.css';

// Figma "Table setup" (3:78).
// T1: public tables are listed in the lobby; private ones are hidden and joined
// with the invite link or code, plus an optional 4–6 digit PIN.
// The dealer is always a bot and bots never take a player seat.
const DEFAULT_BETS = { minBet: 10, maxBet: 500 };
const SEAT_CHOICES = [2, 3, 4, 5, 6, 7];
const DEFAULT_SEATS = 5;

function nameProblem(name) {
  const clean = name.trim();
  if (clean.length === 0) return 'Give your table a name.';
  if (clean.length < 3) return 'Table name must be at least 3 characters.';
  if (clean.length > 30) return 'Table name must be 30 characters or less.';
  return '';
}

function pinProblem(pin) {
  if (pin.length === 0) return 'Pick a PIN, or turn the PIN off.';
  if (pin.length < 4) return 'The PIN needs at least 4 digits.';
  return '';
}

// options: [{ value, label, hint? }]
function Choice({ label, options, value, onChange, className = '' }) {
  return (
    <fieldset className="setup-choice">
      <legend>{label}</legend>
      <div className={`setup-options ${className}`}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'primary' : ''}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="setup-option-label">{option.label}</span>
            {option.hint && <span className="setup-option-hint">{option.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Private tables only: an optional PIN on top of the invite link
function PinField({ usePin, setUsePin, pin, setPin, error, inputRef }) {
  const [showPin, setShowPin] = useState(false);

  return (
    <div className="setup-pin">
      <label className="setup-switch">
        <input
          type="checkbox"
          role="switch"
          checked={usePin}
          onChange={event => setUsePin(event.target.checked)}
        />
        <span className="setup-switch-track" aria-hidden="true"><span /></span>
        <span>
          <strong>Require a PIN to join</strong>
          <span className="setup-switch-hint">Friends with the link also type this PIN.</span>
        </span>
      </label>

      <AnimatePresence initial={false}>
        {usePin && (
          <motion.label
            className="setup-field setup-pin-field"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="setup-label-row">
              PIN
              <span className="setup-count" aria-hidden="true">4–6 digits</span>
            </span>
            <span className="setup-pin-row">
              <input
                ref={inputRef}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                placeholder="••••"
                // Digits only, so a stray letter never makes the PIN invalid
                onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'table-pin-error' : undefined}
              />
              <button type="button" className="setup-pin-toggle" onClick={() => setShowPin(!showPin)}>
                {showPin ? 'Hide' : 'Show'}
              </button>
            </span>
            {error && <span id="table-pin-error" className="form-error" role="alert">{error}</span>}
          </motion.label>
        )}
      </AnimatePresence>
    </div>
  );
}

// onCreated(result, { pin }) gets the server reply ({ table, inviteCode, seat })
// and the PIN, so the invite panel can remind the creator what they picked.
// The creator always sits as a player.
export default function CreateTable({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState('');
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const [touched, setTouched] = useState(false);
  const [nameError, setNameError] = useState('');
  const [pinError, setPinError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const pinInput = useRef(null);

  // Skip on touch screens, where focusing pops the keyboard over the form
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) input.current?.focus();
  }, []);

  const isPrivate = visibility === 'private';
  const withPin = isPrivate && usePin;
  const localProblem = nameProblem(name);
  const shownNameError = nameError || (touched ? localProblem : '');
  const shownPinError = pinError || (touched && withPin ? pinProblem(pin) : '');

  async function submit(event) {
    event.preventDefault();
    setTouched(true);
    setFormError('');
    if (localProblem) {
      input.current?.focus();
      return;
    }
    if (withPin && pinProblem(pin)) {
      pinInput.current?.focus();
      return;
    }

    setBusy(true);
    const result = await createTable({
      name: name.trim(),
      visibility,
      password: withPin ? pin : undefined,
      maxSeats: seats
    });
    setBusy(false);

    if (!result.ok) {
      if (['invalid_name', 'duplicate_name'].includes(result.code)) {
        setNameError(result.message);
        input.current?.focus();
      } else if (result.code === 'invalid_pin') {
        setPinError(result.message);
        pinInput.current?.focus();
      } else {
        setFormError(result.message);
      }
      return;
    }

    saveLastTable(result.table.id);
    onCreated(result, { pin: withPin ? pin : '' });
  }

  // What the table will look like in the lobby
  const preview = {
    name: name.trim() || 'Your table',
    visibility,
    hasPin: withPin,
    mode: 'people',
    players: 1,
    status: 'waiting',
    ...DEFAULT_BETS
  };

  let hint = `Public table · anyone in the lobby can join.`;
  if (isPrivate) {
    hint = withPin
      ? 'Private table · hidden from the lobby. Friends need your invite link and the PIN.'
      : 'Private table · hidden from the lobby. Only people with your invite link can join.';
  }

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
            label="Who can join"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'public', label: 'Public', hint: 'Listed in the lobby' },
              { value: 'private', label: 'Private', hint: 'Invite link only' }
            ]}
          />

          {isPrivate && (
            <PinField
              usePin={usePin}
              setUsePin={value => {
                setUsePin(value);
                setPinError('');
              }}
              pin={pin}
              setPin={value => {
                setPin(value);
                setPinError('');
              }}
              error={shownPinError}
              inputRef={pinInput}
            />
          )}

          <Choice
            label="Players"
            className="seat-options"
            value={seats}
            onChange={setSeats}
            options={SEAT_CHOICES.map(n => ({ value: n, label: String(n) }))}
          />
          <p className="setup-hint setup-seat-hint">
            {seats} player seats + 1 bot dealer. Bots only ever deal.
          </p>

          {formError && <p className="form-error" role="alert">{formError}</p>}

          <button type="submit" className="primary wide setup-submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create table →'}
          </button>
        </form>

        <aside className="panel setup-preview" aria-label="Lobby preview">
          <h2>{isPrivate ? 'Your invite' : 'In the lobby'}</h2>
          <div className="preview-slide">
            <img src="/assets/imgTable.png" alt="" />
            <div className="slide-info">
              <div className="slide-heading">
                <h3>{preview.name}</h3>
                <TableIcons table={preview} />
              </div>
              <p className="slide-meta">
                <span>{preview.players} / {seats} players</span>
                <span aria-hidden="true">·</span>
                <span>Bets {preview.minBet} – {preview.maxBet}</span>
              </p>
              <StatusBadge status={preview.status} />
            </div>
          </div>
          <p className="setup-hint">{hint}</p>
        </aside>
      </div>
    </motion.div>
  );
}
