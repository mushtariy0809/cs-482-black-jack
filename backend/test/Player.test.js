const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Player = require('../models/Player.js');

test('Player model is registered with correct modelName', () => {
  assert.equal(Player.modelName, 'Player');
});

test('schema enables timestamps (createdAt and updatedAt)', () => {
  assert.equal(Player.schema.options.timestamps, true);
  assert.ok(Player.schema.path('createdAt'));
  assert.ok(Player.schema.path('updatedAt'));
});

test('validates successfully with required fields and initializes default values', async () => {
  const doc = new Player({
    username: 'dealer_ace',
    email: 'dealer@casino.com',
    password: 'securePassword123',
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });

  assert.equal(doc.profilePicture, '');
  assert.deepEqual(doc.friends, []);
  assert.deepEqual(doc.sentFriendRequests, []);
  assert.deepEqual(doc.receivedFriendRequests, []);
});

test('converts email to lowercase and trims whitespace', () => {
  const doc = new Player({
    username: '  cardShark  ',
    email: '   PlayerOne@CASINO.COM   ',
    password: 'password123',
  });

  assert.equal(doc.username, 'cardShark');
  assert.equal(doc.email, 'playerone@casino.com');
});

test('accepts custom profilePicture', async () => {
  const doc = new Player({
    username: 'poker_king',
    email: 'king@cards.com',
    password: 'password123',
    profilePicture: 'https://example.com/avatar.png',
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });

  assert.equal(doc.profilePicture, 'https://example.com/avatar.png');
});

test('accepts valid ObjectIds in friend arrays', async () => {
  const friendId = new mongoose.Types.ObjectId();
  const sentId = new mongoose.Types.ObjectId();
  const receivedId = new mongoose.Types.ObjectId();

  const doc = new Player({
    username: 'social_player',
    email: 'social@cards.com',
    password: 'password123',
    friends: [friendId],
    sentFriendRequests: [sentId],
    receivedFriendRequests: [receivedId],
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });

  assert.equal(doc.friends[0].toString(), friendId.toString());
  assert.equal(doc.sentFriendRequests[0].toString(), sentId.toString());
  assert.equal(doc.receivedFriendRequests[0].toString(), receivedId.toString());
});

test('rejects document when required fields are missing', async () => {
  const emptyDoc = new Player({});

  await assert.rejects(
    async () => {
      await emptyDoc.validate();
    },
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.username, 'username should be required');
      assert.ok(err.errors.email, 'email should be required');
      assert.ok(err.errors.password, 'password should be required');
      return true;
    }
  );
});

test('rejects missing username', async () => {
  const doc = new Player({
    email: 'test@example.com',
    password: 'password123',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.username);
      return true;
    }
  );
});

test('rejects missing email', async () => {
  const doc = new Player({
    username: 'test_user',
    password: 'password123',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.email);
      return true;
    }
  );
});

test('rejects missing password', async () => {
  const doc = new Player({
    username: 'test_user',
    email: 'test@example.com',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.password);
      return true;
    }
  );
});

test('rejects invalid ObjectId formats in friend and request arrays', async () => {
  const docInvalidFriend = new Player({
    username: 'user1',
    email: 'user1@test.com',
    password: 'password123',
    friends: ['not-an-object-id'],
  });

  await assert.rejects(
    async () => {
      await docInvalidFriend.validate();
    },
    (err) => {
      assert.ok(err.errors['friends.0']);
      assert.equal(err.errors['friends.0'].name, 'CastError');
      return true;
    }
  );

  const docInvalidSent = new Player({
    username: 'user2',
    email: 'user2@test.com',
    password: 'password123',
    sentFriendRequests: ['not-an-object-id'],
  });

  await assert.rejects(
    async () => {
      await docInvalidSent.validate();
    },
    (err) => {
      assert.ok(err.errors['sentFriendRequests.0']);
      assert.equal(err.errors['sentFriendRequests.0'].name, 'CastError');
      return true;
    }
  );

  const docInvalidReceived = new Player({
    username: 'user3',
    email: 'user3@test.com',
    password: 'password123',
    receivedFriendRequests: ['not-an-object-id'],
  });

  await assert.rejects(
    async () => {
      await docInvalidReceived.validate();
    },
    (err) => {
      assert.ok(err.errors['receivedFriendRequests.0']);
      assert.equal(err.errors['receivedFriendRequests.0'].name, 'CastError');
      return true;
    }
  );
});

test('verifies schema indexes and refs on friend arrays', () => {
  assert.equal(Player.schema.path('username').options.unique, true);
  assert.equal(Player.schema.path('email').options.unique, true);
  assert.equal(Player.schema.path('friends').options.type[0].ref, 'Player');
  assert.equal(Player.schema.path('sentFriendRequests').options.type[0].ref, 'Player');
  assert.equal(Player.schema.path('receivedFriendRequests').options.type[0].ref, 'Player');
});