import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../test/setup.js';
import AdminDashboard from './AdminDashboard.jsx';

const overview = {
  metrics: { players: 4, rounds: 8, onlineNow: 2, activeTables: 1 },
  results: { win: 5, loss: 2, push: 1 },
  dailyRounds: [{ _id: '2026-11-12', count: 4 }],
  tables: [{
    id: 't1',
    name: 'Green Room',
    visibility: 'public',
    mode: 'people',
    isSystem: true,
    players: 2,
    maxSeats: 5,
    status: 'waiting',
    seats: []
  }]
};

const players = [{
  id: 'p1',
  username: 'Mush',
  email: 'mush@example.com',
  role: 'player',
  createdAt: '2026-11-01T00:00:00.000Z'
}];

describe('AdminDashboard', () => {
  it('shows operational overview metrics and live tables', async () => {
    mockFetch([{ url: /\/api\/admin\/overview$/, body: overview }]);
    render(<AdminDashboard player={{ name: 'Admin', token: 'admin-token' }} onLogout={vi.fn()} />);

    expect(await screen.findByText('The club at a glance.')).toBeInTheDocument();
    expect(screen.getByText('Green Room')).toBeInTheDocument();
    expect(screen.getByText('Saved rounds over the last 7 days')).toBeInTheDocument();
  });

  it('loads player accounts and allows role selection', async () => {
    const fetch = mockFetch([
      { url: /\/api\/admin\/overview$/, body: overview },
      { url: /\/api\/admin\/players$/, body: players },
      {
        url: /\/api\/admin\/players\/p1\/role$/,
        method: 'PATCH',
        body: { ...players[0], role: 'admin' }
      }
    ]);
    const user = userEvent.setup();
    render(<AdminDashboard player={{ name: 'Admin', token: 'admin-token' }} onLogout={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Players' }));
    await user.click(await screen.findByRole('row', { name: /Mush mush@example\.com/ }));
    await user.selectOptions(screen.getByLabelText('Role'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Save role' }));

    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ role: 'admin' });
    expect(await screen.findByText('Account role updated.')).toBeInTheDocument();
  });
});
