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

export function resolvePayout(money, bet, result, player) {
  const isBlackjack = scoreHand(player).blackjack;
  if (result === 'player') {
    const winnings = bet * 2;
    return money + winnings;
  } else if (result === 'push') {
    return money + bet;
  }
  return money;
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
 {/*
  const deck = [...game.deck], dealer = [...game.dealer];
  while (dealerShouldHit(dealer)) { if (!deck.length) throw new Error('Deck exhausted.'); dealer.push(deck.pop()); }
  const result = compareHands(game.player, dealer);
  const money = resolvePayout(game.money, game.bet, result, game.player);
  return { ...game, money, deck, dealer, phase: 'finished', result };
 */}
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


  if (game.player.length !== 2) return game;
  if (game.money < game.bet) return game;
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

{/*
  const currentMoney = game.money;
  const originalBet = game.bet;
  const newMoney = currentMoney - originalBet;
  const newBet = originalBet * 2;

  const deck = [...game.deck];
  const player = [...game.player, deck.pop()];
  const pScore = scoreHand(player);

  const next = { ...game, deck, player, money: newMoney, bet: newBet };

  if (pScore.bust) {
    return { ...next, phase: 'finished', result: 'dealer' };
  }

  return stand(next);
  */}
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
