import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthScreen from './AuthScreen.jsx';
import { mockFetch } from '../test/setup.js';

function renderAuth(startMode = 'login') {
  const onSuccess = vi.fn();
  const onGuest = vi.fn();
  function Wrapper() {
    const [mode, setMode] = useState(startMode);
    return <AuthScreen mode={mode} setMode={setMode} onSuccess={onSuccess} onGuest={onGuest} />;
  }
  render(<Wrapper />);
  return { onSuccess, onGuest, user: userEvent.setup() };
}

const loggedIn = { token: 'jwt', player: { id: 'p1', username: 'mush', email: 'm@x.com' } };

describe('AuthScreen', () => {
  it('logs in with email and password and hands back the player', async () => {
    const fetch = mockFetch([{ url: 'http://localhost:5000/api/auth/login', method: 'POST', body: loggedIn }]);
    const { onSuccess, user } = renderAuth();

    await user.type(screen.getByLabelText('Email'), 'm@x.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: 'm@x.com', password: 'secret123' });
    expect(onSuccess).toHaveBeenCalledWith({ type: 'registered', name: 'mush', id: 'p1', email: 'm@x.com', token: 'jwt' });
  });

  it('registers with a username after switching to sign up', async () => {
    const fetch = mockFetch([{ url: 'http://localhost:5000/api/auth/register', method: 'POST', body: loggedIn }]);
    const { onSuccess, user } = renderAuth();

    await user.click(screen.getByRole('button', { name: 'New here? Create account' }));
    expect(screen.getByRole('heading', { name: 'Join the club.' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Username'), 'mush');
    await user.type(screen.getByLabelText('Email'), 'm@x.com');
    await user.type(screen.getByLabelText('Password'), 'longpassword');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ username: 'mush', email: 'm@x.com', password: 'longpassword' });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows the server message when login fails', async () => {
    mockFetch([{ url: /auth\/login$/, method: 'POST', status: 401, body: { message: 'Invalid email or password.' } }]);
    const { onSuccess, user } = renderAuth();

    await user.type(screen.getByLabelText('Email'), 'm@x.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('explains when the backend is not running', async () => {
    mockFetch([{ url: /auth\/login$/, method: 'POST', networkError: true }]);
    const { user } = renderAuth();

    await user.type(screen.getByLabelText('Email'), 'm@x.com');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Make sure your backend is running');
  });

  it('lets the player continue as a guest', async () => {
    const { onGuest, user } = renderAuth();
    await user.click(screen.getByRole('button', { name: 'Play as guest' }));
    expect(onGuest).toHaveBeenCalled();
  });
});
