// Blackjack rules shared by the browser (src/blackjack.js) and the server (backend/realtime/round.js).
// Change a rule here and both solo and multiplayer games follow it.
// Plain ES module with no imports, so Vite can bundle it and Node can require() it (Node 20.19+ / 22.12+).

export const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
export const SUITS = Object.freeze(['spades', 'hearts', 'clubs', 'diamonds']);

export function cardValue(rank) {
  if (!RANKS.includes(rank)) throw new Error(`Unknown card rank: ${rank}`);
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

// Aces count 11 until the hand would bust, then 1
export function scoreHand(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0, bust: total > 21, blackjack: cards.length === 2 && total === 21 };
}

// Dealer stands on all 17s, including soft 17
export function dealerShouldHit(cards) {
  return scoreHand(cards).total < 17;
}

// 'player' | 'dealer' | 'push'
export function compareHands(player, dealer) {
  const p = scoreHand(player);
  const d = scoreHand(dealer);
  if (p.bust) return 'dealer';
  if (d.bust) return 'player';
  if (p.blackjack !== d.blackjack) return p.blackjack ? 'player' : 'dealer';
  if (p.total === d.total) return 'push';
  return p.total > d.total ? 'player' : 'dealer';
}

// What a hand pays back, bet included: blackjack 3:2, win 1:1, push returns the bet
export function payoutFor(bet, result, cards) {
  if (result === 'player') return scoreHand(cards).blackjack ? bet * 2.5 : bet * 2;
  if (result === 'push') return bet;
  return 0;
}

export function isPair(cards) {
  return cards.length === 2 && cards[0].rank === cards[1].rank;
}
