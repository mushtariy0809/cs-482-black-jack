const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Player = require('../models/Player');
const GameHistory = require('../models/GameHistory');
const {
  getOverview,
  updatePlayerRole
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
