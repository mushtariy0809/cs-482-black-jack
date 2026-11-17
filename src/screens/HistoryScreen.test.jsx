import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryScreen from './HistoryScreen.jsx';
import { mockFetch } from '../test/setup.js';

const player = { type: 'registered', id: 'p1', name: 'Mush' };
const url = 'http://localhost:5000/api/history/p1';

describe('HistoryScreen', () => {
  it('lists past games with their result and scores', async () => {
    mockFetch([{
      url,
      body: [
        { _id: 'g1', result: 'win', playerScore: 20, dealerScore: 18, createdAt: '2026-11-01T12:00:00Z' },
        { _id: 'g2', result: 'loss', playerScore: 22, dealerScore: 19, createdAt: '2026-11-02T12:00:00Z' },
        { _id: 'g3', result: 'push', playerScore: 17, dealerScore: 17, createdAt: '2026-11-03T12:00:00Z' }
      ]
    }]);
    render(<HistoryScreen player={player} onBack={() => {}} />);

    expect(await screen.findByText('Win')).toBeInTheDocument();
    expect(screen.getByText('Loss')).toBeInTheDocument();
    expect(screen.getByText('Tie')).toBeInTheDocument();
    expect(screen.getByText('Your score: 20 · Dealer score: 18')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockFetch([{ url, body: [] }]);
    render(<HistoryScreen player={player} onBack={() => {}} />);
    expect(await screen.findByText('No completed games yet.')).toBeInTheDocument();
  });

  it('shows an error when history cannot load', async () => {
    mockFetch([{ url, status: 500, body: {} }]);
    render(<HistoryScreen player={player} onBack={() => {}} />);
    expect(await screen.findByText('Unable to load game history.')).toBeInTheDocument();
  });
});
