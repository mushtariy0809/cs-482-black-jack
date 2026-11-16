
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
  await assert.rejects(store.create({ name: 'Secret', visibility: 'private', password: 'hunter2' }, alice), { code: 'invalid_pin' });
  await assert.rejects(store.create({ name: 'Secret', visibility: 'private', password: '123' }, alice), { code: 'invalid_pin' });
  await assert.rejects(store.create({ name: 'Tiny', maxSeats: 1 }, alice), { code: 'invalid_seats' });
  await assert.rejects(store.create({ name: 'Huge', maxSeats: 8 }, alice), { code: 'invalid_seats' });

  const created = await store.create({ name: '  Friday   Night ', visibility: 'private', password: '1234', maxSeats: 7 }, alice);
  assert.equal(created.table.name, 'Friday Night');
  assert.equal(created.table.players, 1);
  assert.equal(created.table.maxSeats, 7);
  assert.equal(created.table.hasPin, true);
  assert.equal(created.table.mode, 'people', 'bots only ever deal');
  assert.equal(created.table.inviteCode, undefined, 'private codes are not public');
  assert.match(created.inviteCode, /^[A-Z2-9]{6}$/);
});

test('created tables seat 2 to 7 players and fill up at the chosen size', async () => {
  const store = newStore();
  const { table } = await store.create({ name: 'Pair', maxSeats: 2 }, alice);

  await store.join({ tableId: table.id }, bob);
  assert.equal(store.get(table.id).status, 'full');
  await assert.rejects(store.join({ tableId: table.id }, { clientId: 'carol-0001', name: 'Carol' }), { code: 'full' });
});

test('private tables with a PIN need the right PIN to join by invite code', async () => {
  const store = newStore();
  const { inviteCode, table } = await store.create({ name: 'Secret', visibility: 'private', password: '4821' }, alice);

  await assert.rejects(store.join({ inviteCode }, bob), { code: 'pin_required' });
  await assert.rejects(store.join({ inviteCode, password: '0000' }, bob), { code: 'bad_password' });

  const joined = await store.join({ inviteCode: inviteCode.toLowerCase(), password: '4821' }, bob);
  assert.equal(joined.table.id, table.id);
  assert.equal(joined.table.players, 2);
});

test('private tables are hidden from the lobby except for people let in', async () => {
  const store = newStore();
  const { table, inviteCode } = await store.create({ name: 'Hideout', visibility: 'private' }, alice);

  assert.ok(store.list(alice).some(t => t.id === table.id), 'the creator sees it');
  assert.ok(!store.list(bob).some(t => t.id === table.id), 'others do not');
  assert.ok(!store.list().some(t => t.id === table.id));

  // Guessing the id doesn't work; the invite code does (no PIN set)
  await assert.rejects(store.join({ tableId: table.id }, bob), { code: 'not_found' });
  await store.join({ inviteCode }, bob);
  assert.ok(store.list(bob).some(t => t.id === table.id));

  // After leaving, Bob can still find it and rejoin by id
  store.leave(bob.clientId);
  store.releaseSeat(table.id, bob.clientId);
  assert.ok(store.list(bob).some(t => t.id === table.id));
  await store.join({ tableId: table.id }, bob);
});

test('invited friends see the private table but still need the PIN', async () => {
  const store = newStore();
  const carol = { clientId: 'carol-0001', name: 'Carol', playerId: 'player-carol' };
  const updates = [];
  store.on('updated', (view, audience) => updates.push({ view, audience }));

  const { table } = await store.create({ name: 'Family Night', visibility: 'private', password: '2468' }, alice);
  assert.ok(!store.list(carol).some(t => t.id === table.id));

  const info = store.inviteFriend(alice.clientId, carol.playerId);
  assert.equal(info.inviteCode.length, 6);
  assert.equal(info.hasPin, true);
  assert.ok(store.list(carol).some(t => t.id === table.id));
  assert.deepEqual(updates.at(-1).audience.playerIds, ['player-carol'], 'the update only goes to people let in');

  await assert.rejects(store.join({ tableId: table.id }, carol), { code: 'pin_required' });
  await store.join({ tableId: table.id, password: '2468' }, carol);
  assert.equal(store.get(table.id).players, 2);
});

