import { RANKS, SUITS, cardValue, scoreHand, dealerShouldHit, compareHands, payoutFor, isPair } from '../shared/rules.js';

// The rules themselves live in shared/rules.js so the server's multiplayer round uses the exact same ones
export { cardValue, scoreHand, dealerShouldHit, compareHands, isPair };

export const RULES = Object.freeze({ dealerStandsOnSoft17: true });

export function createDeck() {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit, id: `${rank}-${suit}` })));
}

export function shuffleDeck(deck, random = Math.random) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

// Balance after a hand settles (the bet was already taken when it was dealt)
export function resolvePayout(money, bet, result, player) {
  return money + payoutFor(bet, result, player);
}

export function startGame(initialMoney = 1000) { 
  return {
    roundId: crypto.randomUUID(), 
    deck: shuffleDeck(createDeck()),
    hands: [], 
    player: [], 
    dealer: [], 
    phase: 'ready', 
    result: null, 
    money: initialMoney,
    bet: 0,
    activeHandIndex: 0
  };
}

export function dealRound(game, betAmount = 10) {
  if (game.phase !== 'ready') throw new Error('Start a fresh game before dealing.');
  if (game.deck.length < 4) throw new Error('Not enough cards to deal.');
  const currentMoney = game.money !== undefined ? game.money : 1000;
  const wager = Math.min(betAmount, currentMoney);
  const deck = [...game.deck];
  const player = [deck.pop()], 
  dealer = [deck.pop()];
  player.push(deck.pop()); dealer.push(deck.pop());

  const finished = scoreHand(player).blackjack || scoreHand(dealer).blackjack;
  const result = finished ? compareHands(player, dealer) : null;
  const moneyAfterDeal = finished ? resolvePayout(currentMoney - wager, wager, result, player) : currentMoney - wager;

  return { 
    ...game,
    money: moneyAfterDeal,
    bet: wager,
    deck, 
    hands: [{ cards: player, bet: wager}],
    player: player, 
    dealer: dealer, 
    activeHandIndex: 0,
    phase: finished ? 'finished' : 'player', 
    result 
  };
}

export function advanceTurnOrFinish(game, updatedHands){
  const nextIndex = game.activeHandIndex + 1;
  if (nextIndex < updatedHands.length) {
    return {
      ...game,
      hands: updatedHands,
      activeHandIndex: nextIndex,
      player: updatedHands[nextIndex].cards
    };  
  } 
  else {
    const deck = [...game.deck], dealer = [...game.dealer];
    while(dealerShouldHit(dealer)){
      if (!deck.length) throw new Error('Deck exhausted.');
      dealer.push(deck.pop());
    }

    let finalMoney = game.money;
    updatedHands.forEach(hand => {
      const res = compareHands(hand.cards, dealer);
      finalMoney = resolvePayout(finalMoney, hand.bet, res, hand.cards);
    });

    const primaryResult = compareHands(updatedHands[0].cards, dealer);

    return{
      ...game,
      money: finalMoney,
      deck,
      dealer,
      hands: updatedHands,
      phase: 'finished',
      result: primaryResult,
      player: updatedHands[0].cards
    }
  }
}

export function stand(game) {
  if (game.phase !== 'player') return game;

  return advanceTurnOrFinish(game, game.hands);

}

export function hit(game) {
  if (game.phase !== 'player') return game;
  if (!game.deck.length) throw new Error('Deck exhausted.');
  const deck = [...game.deck];
  const hands = [...game.hands];
  const currentHand ={ ...hands[game.activeHandIndex]};

  currentHand.cards = [...currentHand.cards, deck.pop()];
  hands[game.activeHandIndex] = currentHand;

  const pScore = scoreHand(currentHand.cards);
  if (pScore.bust || pScore.total === 21) {
    return advanceTurnOrFinish({ ...game, deck}, hands);
  }

  return {
    ...game,
    deck,
    hands,
    player: currentHand.cards
  };

}

export function doubleDown(game) {
  if (game.phase !== 'player') return game;

  const currentHand = game.hands[game.activeHandIndex];
  if (currentHand.cards.length !== 2 || game.money < currentHand.bet) return game;
  if (!game.deck.length) throw new Error('Deck exhausted.');


  const deck = [...game.deck];
  const hands = [...game.hands];
  const updatedHand = {
    ...currentHand,
    cards: [...currentHand.cards, deck.pop()],
    bet: currentHand.bet * 2
  };

  hands[game.activeHandIndex] = updatedHand;

  const newMoney = game.money - currentHand.bet;
  return advanceTurnOrFinish({ ...game, money: newMoney, deck }, hands);

}

export function splitHand(game){
  if (game.phase !== 'player') return game;
  const currentHand = game.hands[game.activeHandIndex];
  if(currentHand.cards.length !== 2) return game;
  if(currentHand.cards[0].rank !== currentHand.cards[1].rank) return game;
  if(game.money < currentHand.bet) return game;
  if(game.deck.length < 2) throw new Error('Not enough cards to split.');


  const deck = [...game.deck];
  const card1 = currentHand.cards[0];
  const card2 = currentHand.cards[1];
  const bet = currentHand.bet;

  const hand1 = [card1, deck.pop()];
  const hand2 = [card2, deck.pop()];

  const newHands = [
    ...game.hands.slice(0, game.activeHandIndex),
    {cards: hand1, bet},
    {cards: hand2, bet},
    ...game.hands.slice(game.activeHandIndex + 1)
  ];

  const newMoney = game.money - bet;

  return {
    ...game,
    money: newMoney,
    deck,
    hands: newHands,
    player: newHands[game.activeHandIndex].cards
  }
}
