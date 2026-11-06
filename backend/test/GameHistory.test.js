const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const GameHistory = require('../models/GameHistory.js');

const mockObjectId = new mongoose.Types.ObjectId();

test('GameHistory model is registered with correct modelName', () => {
  assert.equal(GameHistory.modelName, 'GameHistory');
});

test('schema enables timestamps (createdAt and updatedAt)', () => {
  assert.equal(GameHistory.schema.options.timestamps, true);
  assert.ok(GameHistory.schema.path('createdAt'));
  assert.ok(GameHistory.schema.path('updatedAt'));
});

test('validates successfully with all required fields', async () => {
  const doc = new GameHistory({
    player: mockObjectId,
    result: 'win',
    playerScore: 21,
    dealerScore: 20,
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });
});

test('accepts all allowed result enum values ("win", "loss", "push")', async () => {
  const allowedResults = ['win', 'loss', 'push'];

  for (const result of allowedResults) {
    const doc = new GameHistory({
      player: mockObjectId,
      result,
      playerScore: 20,
      dealerScore: 19,
    });

    await assert.doesNotReject(async () => {
      await doc.validate();
    });
  }
});

test('accepts zero (0) as valid playerScore and dealerScore', async () => {
  const doc = new GameHistory({
    player: mockObjectId,
    result: 'loss',
    playerScore: 0,
    dealerScore: 0,
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });
});

test('rejects document when required fields are missing', async () => {
  const emptyDoc = new GameHistory({});

  await assert.rejects(
    async () => {
      await emptyDoc.validate();
    },
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.player, 'player should be required');
      assert.ok(err.errors.result, 'result should be required');
      assert.ok(err.errors.playerScore, 'playerScore should be required');
      assert.ok(err.errors.dealerScore, 'dealerScore should be required');
      return true;
    }
  );
});

test('rejects missing player', async () => {
  const doc = new GameHistory({
    result: 'win',
    playerScore: 21,
    dealerScore: 17,
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.player);
      return true;
    }
  );
});

test('rejects invalid result enum value', async () => {
  const doc = new GameHistory({
    player: mockObjectId,
    result: 'draw', // not in ['win', 'loss', 'push']
    playerScore: 20,
    dealerScore: 20,
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.result);
      assert.equal(err.errors.result.kind, 'enum');
      return true;
    }
  );
});

test('rejects invalid player ObjectId format', async () => {
  const doc = new GameHistory({
    player: 'invalid-object-id',
    result: 'win',
    playerScore: 21,
    dealerScore: 18,
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.player);
      assert.equal(err.errors.player.name, 'CastError');
      return true;
    }
  );
});

test('rejects non-numeric playerScore and dealerScore', async () => {
  const docInvalidPlayerScore = new GameHistory({
    player: mockObjectId,
    result: 'win',
    playerScore: 'not-a-number',
    dealerScore: 18,
  });

  await assert.rejects(
    async () => {
      await docInvalidPlayerScore.validate();
    },
    (err) => {
      assert.ok(err.errors.playerScore);
      assert.equal(err.errors.playerScore.name, 'CastError');
      return true;
    }
  );

  const docInvalidDealerScore = new GameHistory({
    player: mockObjectId,
    result: 'win',
    playerScore: 21,
    dealerScore: 'not-a-number',
  });

  await assert.rejects(
    async () => {
      await docInvalidDealerScore.validate();
    },
    (err) => {
      assert.ok(err.errors.dealerScore);
      assert.equal(err.errors.dealerScore.name, 'CastError');
      return true;
    }
  );
});

test('verifies player field references "Player" model', () => {
  const playerPath = GameHistory.schema.path('player');
  assert.equal(playerPath.options.ref, 'Player');
  assert.equal(playerPath.options.required, true);
});