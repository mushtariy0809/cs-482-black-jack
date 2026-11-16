import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryScreen, { historyStats } from './HistoryScreen.jsx';
import { mockFetch } from '../test/setup.js';
import { deleteTable, getMyTables } from '../realtime/useTables.js';

vi.mock('../realtime/useTables.js', () => ({
  useTables: () => ({ tables: liveTables, connection: 'online' }),
  getMyTables: vi.fn(),
  deleteTable: vi.fn()
}));

let liveTables = [];
const player = { type: 'registered', id: 'p1', name: 'Mush' };
const url = 'http://localhost:5000/api/history/p1';
const now = new Date();
const today = hour => new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour).toISOString();

const hands = [
  {
    _id: 'g4', result: 'win', playerScore: 21, dealerScore: 17, createdAt: today(1), tableName: 'Friday Night',
    playerCards: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
    dealerCards: [{ rank: '9', suit: 'clubs' }, { rank: '8', suit: 'diamonds' }]
  },
  { _id: 'g3', result: 'win', playerScore: 20, dealerScore: 18, createdAt: today(0), tableName: 'The Green Room' },
  // Saved before tables and cards were recorded
  { _id: 'g2', result: 'loss', playerScore: 22, dealerScore: 19, createdAt: '2026-11-02T12:00:00Z' },
  { _id: 'g1', result: 'push', playerScore: 17, dealerScore: 17, createdAt: '2026-11-01T12:00:00Z' }
];

describe('HistoryScreen: hands', () => {
  it('shows stats, then hands grouped by day with their cards', async () => {
    mockFetch([{ url, body: hands }]);
    render(<HistoryScreen player={player} onBack={() => {}} />);

    const stats = await screen.findByLabelText('Your stats');
    expect(within(stats).getByText('4')).toBeInTheDocument();
    expect(within(stats).getByText('50%')).toBeInTheDocument();
    expect(within(stats).getByText('2–1–1')).toBeInTheDocument();

    const todayGroup = screen.getByRole('region', { name: 'Today' });
    expect(within(todayGroup).getByText(/Friday Night/)).toBeInTheDocument();
    expect(within(todayGroup).getByLabelText('A of spades')).toBeInTheDocument();
    expect(within(todayGroup).getByText('21 · Blackjack')).toBeInTheDocument();

    // Old hands still show their result and scores
    expect(screen.getByLabelText('You 22, dealer 19')).toBeInTheDocument();
    expect(screen.getByText('Push')).toBeInTheDocument();
  });

  it('filters by result and by table', async () => {
    const user = userEvent.setup();
    mockFetch([{ url, body: hands }]);
    render(<HistoryScreen player={player} onBack={() => {}} />);
    await screen.findByLabelText('Your stats');

    await user.click(screen.getByRole('button', { name: 'Losses' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Loss')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.selectOptions(screen.getByLabelText('Table'), 'Friday Night');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows an empty state', async () => {
    const onFindTable = vi.fn();
    const user = userEvent.setup();
    mockFetch([{ url, body: [] }]);
    render(<HistoryScreen player={player} onBack={() => {}} onFindTable={onFindTable} />);

    expect(await screen.findByText('No completed games yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Find a table/ }));
    expect(onFindTable).toHaveBeenCalled();
  });

  it('shows an error when history cannot load', async () => {
    mockFetch([{ url, status: 500, body: {} }]);
    render(<HistoryScreen player={player} onBack={() => {}} />);
    expect(await screen.findByText('Unable to load game history.')).toBeInTheDocument();
  });

  it('counts the best win streak in the order hands were played', () => {
    const results = ['win', 'win', 'loss', 'win', 'win', 'win', 'push'].reverse().map(result => ({ result }));
    expect(historyStats(results).bestStreak).toBe(3);
  });
});

describe('HistoryScreen: my tables', () => {
  const empty = { id: 't1', name: 'Hidden Den', visibility: 'private', hasPin: true, players: 0, maxSeats: 4, status: 'waiting', createdAt: Date.now(), inviteCode: 'ABC234', seatedHere: false, othersSeated: 0, canDelete: true };
  const busy = { ...empty, id: 't2', name: 'Busy Table', visibility: 'public', hasPin: false, players: 2, othersSeated: 2, canDelete: false };

  beforeEach(() => {
    vi.clearAllMocks();
    liveTables = [empty, busy];
    mockFetch([{ url, body: [] }]);
    getMyTables.mockResolvedValue({ ok: true, tables: [empty, busy] });
    deleteTable.mockResolvedValue({ ok: true, tableId: 't1' });
  });

  it('lists your tables; only empty ones can be deleted, after confirming', async () => {
    const user = userEvent.setup();
    render(<HistoryScreen player={player} onBack={() => {}} />);
    await user.click(screen.getByRole('tab', { name: 'My tables' }));

    const den = (await screen.findByText(/Hidden Den/)).closest('li');
    expect(within(den).getByText('Private · PIN')).toBeInTheDocument();
    expect(within(den).getByText('ABC234')).toBeInTheDocument();

    const busyRow = screen.getByText(/Busy Table/).closest('li');
    expect(within(busyRow).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(busyRow).getByText(/2 players are seated/)).toBeInTheDocument();

    await user.click(within(den).getByRole('button', { name: 'Delete' }));
    expect(deleteTable).not.toHaveBeenCalled();
    await user.click(within(den).getByRole('button', { name: 'Delete table' }));
    expect(deleteTable).toHaveBeenCalledWith('t1');
  });

  it('shows the server\'s reason when a delete is refused', async () => {
    deleteTable.mockResolvedValue({ ok: false, code: 'not_empty', message: '1 player is still seated. Tables can only be deleted when empty.' });
    const user = userEvent.setup();
    render(<HistoryScreen player={player} onBack={() => {}} />);
    await user.click(screen.getByRole('tab', { name: 'My tables' }));

    const den = (await screen.findByText(/Hidden Den/)).closest('li');
    await user.click(within(den).getByRole('button', { name: 'Delete' }));
    await user.click(within(den).getByRole('button', { name: 'Delete table' }));
    expect(await within(den).findByRole('alert')).toHaveTextContent('1 player is still seated');
  });
});
