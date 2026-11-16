import React, { useState } from 'react';

// "Have a code?" box in the lobby toolbar (U1): join a table, including a hidden
// private one, with the 6-character invite code a friend shared.
// onSubmit(code) resolves to an error message, or null.
export default function CodeJoin({ onSubmit }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      setError('Invite codes have 6 characters.');
      return;
    }
    setBusy(true);
    const message = await onSubmit(clean);
    setBusy(false);
    setError(message ?? '');
    if (!message) setCode('');
  }

  return (
    <form className="code-join" onSubmit={submit} aria-label="Join with an invite code">
      <input
        value={code}
        maxLength={6}
        placeholder="Have a code?"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck="false"
        aria-label="Invite code"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'code-join-error' : undefined}
        onChange={event => {
          setCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase());
          setError('');
        }}
      />
      <button type="submit" disabled={busy || !code}>{busy ? 'Finding…' : 'Join'}</button>
      {error && <span id="code-join-error" className="form-error" role="alert">{error}</span>}
    </form>
  );
}
