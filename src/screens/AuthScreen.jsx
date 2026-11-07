import React, { useState } from 'react';
import Card, { WELCOME_CARDS } from '../components/Card.jsx';

export default function AuthScreen({ mode, setMode, onSuccess, onGuest }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:5000/api/auth/${mode === 'register' ? 'register' : 'login'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mode === 'register'
              ? { username, email, password }
              : { email, password }
          )
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong.');
      }

      onSuccess({
        type: 'registered',
        name: data.player.username,
        id: data.player.id,
        email: data.player.email,
        token: data.token
      });
    } catch (error) {
      setMessage(
        error.message === 'Failed to fetch'
          ? 'Cannot connect to the server. Make sure your backend is running.'
          : error.message
      );
    } finally {
      setLoading(false);
    }
  }

  // Layout from the Figma Login (3:659) and Sign up (3:711) frames
  return (
    <div className="auth-layout">
      <section className="auth-table" aria-hidden="true">
        <p className="auth-tagline">A good hand.<br />Better company.</p>
        <div className="auth-cards">
          <Card card={WELCOME_CARDS[0]} />
          <Card card={WELCOME_CARDS[1]} />
        </div>
      </section>

    <section className="panel auth-panel">
      <h1>{mode === 'register' ? 'Join the club.' : 'Welcome back.'}</h1>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <label>
            Username
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Choose your name"
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
          />
        </label>

        {message && <p className="form-error" role="alert">{message}</p>}

        <button className="primary wide" type="submit" disabled={loading}>
          {loading
            ? 'Please wait...'
            : mode === 'register'
              ? 'Create account'
              : 'Log in'}
        </button>
      </form>

      <button className="wide auth-guest" onClick={onGuest}>
        Play as guest
      </button>
      <p className="auth-note">Guest progress is saved for this session only.</p>

      <button
        className="wide auth-switch"
        onClick={() => {
          setMessage('');
          setMode(mode === 'login' ? 'register' : 'login');
        }}
      >
        {mode === 'login'
          ? 'New here? Create account'
          : 'Already a member? Log in'}
      </button>
      {mode === 'register' && (
        <p className="auth-note">Your account keeps your chips and game history.</p>
      )}
    </section>
    </div>
  );
}
