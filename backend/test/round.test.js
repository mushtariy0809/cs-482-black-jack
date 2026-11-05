const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { TableStore } = require('../realtime/tableStore');
const { attachTableSockets } = require('../realtime/socket');
const round = require('../realtime/round');

const alice = { clientId: 'alice-client-1', name: 'Alice' };
const bob = { clientId: 'bob-client-01', name: 'Bob' };
const fast = { betMs: 40, turnMs: 60, dealerMs: 10, settleMs: 40 };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const card = (rank, n = 0) => ({ rank, suit: 'spades', id: `${rank}-${n}` });

function seatedStore(timing = fast) {
  const store = new TableStore({ timing });
  store.ensureSystemTables();
  return store;
}

// Plays the current turn until the round leaves the playing phase
function standEveryone(store, tableId, clients) {
  for (let guard = 0; guard < 20; guard++) {
    const state = store.roundState(tableId);
    if (state.phase !== 'playing') return state;
    const turnSeat = state.seats.find(s => s.index === state.turn.seat);
    const who = clients.find(c => c.name === turnSeat.name);
    store.action(who.clientId, 'stand');
  }
  throw new Error('round never finished');
}

test('two players share one deal, one dealer and take turns in seat order', async t => {
  const store = seatedStore();
  t.after(() => store.stop());

  await store.join({ tableId: 'green-room', chips: 1000 }, alice);
  await store.join({ tableId: 'green-room', chips: 500 }, bob);

  store.bet(alice.clientId, 50);
  assert.equal(store.roundState('green-room').phase, 'betting', 'waits for Bob');
  store.bet(bob.clientId, 20);

  const state = store.roundState('green-room');
  const [a, b] = state.seats;
  assert.equal(a.hands[0].cards.length, 2);
  assert.equal(b.hands[0].cards.length, 2);
  assert.equal(state.dealer.length, 2);
  assert.equal(a.chips, 950);
  assert.equal(b.chips, 480);
  assert.equal(store.list().find(t => t.id === 'green-room').status, 'in_game');

  // Five different cards on the table: everyone is drawing from the same deck
  const ids = [...a.hands[0].cards, ...b.hands[0].cards, ...state.dealer].map(c => c.id);
  assert.equal(new Set(ids).size, 6);

  if (state.phase === 'playing') {
    // Dealer's hole card is hidden while players act
    assert.equal(state.dealer[1].hidden, true);
    assert.equal(state.dealer[1].rank, undefined);

    const waiting = state.turn.seat === 0 ? bob : alice;
    assert.throws(() => store.action(waiting.clientId, 'hit'), { code: 'not_your_turn' });
    standEveryone(store, 'green-room', [alice, bob]);
  }

  assert.equal(store.roundState('green-room').phase, 'dealer');
  await wait(25);

  const settled = store.roundState('green-room');
  assert.equal(settled.phase, 'settled');
  assert.equal(settled.dealer[1].hidden, undefined);
  for (const seat of settled.seats) {
    const hand = seat.hands[0];
    assert.ok(['player', 'dealer', 'push'].includes(hand.result));
    const start = seat.name === 'Alice' ? 1000 : 500;
    assert.equal(seat.chips, start - hand.bet + hand.payout);
  }

  await wait(60);
  const next = store.roundState('green-room');
  assert.equal(next.phase, 'betting');
  assert.equal(next.round, settled.round + 1);
  assert.equal(next.seats[0].hands.length, 0);
});

test('bets are checked against table limits and chips', async t => {
  const store = seatedStore();
  t.after(() => store.stop());
  await store.join({ tableId: 'green-room', chips: 30 }, alice);

  assert.throws(() => store.bet(alice.clientId, 5), { code: 'invalid_bet' });
  assert.throws(() => store.bet(alice.clientId, 40), { code: 'not_enough_chips' });
  assert.throws(() => store.bet(bob.clientId, 10), { code: 'not_seated' });
  await store.join({ tableId: 'practice' }, bob);
  assert.throws(() => store.bet(bob.clientId, 10), { code: 'solo_table' });
});

test('the betting timer deals for whoever bet; others sit out', async t => {
  const store = seatedStore();
  t.after(() => store.stop());
  await store.join({ tableId: 'green-room' }, alice);
  await store.join({ tableId: 'green-room' }, bob);

  store.bet(alice.clientId, 10);
  assert.ok(store.roundState('green-room').msLeft > 0);
  await wait(60);

  const state = store.roundState('green-room');
  assert.notEqual(state.phase, 'betting');
  assert.equal(state.seats[0].hands.length, 1);
  assert.equal(state.seats[1].hands.length, 0, 'Bob joins next hand');
});

