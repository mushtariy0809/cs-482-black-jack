// Error paths of the friends API: missing IDs, unknown players, duplicates and database failures
const { test } = require('node:test');
const assert = require('node:assert/strict');

const Player = require('../models/Player');
const {
  searchPlayers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  getFriends,
  removeFriend
} = require('./friendsController');

const createResponse = () => ({
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
});

const createPlayer = (id, extra = {}) => ({
  _id: id,
  friends: [],
  sentFriendRequests: [],
  receivedFriendRequests: [],
  save: async () => {},
  ...extra
});

async function call(handler, req) {
  const res = createResponse();
  await handler(req, res);
  return res;
}

// Silence the expected console.error output for 500 cases
function quietErrors(t) {
  t.mock.method(console, 'error', () => {});
}

function playersById(t, players) {
  t.mock.method(Player, 'findById', async id => players[id] ?? null);
}

test('every two-player route rejects a missing ID with 400', async () => {
  const cases = [
    [sendFriendRequest, { senderId: 'a' }],
    [acceptFriendRequest, { playerId: 'a' }],
    [declineFriendRequest, { requesterId: 'b' }],
    [removeFriend, {}]
  ];

  for (const [handler, body] of cases) {
    const res = await call(handler, { body });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Both player IDs are required.');
  }
});

test('every two-player route answers 404 when a player does not exist', async t => {
  playersById(t, { a: createPlayer('a') });

  const cases = [
    [acceptFriendRequest, { playerId: 'a', requesterId: 'ghost' }],
    [declineFriendRequest, { playerId: 'ghost', requesterId: 'a' }],
    [removeFriend, { playerId: 'a', friendId: 'ghost' }]
  ];

  for (const [handler, body] of cases) {
    const res = await call(handler, { body });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, 'Player not found.');
  }
});

test('sendFriendRequest refuses players who are already friends', async t => {
  playersById(t, {
    a: createPlayer('a', { friends: ['b'] }),
    b: createPlayer('b')
  });

  const res = await call(sendFriendRequest, { body: { senderId: 'a', receiverId: 'b' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'You are already friends.');
});

test('sendFriendRequest refuses a second request in either direction', async t => {
  playersById(t, {
    a: createPlayer('a', { sentFriendRequests: ['b'] }),
    b: createPlayer('b'),
    c: createPlayer('c'),
    d: createPlayer('d', { receivedFriendRequests: ['c'] })
  });

  const again = await call(sendFriendRequest, { body: { senderId: 'a', receiverId: 'b' } });
  assert.equal(again.body.message, 'Friend request already sent.');

  const pending = await call(sendFriendRequest, { body: { senderId: 'c', receiverId: 'd' } });
  assert.equal(pending.body.message, 'Friend request already sent.');
});

test('declineFriendRequest needs a pending request', async t => {
  playersById(t, { a: createPlayer('a'), b: createPlayer('b') });

  const res = await call(declineFriendRequest, { body: { playerId: 'a', requesterId: 'b' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Friend request not found.');
});

test('searchPlayers treats the search text literally, not as a regular expression', async t => {
  let query;
  t.mock.method(Player, 'find', filter => {
    query = filter;
    return { select: async () => [] };
  });

  await call(searchPlayers, { query: { username: ' a.b*(c ' } });

  assert.equal(query.username.$regex, 'a\\.b\\*\\(c');
  assert.equal(query.username.$options, 'i');
});

test('database failures become a 500 with a friendly message', async t => {
  quietErrors(t);
  t.mock.method(Player, 'findById', () => {
    throw new Error('database is down');
  });
  t.mock.method(Player, 'find', () => {
    throw new Error('database is down');
  });

  const cases = [
    [searchPlayers, { query: { username: 'bob' } }, 'Unable to search for players.'],
    [sendFriendRequest, { body: { senderId: 'a', receiverId: 'b' } }, 'Unable to send friend request.'],
    [acceptFriendRequest, { body: { playerId: 'a', requesterId: 'b' } }, 'Unable to accept friend request.'],
    [declineFriendRequest, { body: { playerId: 'a', requesterId: 'b' } }, 'Unable to decline friend request.'],
    [removeFriend, { body: { playerId: 'a', friendId: 'b' } }, 'Unable to remove friend.'],
    [getFriends, { params: { playerId: 'a' } }, 'Unable to retrieve friends.']
  ];

  for (const [handler, req, message] of cases) {
    const res = await call(handler, req);
    assert.equal(res.statusCode, 500, message);
    assert.equal(res.body.message, message);
  }
});
