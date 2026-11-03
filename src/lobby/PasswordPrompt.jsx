import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LockIcon } from './tableInfo.jsx';

// Asks for a private table's password. onSubmit resolves to an error message or null.
export default function PasswordPrompt({ table, onSubmit, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  // Runs once: live table updates re-render the lobby and must not steal focus
  useEffect(() => {
    input.current?.focus();
    function onKey(event) {
      if (event.key === 'Escape') cancel.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!password) {
      setError('Enter the table password.');
      return;
    }
    setBusy(true);
    const message = await onSubmit(password);
    setBusy(false);
    if (message) {
      setError(message);
      input.current?.select();
    }
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
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
          Password
          <input
            ref={input}
            type="password"
            value={password}
            onChange={event => {
              setPassword(event.target.value);
              setError('');
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'password-error' : undefined}
          />
        </label>
        {error && <p id="password-error" className="form-error" role="alert">{error}</p>}
        <div className="prompt-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Joining…' : 'Join Table'}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
