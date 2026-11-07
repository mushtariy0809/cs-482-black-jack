import React, { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SoloGame, { scoreSuffix } from './SoloGame.jsx';
import { startGame } from '../blackjack.js';
import { mockFetch } from '../test/setup.js';

const card = (rank, suit = 'clubs', n = 0) => ({ rank, suit, id: `${rank}-${suit}-${n}` });

// A game in the player's turn with the given hand and dealer cards
function playingGame({ player, dealer = [card('9'), card('7')], money = 990, bet = 10 }) {
  return {
    ...startGame(1000),
    phase: 'player',
    player,
    dealer,
    hands: [{ cards: player, bet }],
    activeHandIndex: 0,
    money,
    bet,
    deck: [card('2', 'hearts', 1), card('3', 'hearts', 1), card('4', 'hearts', 1)]
  };
}

// Renders SoloGame with real state, so clicks change what is shown
function renderGame(initialGame, { player = null, startBet = 10 } = {}) {
  const changes = [];
  function Wrapper() {
    const [game, setGameState] = useState(initialGame);
    const [bet, setBet] = useState(startBet);
    const historySaved = useRef(new Set());
    const setGame = next => {
      changes.push(next);
      setGameState(next);
    };
    return <SoloGame game={game} setGame={setGame} player={player} historySaved={historySaved} bet={bet} setBet={setBet} timeLeft={30} />;
  }
  render(<Wrapper />);
  return { changes, user: userEvent.setup() };
}

describe('scoreSuffix', () => {
  it('describes a hand the way the score pill shows it', () => {
    expect(scoreSuffix([])).toBe('');
    expect(scoreSuffix([card('A'), card('K')])).toBe(' · 21 · Blackjack');
    expect(scoreSuffix([card('K'), card('Q'), card('5')])).toBe(' · 25 · Bust');
    expect(scoreSuffix([card('A'), card('6')])).toBe(' · 17 · Soft');
    expect(scoreSuffix([card('10'), card('7')])).toBe(' · 17');
  });
});

describe('SoloGame', () => {
  it('lets the player pick a bet and deal', async () => {
    const { changes, user } = renderGame(startGame(1000));

    expect(screen.getByRole('status')).toHaveTextContent('Your table is ready.');
    await user.click(screen.getByRole('button', { name: 'Bet 50' }));
    expect(screen.getByRole('button', { name: 'Bet 50' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Deal (50)' }));
    expect(changes.at(-1).bet).toBe(50);
    expect(changes.at(-1).money).toBeLessThanOrEqual(950 + 125);
  });

  it('disables chips the player cannot afford', () => {
    renderGame(startGame(20));
    expect(screen.getByRole('button', { name: 'Bet 25' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bet 5' })).toBeEnabled();
  });

  it('only allows a split on a pair', () => {
    renderGame(playingGame({ player: [card('8'), card('8', 'hearts')] }));
    expect(screen.getByRole('button', { name: 'Split' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Double' })).toBeEnabled();
  });

  it('blocks split on two different cards, and double when the player cannot cover it', () => {
    renderGame(playingGame({ player: [card('8'), card('9')], money: 5 }));
    expect(screen.getByRole('button', { name: 'Split' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Double' })).toBeDisabled();
  });

  it('hides the dealer hole card and shows the timer during the player turn', () => {
    renderGame(playingGame({ player: [card('10'), card('6')] }));
    expect(screen.getByText(/Dealer · 9 \+ \?/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your turn – 30s');
  });

  it('standing ends the round and shows the result', async () => {
    const { user } = renderGame(playingGame({ player: [card('10'), card('9')], dealer: [card('10', 'spades'), card('8', 'spades')] }));
    await user.click(screen.getByRole('button', { name: 'Stand' }));

    expect(screen.getByRole('status')).toHaveTextContent('You win.');
    expect(screen.getByRole('button', { name: 'Start a fresh game' })).toBeInTheDocument();
  });

  it('a bust pauses on the new card before the round finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const game = playingGame({ player: [card('K'), card('Q')] });
    // Last card goes to the player (bust); the dealer then draws the other one
    game.deck = [card('4', 'hearts', 2), card('5', 'hearts', 1)];
    const { changes, user } = renderGame(game);

    await user.click(screen.getByRole('button', { name: 'Hit' }));
    expect(changes.at(-1).phase).toBe('player');

    vi.advanceTimersByTime(900);
    await waitFor(() => expect(changes.at(-1).phase).toBe('finished'));
    vi.useRealTimers();
  });

  it('saves a finished round to history once for a registered player', async () => {
    const fetch = mockFetch([{ url: 'http://localhost:5000/api/history', method: 'POST', body: {} }]);
    const finished = { ...playingGame({ player: [card('10'), card('9')] }), phase: 'finished', result: 'player' };
    renderGame(finished, { player: { type: 'registered', id: 'p1', name: 'Mush' } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ playerId: 'p1', result: 'win', playerScore: 19, dealerScore: 16 });
  });

  it('never saves history for guests', () => {
    const fetch = mockFetch([]);
    const finished = { ...playingGame({ player: [card('10'), card('9')] }), phase: 'finished', result: 'dealer' };
    renderGame(finished, { player: { type: 'guest', name: 'Guest' } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
