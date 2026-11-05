
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

// Mock response object
const createResponse = () => {
  const res = {
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

  return res;
};

// Create mock player
const createPlayer = (id, username) => ({
  _id: id,
  username,
  friends: [],
  sentFriendRequests: [],
  receivedFriendRequests: [],
  save: async () => {}
});

// Create mock ID with equals method
const createId = (id) => ({
  equals(other) {
    return id === other;
  }
});

// Mock Mongoose-style array methods
const createMockArray = (items = []) => {
  const array = [...items];

  array.pull = (id) => {
    const index = array.findIndex(item =>
      typeof item === 'object' ? item.equals(id) : item === id
    );

    if (index !== -1) {
      array.splice(index, 1);
    }
  };

  array.addToSet = (id) => {
    if (!array.some(item =>
      typeof item === 'object' ? item.equals(id) : item === id
    )) {
      array.push(id);
    }
  };

  return array;
};

// Search players tests

test('searchPlayers should find players by username', async (t) => {
  const players = [
    { username: 'PlayerOne' },
    { username: 'PlayerTwo' }
  ];

  const selectMock = t.mock.fn(async () => players);

  t.mock.method(Player, 'find', () => ({
    select: selectMock
  }));

  const req = {
    query: { username: 'Player' }
  };

  const res = createResponse();

  await searchPlayers(req, res);

  assert.deepEqual(res.body, players);
  assert.equal(selectMock.mock.calls[0].arguments[0],
    'username profilePicture');
});

test('searchPlayers should reject an empty username', async () => {
  const req = {
    query: { username: '   ' }
  };

  const res = createResponse();

  await searchPlayers(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Please enter a username.');
});

// Send friend request tests

test('sendFriendRequest should send a request successfully', async (t) => {
  const sender = createPlayer('player1', 'PlayerOne');
  const receiver = createPlayer('player2', 'PlayerTwo');

  t.mock.method(Player, 'findById', async (id) =>
    id === 'player1' ? sender : receiver
  );

  const req = {
    body: {
      senderId: 'player1',
      receiverId: 'player2'
    }
  };

  const res = createResponse();

  await sendFriendRequest(req, res);

  assert.equal(res.body.message, 'Friend request sent successfully!');
  assert.deepEqual(sender.sentFriendRequests, ['player2']);
  assert.deepEqual(receiver.receivedFriendRequests, ['player1']);
});

test('sendFriendRequest should reject sending a request to yourself', async () => {
  const req = {
    body: {
      senderId: 'player1',
      receiverId: 'player1'
    }
  };

  const res = createResponse();

  await sendFriendRequest(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    'You cannot send a friend request to yourself.'
  );
});

test('sendFriendRequest should reject players that do not exist', async (t) => {
  t.mock.method(Player, 'findById', async () => null);

  const req = {
    body: {
      senderId: 'player1',
      receiverId: 'player2'
    }
  };

  const res = createResponse();

  await sendFriendRequest(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Player not found.');
});

// Accept friend request tests

test('acceptFriendRequest should accept a request successfully', async (t) => {
  const player = createPlayer('player1', 'PlayerOne');
  const requester = createPlayer('player2', 'PlayerTwo');

  player.receivedFriendRequests = createMockArray([
    createId('player2')
  ]);

  requester.sentFriendRequests = createMockArray([
    createId('player1')
  ]);

  player.friends = createMockArray();
  requester.friends = createMockArray();

  t.mock.method(Player, 'findById', async (id) =>
    id === 'player1' ? player : requester
  );

  const req = {
    body: {
      playerId: 'player1',
      requesterId: 'player2'
    }
  };

  const res = createResponse();

  await acceptFriendRequest(req, res);

  assert.equal(res.body.message, 'Friend request accepted!');
  assert.equal(player.receivedFriendRequests.length, 0);
  assert.equal(requester.sentFriendRequests.length, 0);
  assert.deepEqual([...player.friends], ['player2']);
  assert.deepEqual([...requester.friends], ['player1']);
});

test('acceptFriendRequest should reject a request that does not exist', async (t) => {
  const player = createPlayer('player1', 'PlayerOne');
  const requester = createPlayer('player2', 'PlayerTwo');

  player.receivedFriendRequests = createMockArray();

  t.mock.method(Player, 'findById', async (id) =>
    id === 'player1' ? player : requester
  );

  const req = {
    body: {
      playerId: 'player1',
      requesterId: 'player2'
    }
  };

  const res = createResponse();

  await acceptFriendRequest(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Friend request not found.');
});

// Decline friend request tests

test('declineFriendRequest should decline a request successfully', async (t) => {
  const player = createPlayer('player1', 'PlayerOne');
  const requester = createPlayer('player2', 'PlayerTwo');

  player.receivedFriendRequests = createMockArray([
    createId('player2')
  ]);

  requester.sentFriendRequests = createMockArray([
    createId('player1')
  ]);

  t.mock.method(Player, 'findById', async (id) =>
    id === 'player1' ? player : requester
  );

  const req = {
    body: {
      playerId: 'player1',
      requesterId: 'player2'
    }
  };

  const res = createResponse();

  await declineFriendRequest(req, res);

  assert.equal(res.body.message, 'Friend request declined.');
  assert.equal(player.receivedFriendRequests.length, 0);
  assert.equal(requester.sentFriendRequests.length, 0);
});

// Get friends tests

test('getFriends should retrieve friends and friend requests', async (t) => {
  const friends = [{ username: 'PlayerTwo' }];
  const requests = [{ username: 'PlayerThree' }];

  const player = {
    friends,
    receivedFriendRequests: requests
  };

  const populateMock = t.mock.fn(() => ({
    populate: populateMockSecond
  }));

  const populateMockSecond = t.mock.fn(async () => player);

  t.mock.method(Player, 'findById', () => ({
    populate: populateMock
  }));

  const req = {
    params: { playerId: 'player1' }
  };

  const res = createResponse();

  await getFriends(req, res);

  assert.deepEqual(res.body, {
    friends,
    friendRequests: requests
  });

  assert.equal(populateMock.mock.calls[0].arguments[0], 'friends');
  assert.equal(
    populateMockSecond.mock.calls[0].arguments[0],
    'receivedFriendRequests'
  );
});

test('getFriends should return 404 when player does not exist', async (t) => {
  t.mock.method(Player, 'findById', () => ({
    populate: () => ({
      populate: async () => null
    })
  }));

  const req = {
    params: { playerId: 'missingPlayer' }
  };

  const res = createResponse();

  await getFriends(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Player not found.');
});

// Remove friend tests

test('removeFriend should remove both players from each other successfully', async (t) => {
  const player = createPlayer('player1', 'PlayerOne');
  const friend = createPlayer('player2', 'PlayerTwo');

  player.friends = createMockArray(['player2']);
  friend.friends = createMockArray(['player1']);

  t.mock.method(Player, 'findById', async (id) =>
    id === 'player1' ? player : friend
  );

  const req = {
    body: {
      playerId: 'player1',
      friendId: 'player2'
    }
  };

  const res = createResponse();

  await removeFriend(req, res);

  assert.equal(res.body.message, 'Friend removed successfully!');
  assert.equal(player.friends.length, 0);
  assert.equal(friend.friends.length, 0);
});
