import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { mockFetch } from './test/setup.js';
import { startTables, stopTables } from './realtime/useTables.js';

// No live server in tests: the lobby connection is a stub
vi.mock('./realtime/useTables.js', () => ({
  useTables: () => ({ tables: [], mySeat: null, tableState: null, offline: true, connection: 'connected', chatMessages: [], invites: [] }),
  getAdStatus: vi.fn(async () => ({ ok: true, status: { reward: 100, perDay: 5, watchedToday: 0, remaining: 5, nextAt: null } })),
  startAd: vi.fn(),
  completeAd: vi.fn(),
  abandonAd: vi.fn(),
  dismissInvite: vi.fn(),
  startTables: vi.fn(),
  stopTables: vi.fn(),
  leaveTable: vi.fn(),
  joinTable: vi.fn(async () => ({ ok: true })),
  createTable: vi.fn(),
  setChipsHint: vi.fn(),
  setInHand: vi.fn(),
  sendTableChat: vi.fn(),
  sendPrivateTableChat: vi.fn()
}));
vi.mock('./lobby/Lobby.jsx', () => ({ default: () => <p>Lobby screen</p> }));

describe('App navigation', () => {
  it('opens on the welcome screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'A good hand. Better company.' })).toBeInTheDocument();
  });

  it('Start the game asks a new visitor to log in', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start the game' }));
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
  });

  it('Continue as Guest goes to the lobby with chips shown', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    expect(await screen.findByText('Lobby screen')).toBeInTheDocument();
    expect(screen.getByText('1,000 chips')).toBeInTheDocument();
  });

  it('routes an admin login to the admin dashboard, not the player lobby', async () => {
    vi.clearAllMocks();
    mockFetch([
      {
        url: 'http://localhost:5000/api/auth/login',
        method: 'POST',
        body: {
          token: 'admin-token',
          player: {
            id: 'admin-id',
            username: 'ClubAdmin',
            email: 'admin@example.com',
            role: 'admin'
          }
        }
      },
      {
        url: /\/api\/admin\/overview$/,
        body: {
          metrics: { players: 2, rounds: 0, onlineNow: 0, activeTables: 0 },
          results: { win: 0, loss: 0, push: 0 },
          dailyRounds: [],
          tables: []
        }
      }
    ]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Start the game' }));
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'secure-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('The club at a glance.')).toBeInTheDocument();
    expect(screen.queryByText('Lobby screen')).not.toBeInTheDocument();
    expect(stopTables).toHaveBeenCalled();
    expect(startTables).not.toHaveBeenCalled();
  });

  it('a screen that needs a login falls back to the welcome screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    // Guests have no History button, so the header never offers it
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  });
});
