import React, { useState } from 'react';
import { cancelOnBackdrop, useDialogFocus } from '../components/useDismiss.js';
import { motion } from 'framer-motion';
import { LockIcon } from './tableInfo.jsx';

// Asks for a private table's PIN (4–6 digits). onSubmit resolves to an error message or null.
// fixed: cover the whole screen (invite popups) instead of just the lobby's table picker.
export default function PasswordPrompt({ table, onSubmit, onCancel, fixed = false }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Focuses once: live table updates re-render the lobby and must not steal focus
  const input = useDialogFocus(onCancel);

  async function submit(event) {
    event.preventDefault();
    if (pin.length < 4) {
      setError('Enter the 4–6 digit PIN.');
      return;
    }
    setBusy(true);
    const message = await onSubmit(pin);
    setBusy(false);
    if (message) {
      setError(message);
      input.current?.select();
    }
  }

  return (
    <motion.div
      className={'modal-backdrop' + (fixed ? ' is-fixed' : '')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={cancelOnBackdrop(onCancel)}
    >
      <motion.form
        className="panel password-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
        onSubmit={submit}
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
      >
        <span className="eyebrow"><LockIcon /> PRIVATE TABLE</span>
        <h2 id="password-title">{table.name}</h2>
        <label>
          Table PIN
          <input
            ref={input}
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="••••"
            value={pin}
            onChange={event => {
              setPin(event.target.value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'password-error' : 'password-help'}
          />
        </label>
        {error
          ? <p id="password-error" className="form-error" role="alert">{error}</p>
          : <p id="password-help" className="prompt-help">Ask the person who invited you for the PIN.</p>}
        <div className="prompt-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Joining…' : 'Join Table'}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
