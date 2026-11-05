
const { test } = require('node:test');
const assert = require('node:assert/strict');

const GameHistory = require('../models/GameHistory');

const {
  saveGameHistory,
  getGameHistory
} = require('./gameHistoryController');

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

// Save game history tests

test('saveGameHistory should save a completed game successfully', async (t) => {
  t.mock.method(GameHistory, 'create', async (data) => ({
    _id: 'history123',
    ...data
  }));

  const req = {
    body: {
      playerId: 'player123',
      result: 'win',
      playerScore: 21,
      dealerScore: 18
    }
  };

  const res = createResponse();

  await saveGameHistory(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.message, 'Game history saved successfully.');
  assert.equal(res.body.gameHistory.player, 'player123');
  assert.equal(res.body.gameHistory.result, 'win');
});

test('saveGameHistory should reject missing fields', async () => {
  const req = {
    body: {
      playerId: 'player123',
      result: 'win'
    }
  };

  const res = createResponse();

  await saveGameHistory(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    'All game history fields are required.'
  );
});

test('saveGameHistory should reject invalid game results', async () => {
  const req = {
    body: {
      playerId: 'player123',
      result: 'blackjack',
      playerScore: 21,
      dealerScore: 18
    }
  };

  const res = createResponse();

  await saveGameHistory(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid game result.');
});

test('saveGameHistory should handle database errors', async (t) => {
  t.mock.method(GameHistory, 'create', async () => {
    throw new Error('Database error');
  });

  const req = {
    body: {
      playerId: 'player123',
      result: 'win',
      playerScore: 21,
      dealerScore: 18
    }
  };

  const res = createResponse();

  const originalError = console.error;
  console.error = () => {};

  try {
    await saveGameHistory(req, res);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, 'Failed to save game history.');
});

// Get game history tests

test('getGameHistory should retrieve a player history successfully', async (t) => {
  const history = [
    {
      result: 'win',
      playerScore: 21,
      dealerScore: 18
    },
    {
      result: 'loss',
      playerScore: 17,
      dealerScore: 20
    }
  ];

  const sortMock = t.mock.fn(async () => history);

  t.mock.method(GameHistory, 'find', () => ({
    sort: sortMock
  }));

  const req = {
    params: {
      playerId: 'player123'
    }
  };

  const res = createResponse();

  await getGameHistory(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, history);
  assert.equal(sortMock.mock.calls.length, 1);
  assert.deepEqual(sortMock.mock.calls[0].arguments[0], {
    createdAt: -1
  });
});

test('getGameHistory should handle database errors', async (t) => {
  t.mock.method(GameHistory, 'find', () => {
    throw new Error('Database error');
  });

  const req = {
    params: {
      playerId: 'player123'
    }
  };

  const res = createResponse();

  const originalError = console.error;
  console.error = () => {};

  try {
    await getGameHistory(req, res);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.equal(
    res.body.message,
    'Failed to retrieve game history.'
  );
});