test('a player who runs out of time stands automatically', async t => {
  const store = seatedStore();
  t.after(() => store.stop());
  await store.join({ tableId: 'green-room' }, alice);
  store.bet(alice.clientId, 10);

  if (store.roundState('green-room').phase !== 'playing') return; // opening blackjack, nothing to time out
  await wait(90);
  assert.notEqual(store.roundState('green-room').phase, 'playing');
});

test('leaving mid-hand loses the bet and passes the turn on', async t => {
  const store = seatedStore({ ...fast, turnMs: 5000 });
  t.after(() => store.stop());
  await store.join({ tableId: 'green-room', chips: 100 }, alice);
  await store.join({ tableId: 'green-room', chips: 100 }, bob);
  store.bet(alice.clientId, 40);
  store.bet(bob.clientId, 40);

  const reservation = store.leave(alice.clientId);
  assert.equal(reservation.forfeited, true);

  const state = store.roundState('green-room');
  const a = state.seats.find(s => s.name === 'Alice');
  assert.equal(a.hands[0].forfeited, true);
  assert.equal(a.hands[0].result, 'dealer');
  assert.equal(a.chips, 60);
  if (state.phase === 'playing') assert.equal(state.turn.seat, 1);
});

test('double and split follow the same rules as the solo game', () => {
  const table = { id: 't', minBet: 10, maxBet: 500, seats: [], round: round.newRound() };
  const seat = { index: 0, name: 'A', chips: 100, bet: 20, hands: [] };
  table.seats.push(seat);

  // Rig the deck: pop() takes from the end
  round.deal(table);
  table.round.phase = 'playing';
  table.round.dealer = [card('10', 1), card('7', 2)];
  table.round.deck = [card('5', 3), card('10', 4), card('2', 5)];
  seat.hands = [{ cards: [card('8', 6), card('8', 7)], bet: 20, done: false, result: null, payout: 0 }];
  seat.chips = 80;
  table.round.turn = { seat: 0, hand: 0 };

  round.act(table, seat, 'split');
  assert.deepEqual(seat.hands.map(h => h.cards.map(c => c.rank)), [['8', '2'], ['8', '10']]);
  assert.equal(seat.chips, 60);

  round.act(table, seat, 'double'); // 8+2 doubled draws the 5 → 15
  assert.equal(seat.hands[0].bet, 40);
  assert.equal(seat.hands[0].done, true);
  assert.equal(seat.chips, 40);
  assert.deepEqual(table.round.turn, { seat: 0, hand: 1 });

  assert.throws(() => round.act(table, seat, 'split'), { code: 'cannot_split' });
  round.act(table, seat, 'stand');
  assert.equal(table.round.phase, 'dealer');

  round.playDealerAndSettle(table); // dealer 17
  assert.deepEqual(seat.hands.map(h => h.result), ['dealer', 'player']);
  assert.equal(seat.chips, 40 + 40);
});

test('both browsers receive the same table state over the socket', async t => {
  const server = http.createServer();
  const io = new Server(server);
  const store = seatedStore({ ...fast, turnMs: 5000, settleMs: 5000 });
  attachTableSockets(io, store);
  await new Promise(resolve => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}`;

  const windowA = connect(url, { auth: alice });
  const windowB = connect(url, { auth: bob });
  t.after(() => {
    windowA.close();
    windowB.close();
    store.stop();
    io.close();
  });

  const send = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));
  const until = (socket, check) => new Promise(resolve => {
    const listener = state => {
      if (check(state)) {
        socket.off('table:state', listener);
        resolve(state);
      }
    };
    socket.on('table:state', listener);
  });

  const firstState = until(windowA, s => s.seats.length === 1);
  assert.equal((await send(windowA, 'table:join', { tableId: 'green-room', chips: 300 })).ok, true);
  assert.equal((await firstState).seats[0].chips, 300);

  assert.equal((await send(windowB, 'table:join', { tableId: 'green-room' })).ok, true);
  await send(windowA, 'round:bet', { amount: 10 });

  const dealtA = until(windowA, s => s.phase !== 'betting');
  const dealtB = until(windowB, s => s.phase !== 'betting');
  await send(windowB, 'round:bet', { amount: 10 });
  const [stateA, stateB] = await Promise.all([dealtA, dealtB]);

  assert.deepEqual(stateA.dealer, stateB.dealer);
  assert.deepEqual(stateA.seats, stateB.seats);

  const outOfTurn = await send(stateA.turn?.seat === 0 ? windowB : windowA, 'round:action', { type: 'hit' });
  if (stateA.phase === 'playing') assert.equal(outOfTurn.code, 'not_your_turn');
});
