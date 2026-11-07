import { useEffect } from 'react';
import { setInHand, useTables } from '../realtime/useTables.js';

function totalBet(hands) {
  return hands.reduce((sum, hand) => sum + hand.bet, 0);
}

const SHARED_HAND_PHASES = ['playing', 'dealer'];

// Is a hand in progress? (the lobby shows the table as "In game", and leaving costs the bet)
function sharedHandInProgress(seat, state) {
  return Boolean(seat?.hands.length) && SHARED_HAND_PHASES.includes(state?.phase);
}

function soloHandInProgress(screen, game) {
  return screen === 'game' && Boolean(game) && game.phase !== 'ready' && game.phase !== 'finished';
}

// Chips lost when leaving mid-hand
function soloStake(game) {
  if (!game) return 0;
  return (game.hands && totalBet(game.hands)) || game.bet || 0;
}

// Everything App needs to know about the table the player sits at.
//
// Multiplayer tables are run by the server (one shared deck, dealer and turn order).
// Solo Practice, and demo mode while the server is down, play the local game in src/blackjack.js.
export function useTableSession({ table, screen, game }) {
  const { tables, mySeat, tableState: liveTable, offline } = useTables();

  const live = table ? tables.find(t => t.id === table.id) ?? table : null;
  const shared = Boolean(table) && !table.solo && !offline;
  const sharedState = shared && liveTable?.tableId === table.id ? liveTable : null;
  const mySharedSeat = sharedState?.seats.find(s => s.index === mySeat?.seat) ?? null;

  const inHand = shared ? sharedHandInProgress(mySharedSeat, sharedState) : soloHandInProgress(screen, game);

  // Shared tables: the server already knows. Solo tables tell it.
  useEffect(() => {
    if (table && !shared) setInHand(inHand);
  }, [inHand, table, shared]);

  const stake = shared ? totalBet(mySharedSeat?.hands ?? []) : soloStake(game);

  return { live, mySeat, offline, shared, sharedState, mySharedSeat, inHand, stake };
}
