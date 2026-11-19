import { scoreHand } from '../blackjack.js';
import { API_URL } from '../apiUrl.js';

// 'player' | 'dealer' | 'push'  ->  what the history API stores
export function historyResult(result) {
  if (result === 'player') return 'win';
  if (result === 'dealer') return 'loss';
  return 'push';
}

// Just rank and suit: the History screen draws the cards from these
function plainCards(cards) {
  return cards.filter(card => card.rank && card.suit).map(card => ({ rank: card.rank, suit: card.suit }));
}

// Saves one finished hand for a registered player, once per round key.
// Used by both the solo game and shared multiplayer tables.
// savedKeys is a Set (kept in a ref) so a re-render never saves the same round twice.
export function saveHandToHistory({ player, key, result, playerCards, dealerCards, tableName = '', savedKeys }) {
  if (player?.type !== 'registered' || !player?.id || savedKeys.has(key)) return null;
  savedKeys.add(key);

  return fetch(`${API_URL}/api/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: player.id,
      result: historyResult(result),
      playerScore: scoreHand(playerCards).total,
      dealerScore: scoreHand(dealerCards).total,
      tableName,
      playerCards: plainCards(playerCards),
      dealerCards: plainCards(dealerCards)
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
