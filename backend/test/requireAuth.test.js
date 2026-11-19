const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const Player = require('../models/Player');
const requireAuth = require('../middleware/requireAuth');

process.env.JWT_SECRET = 'auth-middleware-test-secret';

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
      return `Bearer ${token}`;
    }
  };
}

test('requires a bearer token before profile access', async () => {
  const res = response();
  let continued = false;

  await requireAuth(request(null), res, () => { continued = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(continued, false);
});

test('loads the account identified by a valid bearer token', async t => {
  const token = jwt.sign({ playerId: 'player-id' }, process.env.JWT_SECRET);
  const player = { _id: 'player-id' };
  t.mock.method(Player, 'findById', async () => player);
  const req = request(token);
  const res = response();
  let continued = false;

  await requireAuth(req, res, () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(req.player, player);
});
