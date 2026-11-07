const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { TableStore } = require('../realtime/tableStore');
const { attachTableSockets } = require('../realtime/socket');

process.env.JWT_SECRET = 'chat-test-secret';

const tokenFor = playerId => jwt.sign({ playerId }, process.env.JWT_SECRET);
const send = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));
const next = (socket, event) => new Promise(resolve => socket.once(event, resolve));

// A real Socket.IO server with an in-memory table store (no database)
async function startServer(t) {
  const server = http.createServer();
  const io = new Server(server);
  const store = new TableStore({ timing: { betMs: 60000, turnMs: 60000, dealerMs: 10, settleMs: 60000 } });
  store.ensureSystemTables();
  attachTableSockets(io, store);
  await new Promise(resolve => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}`;

  const sockets = [];
  t.after(() => {
    sockets.forEach(socket => socket.close());
    store.stop();
    io.close();
  });

  // Opens a browser tab and waits until it is connected
  async function open(auth) {
    const socket = connect(url, { auth, reconnection: false });
    sockets.push(socket);
    await next(socket, 'connect');
    return socket;
  }

  return { store, open, url, sockets };
}

const alice = { clientId: 'alice-chat-01', name: 'Alice', token: tokenFor('player-alice') };
const bob = { clientId: 'bob-chat-0001', name: 'Bob', token: tokenFor('player-bob') };
const guest = { clientId: 'guest-chat-01', name: 'Guest' };

test('an invalid login token is refused at connect', async t => {
  const { url, sockets } = await startServer(t);
  const socket = connect(url, { auth: { clientId: 'bad-token-01', token: 'not-a-jwt' }, reconnection: false });
  sockets.push(socket);

  const error = await next(socket, 'connect_error');
  assert.match(error.message, /Invalid or expired login token/);
});

test('names are trimmed, shortened and default to Guest', async t => {
  const { open, store } = await startServer(t);
  const blank = await open({ clientId: 'blank-name-01', name: '   ' });
  const long = await open({ clientId: 'long-name-001', name: 'x'.repeat(40) });

  await send(blank, 'table:join', { tableId: 'green-room' });
  await send(long, 'table:join', { tableId: 'green-room' });

  assert.equal(store.seatOf('blank-name-01').seat.name, 'Guest');
  assert.equal(store.seatOf('long-name-001').seat.name.length, 24);
});

test('table chat needs a logged-in, seated player and a real message', async t => {
  const { open } = await startServer(t);
  const guestTab = await open(guest);
  const aliceTab = await open(alice);

  const asGuest = await send(guestTab, 'table:chat:send', { message: 'hi' });
  assert.deepEqual([asGuest.ok, asGuest.code], [false, 'authentication_required']);

  const notSeated = await send(aliceTab, 'table:chat:send', { message: 'hi' });
  assert.equal(notSeated.code, 'not_seated');

  await send(aliceTab, 'table:join', { tableId: 'green-room' });
  const empty = await send(aliceTab, 'table:chat:send', { message: '   ' });
  assert.equal(empty.code, 'invalid_message');
});

test('table chat reaches everyone at the table, trimmed to 300 characters', async t => {
  const { open } = await startServer(t);
  const aliceTab = await open(alice);
  const bobTab = await open(bob);
  await send(aliceTab, 'table:join', { tableId: 'green-room' });
  await send(bobTab, 'table:join', { tableId: 'green-room' });

  const received = next(bobTab, 'table:chat:message');
  const sent = await send(aliceTab, 'table:chat:send', { message: `  ${'a'.repeat(400)}  ` });

  assert.equal(sent.ok, true);
  const message = await received;
  assert.equal(message.senderName, 'Alice');
  assert.equal(message.playerId, 'player-alice');
  assert.equal(message.text.length, 300);
});

test('private messages check the sender, the message and the recipient', async t => {
  const { open } = await startServer(t);
  const guestTab = await open(guest);
  const aliceTab = await open(alice);

  const asGuest = await send(guestTab, 'table:private:send', { recipientSeat: 0, message: 'hi' });
  assert.equal(asGuest.code, 'authentication_required');

  const empty = await send(aliceTab, 'table:private:send', { recipientSeat: 0, message: '' });
  assert.equal(empty.code, 'invalid_message');

  const notSeated = await send(aliceTab, 'table:private:send', { recipientSeat: 0, message: 'hi' });
  assert.equal(notSeated.code, 'not_seated');

  const joined = await send(aliceTab, 'table:join', { tableId: 'green-room' });
  const badSeat = await send(aliceTab, 'table:private:send', { recipientSeat: 'one', message: 'hi' });
  assert.equal(badSeat.code, 'invalid_recipient');

  const toSelf = await send(aliceTab, 'table:private:send', { recipientSeat: joined.seat, message: 'hi' });
  assert.equal(toSelf.code, 'recipient_not_seated');

  const guestSeat = (await send(guestTab, 'table:join', { tableId: 'green-room' })).seat;
  const toGuest = await send(aliceTab, 'table:private:send', { recipientSeat: guestSeat, message: 'hi' });
  assert.equal(toGuest.code, 'recipient_not_authenticated');
});

test('a private message goes only to the sender and the recipient', async t => {
  const { open } = await startServer(t);
  const aliceTab = await open(alice);
  const bobTab = await open(bob);
  const guestTab = await open(guest);
  await send(aliceTab, 'table:join', { tableId: 'green-room' });
  const bobSeat = (await send(bobTab, 'table:join', { tableId: 'green-room' })).seat;
  await send(guestTab, 'table:join', { tableId: 'green-room' });

  let guestSawIt = false;
  guestTab.on('table:private:message', () => { guestSawIt = true; });

  const toBob = next(bobTab, 'table:private:message');
  const echo = next(aliceTab, 'table:private:message');
  const result = await send(aliceTab, 'table:private:send', { recipientSeat: bobSeat, message: ' psst ' });

  assert.equal(result.ok, true);
  const [bobCopy, aliceCopy] = await Promise.all([toBob, echo]);
  assert.deepEqual(bobCopy, aliceCopy);
  assert.equal(bobCopy.text, 'psst');
  assert.equal(bobCopy.recipientPlayerId, 'player-bob');
  assert.equal(bobCopy.senderPlayerId, 'player-alice');
  assert.equal(guestSawIt, false);
});

test('the seat is kept until the player closes their last tab', async t => {
  const { open, store } = await startServer(t);
  const firstTab = await open(alice);
  const secondTab = await open(alice);
  await send(firstTab, 'table:join', { tableId: 'green-room' });

  firstTab.close();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(store.seatOf(alice.clientId).seat.reservedUntil, null);

  secondTab.close();
  await new Promise(resolve => setTimeout(resolve, 50));
  const left = store.seatOf(alice.clientId);
  assert.ok(!left || left.seat.reservedUntil, 'closing the last tab leaves the table');
});

test('lobby:unsubscribe stops lobby updates', async t => {
  const { open } = await startServer(t);
  const watcher = await open(guest);
  const creator = await open(alice);
  await send(watcher, 'lobby:subscribe');
  assert.equal((await send(watcher, 'lobby:unsubscribe')).ok, true);

  let sawCreate = false;
  watcher.on('table:created', () => { sawCreate = true; });
  await send(creator, 'table:create', { name: 'Quiet Table' });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(sawCreate, false);
});
