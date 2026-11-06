const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Message = require('../models/Message.js');

const mockSenderId = new mongoose.Types.ObjectId();
const mockReceiverId = new mongoose.Types.ObjectId();

test('Message model is registered with correct modelName', () => {
  assert.equal(Message.modelName, 'Message');
});

test('schema enables timestamps (createdAt and updatedAt)', () => {
  assert.equal(Message.schema.options.timestamps, true);
  assert.ok(Message.schema.path('createdAt'));
  assert.ok(Message.schema.path('updatedAt'));
});

test('validates successfully with valid sender, receiver, and message', async () => {
  const doc = new Message({
    sender: mockSenderId,
    receiver: mockReceiverId,
    message: 'Good luck at the table!',
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });
});

test('trims leading and trailing whitespace from message', () => {
  const doc = new Message({
    sender: mockSenderId,
    receiver: mockReceiverId,
    message: '   Nice hand!   ',
  });

  assert.equal(doc.message, 'Nice hand!');
});

test('rejects document when all required fields are missing', async () => {
  const emptyDoc = new Message({});

  await assert.rejects(
    async () => {
      await emptyDoc.validate();
    },
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.sender, 'sender should be required');
      assert.ok(err.errors.receiver, 'receiver should be required');
      assert.ok(err.errors.message, 'message should be required');
      return true;
    }
  );
});

test('rejects missing sender', async () => {
  const doc = new Message({
    receiver: mockReceiverId,
    message: 'Hello',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.sender);
      return true;
    }
  );
});

test('rejects missing receiver', async () => {
  const doc = new Message({
    sender: mockSenderId,
    message: 'Hello',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.receiver);
      return true;
    }
  );
});

test('rejects missing or empty message', async () => {
  const docMissingMessage = new Message({
    sender: mockSenderId,
    receiver: mockReceiverId,
  });

  await assert.rejects(
    async () => {
      await docMissingMessage.validate();
    },
    (err) => {
      assert.ok(err.errors.message);
      return true;
    }
  );

  const docWhitespaceOnly = new Message({
    sender: mockSenderId,
    receiver: mockReceiverId,
    message: '     ',
  });

  await assert.rejects(
    async () => {
      await docWhitespaceOnly.validate();
    },
    (err) => {
      assert.ok(err.errors.message);
      return true;
    }
  );
});

test('rejects invalid sender ObjectId format', async () => {
  const doc = new Message({
    sender: 'invalid-sender-id',
    receiver: mockReceiverId,
    message: 'Check your cards',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.sender);
      assert.equal(err.errors.sender.name, 'CastError');
      return true;
    }
  );
});

test('rejects invalid receiver ObjectId format', async () => {
  const doc = new Message({
    sender: mockSenderId,
    receiver: 'invalid-receiver-id',
    message: 'Check your cards',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.receiver);
      assert.equal(err.errors.receiver.name, 'CastError');
      return true;
    }
  );
});

test('verifies sender and receiver reference the "Player" model', () => {
  const senderPath = Message.schema.path('sender');
  assert.equal(senderPath.options.ref, 'Player');
  assert.equal(senderPath.options.required, true);

  const receiverPath = Message.schema.path('receiver');
  assert.equal(receiverPath.options.ref, 'Player');
  assert.equal(receiverPath.options.required, true);
});