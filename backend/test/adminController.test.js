const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Player = require('../models/Player');
const GameHistory = require('../models/GameHistory');
const bcrypt = require('bcryptjs');
const {
  getOverview,
  createPlayer,
  updatePlayerRole,
  grantPlayerChips,
  deletePlayer
} = require('../controllers/adminController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

test('admin overview returns stored game results and live table data', async t => {
  t.mock.method(Player, 'countDocuments', async () => 3);
  t.mock.method(GameHistory, 'countDocuments', async () => 8);
  t.mock.method(GameHistory, 'aggregate', async pipeline => (
    pipeline[0].$group?._id === '$result'
      ? [{ _id: 'win', count: 5 }, { _id: 'loss', count: 2 }, { _id: 'push', count: 1 }]
      : [{ _id: '2026-11-12', count: 4 }]
  ));

  const res = response();
  await getOverview({
    app: {
      locals: {
        io: { engine: { clientsCount: 6 } },
        tableStore: {
          list: () => [{
            id: 'table1',
            name: 'Green Room',
            visibility: 'public',
            mode: 'people',
            isSystem: true,
            players: 2,
            maxSeats: 5,
            status: 'waiting',
            seats: []
          }]
        }
      }
    }
  }, res);

  assert.equal(res.body.metrics.players, 3);
  assert.equal(res.body.metrics.rounds, 8);
  assert.equal(res.body.metrics.onlineNow, 6);
  assert.equal(res.body.metrics.activeTables, 1);
  assert.deepEqual(res.body.results, { win: 5, loss: 2, push: 1 });
  assert.equal(res.body.tables[0].name, 'Green Room');
});

test('last admin cannot be demoted', async t => {
  const adminId = new mongoose.Types.ObjectId();
  const save = t.mock.fn();
  t.mock.method(Player, 'findById', async () => ({
    _id: adminId,
    username: 'Admin',
    role: 'admin',
    save
  }));
  t.mock.method(Player, 'countDocuments', async () => 1);
  const res = response();

  await updatePlayerRole({
    params: { playerId: String(adminId) },
    body: { role: 'player' },
    admin: { _id: new mongoose.Types.ObjectId() }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /last admin/);
  assert.equal(save.mock.calls.length, 0);
});

test('grantPlayerChips adds 1000 chips to the selected player account and notifies online clients', async t => {
  const playerId = new mongoose.Types.ObjectId();
  const save = t.mock.fn(async () => {});
  const emit = t.mock.fn();
  const to = t.mock.fn(() => ({ emit }));
  const addChips = t.mock.fn();

  const player = {
    _id: playerId,
    username: 'catslover',
    email: 'cat@example.com',
    role: 'player',
    chips: 1000,
    createdAt: new Date('2026-11-07T00:00:00.000Z'),
    save
  };
  t.mock.method(Player, 'findById', async () => player);

  const res = response();
  await grantPlayerChips({
    params: { playerId: String(playerId) },
    body: { amount: 1000 },
    app: {
      locals: {
        tableStore: { addChips },
        io: {
          to,
          sockets: {
            sockets: new Map([
              ['sock-1', { data: { client: { playerId: String(playerId), clientId: 'client-123' } } }]
            ])
          }
        }
      }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(player.chips, 2000);
  assert.equal(res.body.chips, 2000);
  assert.equal(save.mock.calls.length, 1);
  assert.equal(addChips.mock.calls.length, 1);
  assert.deepEqual(addChips.mock.calls[0].arguments, ['client-123', 1000]);
  assert.deepEqual(to.mock.calls[0].arguments, [`player:${playerId}`]);
  assert.deepEqual(emit.mock.calls[0].arguments, ['chips:granted', { amount: 1000, chips: 2000 }]);
});

test('grantPlayerChips rejects invalid player IDs', async () => {
  const res = response();
  await grantPlayerChips({
    params: { playerId: 'not-a-valid-id' },
    body: {}
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid player ID.');
});

test('createPlayer creates a new player account with hashed password and starting chips', async t => {
  const playerId = new mongoose.Types.ObjectId();
  t.mock.method(Player, 'findOne', async () => null);
  t.mock.method(bcrypt, 'hash', async () => 'hashed-pass');
  const create = t.mock.method(Player, 'create', async data => ({
    _id: playerId,
    username: data.username,
    email: data.email,
    role: data.role,
    chips: data.chips,
    createdAt: new Date('2026-11-18T00:00:00.000Z')
  }));

  const res = response();
  await createPlayer({
    body: {
      username: 'NewPlayer',
      email: 'NEW@EXAMPLE.COM',
      password: 'password123',
      role: 'player',
      chips: 1500
    }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.username, 'NewPlayer');
  assert.equal(res.body.email, 'new@example.com');
  assert.equal(res.body.chips, 1500);
  assert.equal(create.mock.calls[0].arguments[0].password, 'hashed-pass');
});

test('deletePlayer removes a selected account, cleans friend links, and blocks self-deletion', async t => {
  const adminId = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId();
  const disconnect = t.mock.fn();

  const selfRes = response();
  await deletePlayer({
    params: { playerId: String(adminId) },
    admin: { _id: adminId }
  }, selfRes);
  assert.equal(selfRes.statusCode, 400);
  assert.match(selfRes.body.message, /your own admin account/);

  t.mock.method(Player, 'findById', async () => ({
    _id: targetId,
    username: 'catslover',
    role: 'player'
  }));
  const updateMany = t.mock.method(Player, 'updateMany', async () => ({ modifiedCount: 1 }));
  const findByIdAndDelete = t.mock.method(Player, 'findByIdAndDelete', async () => ({ _id: targetId }));

  const res = response();
  await deletePlayer({
    params: { playerId: String(targetId) },
    admin: { _id: adminId },
    app: {
      locals: {
        io: {
          sockets: {
            sockets: new Map([
              ['sock-1', { data: { client: { playerId: String(targetId) } }, disconnect }]
            ])
          }
        }
      }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, String(targetId));
  assert.equal(disconnect.mock.calls.length, 1);
  assert.equal(updateMany.mock.calls.length, 1);
  assert.equal(findByIdAndDelete.mock.calls.length, 1);
});