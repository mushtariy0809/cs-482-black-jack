const crypto = require('crypto');

// One shared blackjack round per multiplayer table, run by the server.
// Same rules as src/blackjack.js: one deck reshuffled every round (README),
// dealer stands on all 17s, blackjack pays 3:2, double and split on two cards.
//
// Phases:
//   betting  players place bets; deals when everyone has bet or the timer runs out
//   playing  seats act one at a time, in seat order, one hand at a time
//   dealer   short pause, then the bot dealer draws and every hand is settled
//   settled  results are shown, then the table goes back to betting

// Rules shared with the browser's solo game (see shared/rules.js)
const { RANKS, SUITS, scoreHand, compareHands, dealerShouldHit, payoutFor: payoutForCards, isPair } = require('../../shared/rules.js');

class RoundError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// What a hand pays back, bet included
function payoutFor(hand, result) {
  return payoutForCards(hand.bet, result, hand.cards);
}

// Card ids include the round number so React re-deals a card that shows up again next round
function shuffledDeck(roundNumber, exclude = new Set()) {
  const deck = SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit, id: `${rank}-${suit}-${roundNumber}` })))
    .filter(card => !exclude.has(card.id));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function newRound(number = 1) {
  return { number, phase: 'betting', deck: [], dealer: [], turn: null, deadline: null };
}

function cardsInPlay(table) {
  const ids = new Set(table.round.dealer.map(c => c.id));
  for (const seat of table.seats) {
    for (const hand of seat.hands ?? []) hand.cards.forEach(c => ids.add(c.id));
  }
  return ids;
}

// One deck per round. With five players and splits it can run dry: then the
// cards not on the table are shuffled back in (ids get a suffix to stay unique).
function draw(table) {
  const round = table.round;
  if (round.deck.length === 0) {
    round.refills = (round.refills ?? 0) + 1;
    const used = cardsInPlay(table);
    round.deck = shuffledDeck(round.number, used).map(card => ({ ...card, id: `${card.id}-r${round.refills}` }));
  }
  return round.deck.pop();
}

// Seats that can bet this round (not away on a held seat)
function activeSeats(table) {
  return table.seats.filter(seat => !seat.reservedUntil);
}

function playingSeats(table) {
  return table.seats.filter(seat => seat.hands?.length);
}

function placeBet(table, seat, amount) {
  if (table.round.phase !== 'betting') {
    throw new RoundError('not_betting', 'Wait for the next hand to place a bet.');
  }
  const bet = Number(amount);
  if (!Number.isInteger(bet) || bet < table.minBet || bet > table.maxBet) {
    throw new RoundError('invalid_bet', `Bets are ${table.minBet} to ${table.maxBet} chips.`);
  }
  if (bet > seat.chips) {
    throw new RoundError('not_enough_chips', 'You do not have enough chips for that bet.');
  }
  seat.bet = bet;
}

function everyoneHasBet(table) {
  const active = activeSeats(table);
  return active.length > 0 && active.every(seat => seat.bet > 0);
}

function anyBets(table) {
  return activeSeats(table).some(seat => seat.bet > 0);
}

// Deal two cards to every seat with a bet, and two to the dealer.
// Returns false when nobody bet.
function deal(table) {
  const round = table.round;
  const players = activeSeats(table).filter(seat => seat.bet > 0 && seat.bet <= seat.chips);
  if (players.length === 0) return false;

  round.deck = shuffledDeck(round.number);
  round.refills = 0;
  round.dealer = [];

  for (const seat of players) {
    seat.chips -= seat.bet;
    seat.hands = [{ cards: [], bet: seat.bet, done: false, result: null, payout: 0 }];
    seat.activeHandIndex = 0;
    seat.inHand = true;
  }
  // Same order as at a real table: one card each, dealer, then a second card each, dealer
  for (let pass = 0; pass < 2; pass++) {
    for (const seat of players) seat.hands[0].cards.push(draw(table));
    round.dealer.push(draw(table));
  }

  const dealerBlackjack = scoreHand(round.dealer).blackjack;
  for (const seat of players) {
    const hand = seat.hands[0];
    if (dealerBlackjack || scoreHand(hand.cards).blackjack) hand.done = true;
  }

  round.phase = 'playing';
  round.turn = null;
  advance(table);
  return true;
}

// Move the turn to the next hand that still has to act, in seat order.
// When there is none, the dealer plays.
function advance(table) {
  const round = table.round;
  for (const seat of playingSeats(table)) {
    const index = seat.hands.findIndex(hand => !hand.done);
    if (index !== -1) {
      seat.activeHandIndex = index;
      round.turn = { seat: seat.index, hand: index };
      return;
    }
  }
  round.turn = null;
  round.phase = 'dealer';
}

function currentHand(table, seat) {
  const round = table.round;
  if (round.phase !== 'playing' || !round.turn || round.turn.seat !== seat.index) {
    throw new RoundError('not_your_turn', 'It is not your turn.');
  }
  return seat.hands[round.turn.hand];
}

function finishHandIfDone(hand) {
  const score = scoreHand(hand.cards);
  if (score.bust || score.total === 21) hand.done = true;
}