test('peek tells the browser whether to ask for a PIN', async () => {
  const store = newStore();
  const { inviteCode } = await store.create({ name: 'Peeky', visibility: 'private', password: '13579' }, alice);

  assert.equal(store.peek({ inviteCode }, alice).needsPin, false, 'the creator skips the PIN');
  const peeked = store.peek({ inviteCode }, bob);
  assert.equal(peeked.needsPin, true);
  assert.equal(peeked.table.name, 'Peeky');
  assert.equal(store.get(peeked.table.id).players, 1, 'peeking does not join');
  assert.throws(() => store.peek({ inviteCode: 'ZZZZZZ' }, bob), { code: 'not_found' });
});

test('invites need a seat at a multiplayer table', async () => {
  const store = newStore();
  assert.throws(() => store.inviteInfo(alice.clientId), { code: 'not_seated' });

  await store.join({ tableId: 'practice' }, alice);
  assert.throws(() => store.inviteInfo(alice.clientId), { code: 'solo_table' });

  await store.join({ tableId: 'green-room' }, alice);
  assert.equal(store.inviteInfo(alice.clientId).visibility, 'public');
});

test('ad chips go to the seat at a multiplayer table, not at solo tables', async () => {
  const store = newStore();
  assert.equal(store.addChips(alice.clientId, 100), null, 'not seated: the browser keeps the balance');

  await store.join({ tableId: 'practice', chips: 0 }, alice);
  assert.equal(store.addChips(alice.clientId, 100), null);

  await store.join({ tableId: 'green-room', chips: 0 }, alice);
  assert.equal(store.addChips(alice.clientId, 100), 100);
  assert.equal(store.roundState('green-room').seats[0].chips, 100);
  store.stop();
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

test('"My tables" lists the tables you created, on any device of your account', async () => {
  const store = newStore();
  const laptop = { clientId: 'laptop-001', name: 'Mush', playerId: 'player-mush' };
  const phone = { clientId: 'phone-0001', name: 'Mush', playerId: 'player-mush' };

  await store.create({ name: 'Mine Public' }, laptop);
  await store.create({ name: 'Mine Private', visibility: 'private', password: '1234' }, laptop);
  await store.create({ name: 'Not Mine' }, alice);

  const fromPhone = store.mine(phone).map(t => t.name).sort();
  assert.deepEqual(fromPhone, ['Mine Private', 'Mine Public']);
  assert.ok(store.list(phone).some(t => t.name === 'Mine Private'), 'your private table shows on your other device');
  assert.match(store.mine(phone).find(t => t.name === 'Mine Private').inviteCode, /^[A-Z2-9]{6}$/);
  assert.deepEqual(store.mine(bob), []);
});

test('a table can only be deleted by its creator, and only when empty', async () => {
  const store = newStore();
  const removed = [];
  store.on('removed', id => removed.push(id));
  const { table } = await store.create({ name: 'Doomed' }, alice);

  // Alice is still sitting there
  assert.equal(store.mine(alice)[0].canDelete, false);
  assert.throws(() => store.remove(alice, table.id), { code: 'seated_here' });

  await store.join({ tableId: table.id }, bob);
  store.leave(alice.clientId);
  assert.throws(() => store.remove(alice, table.id), { code: 'not_empty' });
  assert.throws(() => store.remove(bob, table.id), { code: 'not_owner' });

  // Bob leaves for good; Alice's own held seat doesn't block her
  store.leave(bob.clientId);
  store.releaseSeat(table.id, bob.clientId);
  assert.equal(store.mine(alice)[0].canDelete, true);
  assert.deepEqual(store.remove(alice, table.id), { tableId: table.id });

  assert.equal(store.get(table.id), null);
  assert.deepEqual(removed, [table.id]);
  assert.equal(store.seatOf(alice.clientId), null);
  assert.throws(() => store.remove(alice, table.id), { code: 'not_found' });
  assert.throws(() => store.remove(alice, 'green-room'), { code: 'not_owner' });
  store.stop();
});
