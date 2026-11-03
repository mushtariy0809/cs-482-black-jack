
const test = require('node:test');
const assert = require('node:assert/strict');
const { TableStore, SEAT_HOLD_MS, IDLE_TABLE_MS } = require('../realtime/tableStore');

const alice = { clientId: 'alice-0001', name: 'Alice' };
const bob = { clientId: 'bob-00001', name: 'Bob' };

function newStore(options) {
  const store = new TableStore(options);
  store.ensureSystemTables();
  return store;
}

test('system tables are always there', () => {
  const store = newStore();
  const names = store.list().map(t => t.name);

  assert.deepEqual(names, ['The Green Room', 'Practice']);
  assert.ok(store.list().every(t => t.isSystem && t.status === 'waiting'));
});

test('joining updates seat count and status, and full tables refuse players', async () => {
  const store = newStore();

  for (let i = 0; i < 5; i++) {
    await store.join({ tableId: 'green-room' }, { clientId: `player-${i}000`, name: `P${i}` });
  }

  const room = store.get('green-room');
  assert.equal(room.players, 5);
  assert.equal(room.status, 'full');
  await assert.rejects(store.join({ tableId: 'green-room' }, alice), { code: 'full' });
});

test('practice is solo and never fills up', async () => {
  const store = newStore();

  for (let i = 0; i < 8; i++) {
    await store.join({ tableId: 'practice' }, { clientId: `player-${i}000`, name: `P${i}` });
  }

  assert.equal(store.get('practice').status, 'waiting');
});

test('a hand in progress shows in_game and blocks switching tables', async () => {
  const store = newStore();
  await store.join({ tableId: 'green-room' }, alice);
  store.setInHand(alice.clientId, true);

  assert.equal(store.get('green-room').status, 'in_game');
  await assert.rejects(store.join({ tableId: 'practice' }, alice), { code: 'in_hand' });

  store.setInHand(alice.clientId, false);
  await store.join({ tableId: 'practice' }, alice);
  assert.equal(store.get('green-room').players, 0);
  assert.equal(store.get('practice').players, 1);
});

test('leaving holds the seat for 10 seconds, then releases it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = newStore();
  const released = [];
  store.on('seatReleased', event => released.push(event));

  await store.join({ tableId: 'green-room' }, alice);
  store.setInHand(alice.clientId, true);
  const reservation = store.leave(alice.clientId);

  assert.equal(reservation.forfeited, true);
  assert.equal(store.get('green-room').seats[0].reserved, true);

  t.mock.timers.tick(SEAT_HOLD_MS - 1);
  assert.equal(store.get('green-room').players, 1);

  t.mock.timers.tick(1);
  assert.equal(store.get('green-room').players, 0);
  assert.deepEqual(released, [{ clientId: alice.clientId, tableId: 'green-room' }]);
});

test('rejoining within 10 seconds gets the same seat back', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = newStore();

  await store.join({ tableId: 'green-room' }, bob);
  await store.join({ tableId: 'green-room' }, alice);
  store.leave(alice.clientId);
  t.mock.timers.tick(5000);

  const result = await store.join({ tableId: 'green-room' }, alice);
  assert.equal(result.seat, 1);
  assert.equal(result.rejoined, true);

  t.mock.timers.tick(SEAT_HOLD_MS);
  assert.equal(store.get('green-room').players, 2);
});

test('joining another table gives up a held seat right away', async () => {
  const store = newStore();
  await store.join({ tableId: 'green-room' }, alice);
  store.leave(alice.clientId);

  await store.join({ tableId: 'practice' }, alice);
  assert.equal(store.get('green-room').players, 0);
  store.stop();
});

test('creating a table validates input and seats the creator', async () => {
  const store = newStore();

  await assert.rejects(store.create({ name: 'ab' }, alice), { code: 'invalid_name' });
  await assert.rejects(store.create({ name: 'x'.repeat(31) }, alice), { code: 'invalid_name' });
  await assert.rejects(store.create({ name: 'the green room' }, alice), { code: 'duplicate_name' });
  await assert.rejects(store.create({ name: 'Secret', visibility: 'private' }, alice), { code: 'password_required' });

  const created = await store.create({ name: '  Friday   Night ', visibility: 'private', password: 'hunter2' }, alice);
  assert.equal(created.table.name, 'Friday Night');
  assert.equal(created.table.players, 1);
  assert.equal(created.table.inviteCode, undefined, 'private codes are not public');
  assert.match(created.inviteCode, /^[A-Z2-9]{6}$/);
});

test('private tables need the right password, by id or invite code', async () => {
  const store = newStore();
  const { table, inviteCode } = await store.create({ name: 'Secret', visibility: 'private', password: 'hunter2' }, alice);

  await assert.rejects(store.join({ tableId: table.id }, bob), { code: 'bad_password' });
  await assert.rejects(store.join({ inviteCode, password: 'nope' }, bob), { code: 'bad_password' });

  const joined = await store.join({ inviteCode: inviteCode.toLowerCase(), password: 'hunter2' }, bob);
  assert.equal(joined.table.id, table.id);
  assert.equal(joined.table.players, 2);
});

test('empty player tables are cleaned up, system tables are not', async () => {
  let clock = 1_000_000;
  const store = newStore({ now: () => clock });
  const removed = [];
  store.on('removed', id => removed.push(id));

  const { table } = await store.create({ name: 'Short Lived' }, alice);
  store.leave(alice.clientId);
  store.releaseSeat(table.id, alice.clientId);

  clock += IDLE_TABLE_MS;
  store.sweepIdle();

  assert.deepEqual(removed, [table.id]);
  assert.deepEqual(store.list().map(t => t.id), ['green-room', 'practice']);
});

test('saved tables load with empty seats', () => {
  const store = new TableStore();
  store.load([{ _id: 'abc', name: 'Old', isSystem: false, seats: [{ index: 0, clientId: 'x' }], inviteCode: 'AAAAAA', maxSeats: 5, createdAt: new Date() }]);

  assert.equal(store.get('abc').players, 0);
});
