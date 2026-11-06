const test = require('node:test');
const assert = require('node:assert/strict');
const Table = require('../models/Table.js');
const { startRealtime } = require('../realtime/index.js');

/**
 * Socket.IO mock that supports middleware (.use), listeners (.on), and emitters (.emit)
 */
const createMockIo = () => ({
  use: () => {},
  on: () => {},
  emit: () => {},
  to: () => ({ emit: () => {} }),
  in: () => ({ emit: () => {} }),
});

// Ensure Mongoose operations are always mocked so background operations
// (like ensureSystemTables) never try to connect or buffer for MongoDB
test.beforeEach(() => {
  Table.find = () => ({
    lean: () => Promise.resolve([
      { _id: 'tbl-init-1', name: 'Loaded Table 1' },
      { _id: 'tbl-init-2', name: 'Loaded Table 2' }
    ])
  });
  Table.findByIdAndUpdate = (id, update, options) => Promise.resolve({ _id: id, ...update });
  Table.deleteOne = (filter) => Promise.resolve({ acknowledged: true, deletedCount: 1 });
});

test('startRealtime initializes store, loads tables, and sets up sweep interval', async (t) => {
  t.mock.timers.enable();

  let leanCalled = false;
  Table.find = () => ({
    lean: () => {
      leanCalled = true;
      return Promise.resolve([
        { _id: 'tbl-init-1', name: 'Loaded Table 1' },
        { _id: 'tbl-init-2', name: 'Loaded Table 2' },
      ]);
    },
  });

  const store = await startRealtime(createMockIo());

  assert.equal(leanCalled, true);
  assert.ok(store);
  assert.equal(typeof store.persist.save, 'function');
  assert.equal(typeof store.persist.remove, 'function');

  // Verify sweep interval runs periodically (every 30s)
  let sweepCalls = 0;
  store.sweepIdle = () => {
    sweepCalls++;
  };

  t.mock.timers.tick(30000);
  assert.equal(sweepCalls, 1);

  t.mock.timers.tick(30000);
  assert.equal(sweepCalls, 2);

  t.mock.timers.reset();
});

test('store.persist.save calls Table.findByIdAndUpdate with all table fields and upsert', async () => {
  const updateCalls = [];
  Table.findByIdAndUpdate = (id, update, options) => {
    updateCalls.push({ id, update, options });
    return Promise.resolve({ id, ...update });
  };

  const store = await startRealtime(createMockIo());
  // Clear any saves triggered by ensureSystemTables during startup
  updateCalls.length = 0;

  const emptyDate = new Date();
  const tableData = {
    id: 'tbl-vip-777',
    name: 'VIP High Stakes',
    visibility: 'private',
    passwordHash: 'secret_hash_value',
    inviteCode: 'INV-777',
    mode: 'bots',
    solo: true,
    maxSeats: 7,
    seats: [{ index: 0, clientId: 'bot-1', name: 'Bot Alice' }],
    minBet: 50,
    maxBet: 2500,
    status: 'in_game',
    createdBy: 'admin-user',
    isSystem: true,
    emptySince: emptyDate,
  };

  await store.persist.save(tableData);

  assert.equal(updateCalls.length, 1);
  const call = updateCalls[0];
  assert.equal(call.id, 'tbl-vip-777');
  assert.deepEqual(call.options, { upsert: true });

  assert.equal(call.update.name, 'VIP High Stakes');
  assert.equal(call.update.visibility, 'private');
  assert.equal(call.update.passwordHash, 'secret_hash_value');
  assert.equal(call.update.inviteCode, 'INV-777');
  assert.equal(call.update.mode, 'bots');
  assert.equal(call.update.solo, true);
  assert.equal(call.update.maxSeats, 7);
  assert.deepEqual(call.update.seats, [{ index: 0, clientId: 'bot-1', name: 'Bot Alice' }]);
  assert.equal(call.update.minBet, 50);
  assert.equal(call.update.maxBet, 2500);
  assert.equal(call.update.status, 'in_game');
  assert.equal(call.update.createdBy, 'admin-user');
  assert.equal(call.update.isSystem, true);
  assert.equal(call.update.emptySince, emptyDate);
});

test('store.persist.remove calls Table.deleteOne with _id', async () => {
  const deleteCalls = [];
  Table.deleteOne = (filter) => {
    deleteCalls.push(filter);
    return Promise.resolve({ acknowledged: true, deletedCount: 1 });
  };

  const store = await startRealtime(createMockIo());
  deleteCalls.length = 0;

  await store.persist.remove('tbl-to-delete');

  assert.equal(deleteCalls.length, 1);
  assert.deepEqual(deleteCalls[0], { _id: 'tbl-to-delete' });
});

test('store.persist queues sequential writes on the same table id', async () => {
  const executionOrder = [];
  Table.findByIdAndUpdate = (id, update) => {
    executionOrder.push(update.name);
    return Promise.resolve();
  };

  const store = await startRealtime(createMockIo());
  // Clear any writes triggered during ensureSystemTables
  executionOrder.length = 0;

  // Dispatch two concurrent save calls for the same table id
  const p1 = store.persist.save({ id: 'tbl-shared', name: 'First Update' });
  const p2 = store.persist.save({ id: 'tbl-shared', name: 'Second Update' });

  await Promise.all([p1, p2]);

  assert.equal(executionOrder.length, 2);
  assert.equal(executionOrder[0], 'First Update');
  assert.equal(executionOrder[1], 'Second Update');
});

test('store.persist handles multiple independent table ids in parallel', async () => {
  const processedIds = [];
  Table.findByIdAndUpdate = (id) => {
    processedIds.push(id);
    return Promise.resolve();
  };

  const store = await startRealtime(createMockIo());
  processedIds.length = 0;

  const p1 = store.persist.save({ id: 'table-A', name: 'Table A' });
  const p2 = store.persist.save({ id: 'table-B', name: 'Table B' });

  await Promise.all([p1, p2]);

  assert.equal(processedIds.includes('table-A'), true);
  assert.equal(processedIds.includes('table-B'), true);
});
