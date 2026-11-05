
const { test } = require('node:test');
const assert = require('node:assert/strict');

const mongoose = require('mongoose');
const Message = require('../models/Message');
const Player = require('../models/Player');

const {
  sendMessage,
  getMessages
} = require('./messagesController');

const senderId = '507f1f77bcf86cd799439011';
const receiverId = '507f1f77bcf86cd799439012';

function createResponse() {
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

function createPlayer(id, friends = []) {
  return {
    _id: id,
    friends
  };
}

// Send message tests

test('sendMessage should send a message successfully', async (t) => {
  const sender = createPlayer(senderId, [receiverId]);
  const receiver = createPlayer(receiverId);

  const newMessage = {
    sender: senderId,
    receiver: receiverId,
    message: 'Hello!'
  };

  t.mock.method(Player, 'findById', async (id) => {
    return id === senderId ? sender : receiver;
  });

  const createMock = t.mock.method(
    Message,
    'createPrivateMessage',
    async () => newMessage
  );

  const req = {
    body: {
      senderId,
      receiverId,
      message: '  Hello!  '
    }
  };

  const res = createResponse();

  await sendMessage(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, newMessage);

  assert.deepEqual(createMock.mock.calls[0].arguments, [
    senderId,
    receiverId,
    'Hello!'
  ]);
});

test('sendMessage should reject missing fields', async () => {
  const req = {
    body: {
      senderId,
      receiverId,
      message: ' '
    }
  };

  const res = createResponse();

  await sendMessage(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'All fields are required.');
});

test('sendMessage should reject invalid player IDs', async () => {
  const req = {
    body: {
      senderId: 'invalid',
      receiverId,
      message: 'Hello!'
    }
  };

  const res = createResponse();

  await sendMessage(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid player ID.');
});

test('sendMessage should return 404 when a player does not exist', async (t) => {
  t.mock.method(Player, 'findById', async () => null);

  const req = {
    body: {
      senderId,
      receiverId,
      message: 'Hello!'
    }
  };

  const res = createResponse();

  await sendMessage(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Player not found.');
});

test('sendMessage should reject messages to non-friends', async (t) => {
  const sender = createPlayer(senderId, []);
  const receiver = createPlayer(receiverId);

  t.mock.method(Player, 'findById', async (id) => {
    return id === senderId ? sender : receiver;
  });

  const req = {
    body: {
      senderId,
      receiverId,
      message: 'Hello!'
    }
  };

  const res = createResponse();

  await sendMessage(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(
    res.body.message,
    'You can only message your friends.'
  );
});

test('sendMessage should return 500 when sending fails', async (t) => {
  t.mock.method(Player, 'findById', async () => {
    throw new Error('Database error');
  });

  t.mock.method(console, 'error', () => {});

  const req = {
    body: {
      senderId,
      receiverId,
      message: 'Hello!'
    }
  };

  const res = createResponse();

  await sendMessage(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, 'Unable to send message.');
});

// Get messages tests

test('getMessages should retrieve a conversation successfully', async (t) => {
  const messages = [
    { message: 'Hello!' },
    { message: 'Hi!' }
  ];

  const player = createPlayer(senderId, [
    {
      equals: (id) => id === receiverId
    }
  ]);

  t.mock.method(Player, 'findById', async () => player);

  const populateReceiver = t.mock.fn(async () => messages);

  const populateSender = t.mock.fn(() => ({
    populate: populateReceiver
  }));

  const sortMock = t.mock.fn(() => ({
    populate: populateSender
  }));

  const findMock = t.mock.method(Message, 'find', () => ({
    sort: sortMock
  }));

  const req = {
    params: {
      playerId: senderId,
      friendId: receiverId
    }
  };

  const res = createResponse();

  await getMessages(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, messages);

  assert.deepEqual(findMock.mock.calls[0].arguments[0], {
    $or: [
      { sender: senderId, receiver: receiverId },
      { sender: receiverId, receiver: senderId }
    ]
  });

  assert.deepEqual(sortMock.mock.calls[0].arguments[0], {
    createdAt: 1
  });

  assert.equal(populateSender.mock.calls[0].arguments[0], 'sender');
  assert.equal(populateReceiver.mock.calls[0].arguments[0], 'receiver');
});

test('getMessages should reject invalid player IDs', async () => {
  const req = {
    params: {
      playerId: 'invalid',
      friendId: receiverId
    }
  };

  const res = createResponse();

  await getMessages(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid player ID.');
});

test('getMessages should reject conversations with non-friends', async (t) => {
  const player = createPlayer(senderId, []);

  t.mock.method(Player, 'findById', async () => player);

  const req = {
    params: {
      playerId: senderId,
      friendId: receiverId
    }
  };

  const res = createResponse();

  await getMessages(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(
    res.body.message,
    'You can only view conversations with your friends.'
  );
});

test('getMessages should return 500 when retrieving messages fails', async (t) => {
  t.mock.method(Player, 'findById', async () => {
    throw new Error('Database error');
  });

  t.mock.method(console, 'error', () => {});

  const req = {
    params: {
      playerId: senderId,
      friendId: receiverId
    }
  };

  const res = createResponse();

  await getMessages(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, 'Unable to retrieve messages.');
});
