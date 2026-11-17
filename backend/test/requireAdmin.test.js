const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const Player = require('../models/Player');
const requireAdmin = require('../middleware/requireAdmin');

process.env.JWT_SECRET = 'admin-middleware-test-secret';

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

function request(token) {
  return {
    get(name) {
      if (name !== 'authorization' || !token) return undefined;
      return ['Bearer', token].join(' ');
    }
  };
}

test('requires a bearer token', async () => {
  const res = response();
  let continued = false;

  await requireAdmin(request(null), res, () => { continued = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(continued, false);
});

test('checks the current database role instead of trusting the token role', async t => {
  const token = jwt.sign({ playerId: 'player-id', role: 'admin' }, process.env.JWT_SECRET);
  t.mock.method(Player, 'findById', async () => ({ role: 'player' }));
  const res = response();
  let continued = false;

  await requireAdmin(request(token), res, () => { continued = true; });

  assert.equal(res.statusCode, 403);
  assert.equal(continued, false);
});

test('continues for a current admin account', async t => {
  const token = jwt.sign({ playerId: 'admin-id', role: 'player' }, process.env.JWT_SECRET);
  const admin = { _id: 'admin-id', role: 'admin' };
  t.mock.method(Player, 'findById', async () => admin);
  const req = request(token);
  const res = response();
  let continued = false;

  await requireAdmin(req, res, () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(req.admin, admin);
});
