
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
