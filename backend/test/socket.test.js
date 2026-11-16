
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { TableStore } = require('../realtime/tableStore');
const { attachTableSockets } = require('../realtime/socket');

// Two "browser windows" talking to a real Socket.IO server (no database)
test('lobby updates reach every connected player live', async t => {
  const server = http.createServer();
  const io = new Server(server);
  const store = new TableStore();
  store.ensureSystemTables();
  attachTableSockets(io, store);

  await new Promise(resolve => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}`;

  const windowA = connect(url, { auth: { clientId: 'window-a-01', name: 'Alice' } });
  const windowB = connect(url, { auth: { clientId: 'window-b-01', name: 'Bob' } });

  t.after(() => {
    windowA.close();
    windowB.close();
    store.stop();
    io.close();
  });

  const send = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));
  const next = (socket, event) => new Promise(resolve => socket.once(event, resolve));

  const snapshot = next(windowB, 'tables:snapshot');
  await send(windowA, 'lobby:subscribe');
  await send(windowB, 'lobby:subscribe');
  assert.equal((await snapshot).length, 2);

  // A joins, B sees the seat count change
  let update = next(windowB, 'table:updated');
  const joined = await send(windowA, 'table:join', { tableId: 'green-room' });
  assert.equal(joined.ok, true);
  assert.equal((await update).players, 1);

  // A starts a hand, B sees In game
  update = next(windowB, 'table:updated');
  await send(windowA, 'seat:hand', { inHand: true });
  assert.equal((await update).status, 'in_game');

  // B creates a table, A sees it appear
  const created = next(windowA, 'table:created');
  const result = await send(windowB, 'table:create', { name: 'Late Night' });
  assert.equal(result.ok, true);
  assert.equal((await created).name, 'Late Night');

  // Errors come back as { ok: false, code }
  const duplicate = await send(windowA, 'table:create', { name: 'late night' });
  assert.deepEqual([duplicate.ok, duplicate.code], [false, 'duplicate_name']);

  // A leaves mid-hand: only A is told the seat is held
  const reserved = next(windowA, 'seat:reserved');
  await send(windowA, 'table:leave');
  const reservation = await reserved;
  assert.equal(reservation.tableId, 'green-room');
  assert.equal(reservation.forfeited, true);
});

test('connections without a clientId are refused', async t => {
  const server = http.createServer();
  const io = new Server(server);
  attachTableSockets(io, new TableStore());
  await new Promise(resolve => server.listen(0, resolve));

  const socket = connect(`http://localhost:${server.address().port}`, { reconnection: false });
  t.after(() => {
    socket.close();
    io.close();
  });

  const error = await new Promise(resolve => socket.once('connect_error', resolve));
  assert.match(error.message, /clientId/);
});

// Private table + friend invite + video ad, end to end over Socket.IO
test('friends get invites to hidden private tables, and ads pay chips to the seat', async t => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  const jwt = require('jsonwebtoken');
  const { AdStore } = require('../realtime/adStore');

  const server = http.createServer();
  const io = new Server(server);
  const store = new TableStore();
  store.ensureSystemTables();
  let clock = Date.now();
  const ads = new AdStore({ now: () => clock });
  const friends = new Set(['player-a:player-b']);
  attachTableSockets(io, store, { ads, areFriends: async (a, b) => friends.has(`${a}:${b}`) });

  await new Promise(resolve => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}`;
  const token = playerId => jwt.sign({ playerId }, process.env.JWT_SECRET);

  const alice = connect(url, { auth: { clientId: 'alice-tab-1', name: 'Alice', token: token('player-a') } });
  const bob = connect(url, { auth: { clientId: 'bob-tab-01', name: 'Bob', token: token('player-b') } });
  const stranger = connect(url, { auth: { clientId: 'stranger-1', name: 'Eve' } });

  t.after(() => {
    [alice, bob, stranger].forEach(socket => socket.close());
    store.stop();
    io.close();
  });

  const send = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));
  const next = (socket, event) => new Promise(resolve => socket.once(event, resolve));

  await Promise.all([alice, bob, stranger].map(socket => send(socket, 'lobby:subscribe')));
  const strangerSaw = [];
  stranger.on('table:created', table => strangerSaw.push(table.name));

  const created = await send(alice, 'table:create', { name: 'Hidden Den', visibility: 'private', password: '1234', maxSeats: 3 });
  assert.equal(created.ok, true);

  // Only Alice is let in so far
  const bobLobby = await send(bob, 'lobby:subscribe');
  assert.ok(!bobLobby.tables.some(table => table.name === 'Hidden Den'));

  // Alice can't invite a stranger, only a friend
  const notFriend = await send(alice, 'table:invite', { playerId: 'player-z' });
  assert.equal(notFriend.code, 'not_friends');

  const invite = next(bob, 'table:invite');
  const shown = next(bob, 'table:updated');
  const sent = await send(alice, 'table:invite', { playerId: 'player-b' });
  assert.deepEqual([sent.ok, sent.online], [true, true]);
  assert.equal((await invite).tableName, 'Hidden Den');
  assert.equal((await invite).fromName, 'Alice');
  assert.equal((await shown).name, 'Hidden Den', 'the table appears in Bob\'s lobby');

  // Bob joins with the PIN
  const noPin = await send(bob, 'table:join', { tableId: created.table.id });
  assert.equal(noPin.code, 'pin_required');
  const joined = await send(bob, 'table:join', { tableId: created.table.id, password: '1234' });
  assert.equal(joined.ok, true);
  assert.deepEqual(strangerSaw, [], 'the stranger never hears about the private table');

  // Bob watches an ad at the table: chips land on his seat
  const started = await send(bob, 'ad:start', {});
  assert.equal(started.ok, true);
  clock += started.durationMs;
  const before = store.roundState(created.table.id).seats.find(seat => seat.name === 'Bob').chips;
  const reward = await send(bob, 'ad:complete', { viewId: started.viewId });
  assert.equal(reward.ok, true);
  assert.equal(reward.seatChips, before + reward.reward);

  // Guests can't send friend invites
  const guestInvite = await send(stranger, 'table:invite', { playerId: 'player-a' });
  assert.equal(guestInvite.code, 'authentication_required');
});
