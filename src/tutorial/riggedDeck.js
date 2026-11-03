import { createDeck, startGame } from '../blackjack.js';

// The tutorial's scripted hand, in the order the cards come out:
// player, dealer, player, dealer (hidden), the player's hit, the dealer's draw.
// Player: 7 + 5 = 12 -> hit 7 -> 19. Dealer: 10 + 6 = 16 -> must draw -> 2 -> 18. Player wins.
export const TUTORIAL_CARDS = [
  ['7', 'hearts'],
  ['10', 'spades'],
  ['5', 'diamonds'],
  ['6', 'clubs'],
  ['7', 'spades'],
  ['2', 'hearts']
];

// A normal game (real rules from blackjack.js) with the deck stacked for the lesson
export function startTutorialGame() {
  const full = createDeck();
  const scripted = TUTORIAL_CARDS.map(([rank, suit]) => full.find(c => c.rank === rank && c.suit === suit));
  const rest = full.filter(c => !scripted.includes(c));
  // dealRound/hit/stand take cards from the end of the deck
  return { ...startGame(1000), deck: [...rest, ...scripted.reverse()] };
}
