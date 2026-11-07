import { scoreHand } from '../blackjack.js';

// 'player' | 'dealer' | 'push'  ->  what the history API stores
export function historyResult(result) {
  if (result === 'player') return 'win';
  if (result === 'dealer') return 'loss';
  return 'push';
}

// Saves one finished hand for a registered player, once per round key.
// Used by both the solo game and shared multiplayer tables.
// savedKeys is a Set (kept in a ref) so a re-render never saves the same round twice.
export function saveHandToHistory({ player, key, result, playerCards, dealerCards, savedKeys }) {
  if (player?.type !== 'registered' || !player?.id || savedKeys.has(key)) return null;
  savedKeys.add(key);

  return fetch('http://localhost:5000/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: player.id,
      result: historyResult(result),
      playerScore: scoreHand(playerCards).total,
      dealerScore: scoreHand(dealerCards).total
    })
  })
    .then(response => {
      if (!response.ok) throw new Error('Could not save game history.');
    })
    .catch(error => {
      // Let a later render try again
      savedKeys.delete(key);
      console.error('History error:', error);
    });
}
