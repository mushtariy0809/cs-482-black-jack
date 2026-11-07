import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

// No live server in tests: the lobby connection is a stub
vi.mock('./realtime/useTables.js', () => ({
  useTables: () => ({ tables: [], mySeat: null, tableState: null, offline: true, connection: 'connected', chatMessages: [] }),
  startTables: vi.fn(),
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

  it('a screen that needs a login falls back to the welcome screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    // Guests have no History button, so the header never offers it
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  });
});