function hitHand(table, seat, hand) {
  hand.cards.push(draw(table));
  finishHandIfDone(hand);
}

function standHand(table, seat, hand) {
  hand.done = true;
}

function doubleHand(table, seat, hand) {
  if (hand.cards.length !== 2) throw new RoundError('cannot_double', 'You can only double on your first two cards.');
  if (seat.chips < hand.bet) throw new RoundError('not_enough_chips', 'You do not have enough chips to double.');
  seat.chips -= hand.bet;
  hand.bet *= 2;
  hand.doubled = true;
  hand.cards.push(draw(table));
  hand.done = true;
}

function splitPair(table, seat, hand) {
  if (!isPair(hand.cards)) throw new RoundError('cannot_split', 'You can only split a pair.');
  if (seat.chips < hand.bet) throw new RoundError('not_enough_chips', 'You do not have enough chips to split.');
  seat.chips -= hand.bet;
  const [first, second] = hand.cards;
  const one = { cards: [first, draw(table)], bet: hand.bet, done: false, result: null, payout: 0 };
  const two = { cards: [second, draw(table)], bet: hand.bet, done: false, result: null, payout: 0 };
  finishHandIfDone(one);
  finishHandIfDone(two);
  seat.hands.splice(seat.hands.indexOf(hand), 1, one, two);
}

const ACTIONS = { hit: hitHand, stand: standHand, double: doubleHand, split: splitPair };

// type: 'hit' | 'stand' | 'double' | 'split'
function act(table, seat, type) {
  const hand = currentHand(table, seat);
  const action = Object.hasOwn(ACTIONS, type) ? ACTIONS[type] : null;
  if (!action) throw new RoundError('invalid_action', 'Unknown action.');
  action(table, seat, hand);
  advance(table);
}

// A player who leaves mid-hand loses what they bet (saved rule: no auto-stand)
function forfeit(table, seat) {
  if (!seat.hands?.length || table.round.phase === 'settled') return;
  for (const hand of seat.hands) {
    if (!hand.result) {
      hand.done = true;
      hand.forfeited = true;
      hand.result = 'dealer';
      hand.payout = 0;
    }
  }
  seat.inHand = false;
  if (table.round.phase === 'playing' && table.round.turn?.seat === seat.index) advance(table);
}

// The bot dealer draws (only if someone is still in), then every hand is paid
function playDealerAndSettle(table) {
  const round = table.round;
  const live = playingSeats(table).some(seat => seat.hands.some(hand => !hand.forfeited && !scoreHand(hand.cards).bust));
  if (live) {
    while (dealerShouldHit(round.dealer)) round.dealer.push(draw(table));
  }

  for (const seat of playingSeats(table)) {
    for (const hand of seat.hands) {
      if (hand.forfeited) continue;
      hand.result = compareHands(hand.cards, round.dealer);
      hand.payout = payoutFor(hand, hand.result);
      seat.chips += hand.payout;
    }
    seat.inHand = false;
  }
  round.phase = 'settled';
  round.turn = null;
}

// Clear the table for the next hand
function resetRound(table) {
  for (const seat of table.seats) {
    seat.hands = [];
    seat.bet = 0;
    seat.activeHandIndex = 0;
    seat.inHand = false;
  }
  table.round = newRound((table.round?.number ?? 0) + 1);
}

// What players at the table see. The dealer's hole card and the deck stay secret.
function roundView(table, now) {
  const round = table.round;
  const reveal = round.phase === 'dealer' || round.phase === 'settled';
  const dealer = round.dealer.map((card, i) => (i === 1 && !reveal ? { hidden: true, id: `hole-${round.number}` } : card));

  return {
    tableId: table.id,
    round: round.number,
    phase: round.phase,
    turn: round.turn,
    msLeft: round.deadline ? Math.max(0, round.deadline - now) : null,
    minBet: table.minBet,
    maxBet: table.maxBet,
    dealer,
    dealerTotal: reveal ? scoreHand(round.dealer).total : round.dealer.length ? scoreHand(round.dealer.slice(0, 1)).total : null,
    seats: table.seats.map(seat => ({
      index: seat.index,
      name: seat.name,
      chips: seat.chips,
      bet: seat.bet ?? 0,
      away: Boolean(seat.reservedUntil),
      activeHandIndex: seat.activeHandIndex ?? 0,
      hands: (seat.hands ?? []).map(hand => ({
        cards: hand.cards,
        bet: hand.bet,
        done: hand.done,
        doubled: Boolean(hand.doubled),
        forfeited: Boolean(hand.forfeited),
        total: scoreHand(hand.cards).total,
        result: round.phase === 'settled' || hand.forfeited ? hand.result : null,
        payout: round.phase === 'settled' ? hand.payout : 0
      }))
    }))
  };
}

module.exports = {
  RoundError,
  scoreHand,
  compareHands,
  newRound,
  placeBet,
  everyoneHasBet,
  anyBets,
  deal,
  act,
  forfeit,
  playDealerAndSettle,
  resetRound,
  roundView,
  activeSeats
};
