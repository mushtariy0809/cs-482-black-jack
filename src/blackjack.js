
export const RULES = Object.freeze({ dealerStandsOnSoft17: true });
const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export function cardValue(rank) {
  if (!ranks.includes(rank)) throw new Error(`Unknown card rank: ${rank}`);
  return rank === 'A' ? 11 : ['J','Q','K'].includes(rank) ? 10 : Number(rank);
}
export function scoreHand(cards) {
  let total = 0, aces = 0;
  for (const card of cards) { total += cardValue(card.rank); if (card.rank === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0, bust: total > 21, blackjack: cards.length === 2 && total === 21 };
}
export function createDeck() {
  return ['spades','hearts','clubs','diamonds'].flatMap(suit => ranks.map(rank => ({ rank, suit, id: `${rank}-${suit}` })));
}
export function shuffleDeck(deck, random = Math.random) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
export function dealerShouldHit(cards) { return scoreHand(cards).total < 17; }
export function compareHands(player, dealer) {
  const p = scoreHand(player), d = scoreHand(dealer);
  if (p.bust) return 'dealer';
  if (d.bust) return 'player';
  if (p.blackjack !== d.blackjack) return p.blackjack ? 'player' : 'dealer';
  return p.total === d.total ? 'push' : p.total > d.total ? 'player' : 'dealer';
}

export function startGame(initialMoney = 1000) { 
  return {deck: shuffleDeck(createDeck()), player: [], dealer: [], phase: 'ready', result: null, money: initialMoney};} //U4: Adding initial money and also showing the count

  export function dealRound(game) {
export function startGame() { return {roundId: crypto.randomUUID(), deck: shuffleDeck(createDeck()), player: [], dealer: [], phase: 'ready', result: null }; }
export function dealRound(game) {

  if (game.phase !== 'ready') throw new Error('Start a fresh game before dealing.');
  if (game.deck.length < 4) throw new Error('Not enough cards to deal.');
  const deck = [...game.deck];
  const player = [deck.pop()], 
  dealer = [deck.pop()];
  player.push(deck.pop()); dealer.push(deck.pop());
  const finished = scoreHand(player).blackjack || scoreHand(dealer).blackjack;
  return { roundId: game.roundId, deck, player, dealer, phase: finished ? 'finished' : 'player', result: finished ? compareHands(player, dealer) : null };
}

export function stand(game) {
  if (game.phase !== 'player') return game;
  const deck = [...game.deck], dealer = [...game.dealer];
  while (dealerShouldHit(dealer)) { if (!deck.length) throw new Error('Deck exhausted.'); dealer.push(deck.pop()); }
  return { ...game, deck, dealer, phase: 'finished', result: compareHands(game.player, dealer) };
}

export function hit(game) {
  if (game.phase !== 'player') return game;
  if (!game.deck.length) throw new Error('Deck exhausted.');
  const deck = [...game.deck], player = [...game.player, deck.pop()];
  const next = { ...game, deck, player };
  if (scoreHand(player).bust) return { ...next, phase: 'finished', result: 'dealer' };
  return scoreHand(player).total === 21 ? stand(next) : next;
}
