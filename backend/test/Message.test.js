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

test('validates successfully with private message defaults', async () => {
  const doc = new Message({
    sender: mockSenderId,
    receiver: mockReceiverId,
    message: 'Good luck at the table!',
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });

  assert.equal(doc.chatType, 'private');
  assert.equal(doc.table, null);
  assert.equal(doc.message, 'Good luck at the table!');
});

test('validates successfully with table message', async () => {
  const doc = new Message({
    sender: mockSenderId,
    table: 'table-101',
    chatType: 'table',
    message: 'Hello everyone!',
  });

  await assert.doesNotReject(async () => {
    await doc.validate();
  });

  assert.equal(doc.chatType, 'table');
  assert.equal(doc.receiver, null);
  assert.equal(doc.table, 'table-101');
});

test('trims leading and trailing whitespace from message', () => {
  const doc = new Message({
    sender: mockSenderId,
    receiver: mockReceiverId,
    message: '   Nice hand!   ',
  });

  assert.equal(doc.message, 'Nice hand!');
});

test('receiver and table default to null', () => {
  const doc = new Message({
    sender: mockSenderId,
    message: 'Test message',
  });

  assert.equal(doc.receiver, null);
  assert.equal(doc.table, null);
  assert.equal(doc.chatType, 'private');
});

test('rejects document when required fields (sender or message) are missing', async () => {
  const emptyDoc = new Message({});

  await assert.rejects(
    async () => {
      await emptyDoc.validate();
    },
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.sender, 'sender should be required');
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

test('rejects invalid chatType enum value', async () => {
  const doc = new Message({
    sender: mockSenderId,
    chatType: 'broadcast',
    message: 'Hello',
  });

  await assert.rejects(
    async () => {
      await doc.validate();
    },
    (err) => {
      assert.ok(err.errors.chatType);
      assert.equal(err.errors.chatType.kind, 'enum');
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

test('verifies schema references for sender, receiver, and table', () => {
  const senderPath = Message.schema.path('sender');
  assert.equal(senderPath.options.ref, 'Player');
  assert.equal(senderPath.options.required, true);

  const receiverPath = Message.schema.path('receiver');
  assert.equal(receiverPath.options.ref, 'Player');
  assert.equal(receiverPath.options.default, null);

  const tablePath = Message.schema.path('table');
  assert.equal(tablePath.options.ref, 'Table');
  assert.equal(tablePath.options.default, null);

  const chatTypePath = Message.schema.path('chatType');
  assert.deepEqual(chatTypePath.enumValues, ['private', 'table']);
  assert.equal(chatTypePath.options.default, 'private');
});

test('static getConversation constructs query and sorts by createdAt ascending', () => {
  let capturedQuery = null;
  let capturedSort = null;

  Message.find = (query) => {
    capturedQuery = query;
    return {
      sort: (sortObj) => {
        capturedSort = sortObj;
        return Promise.resolve(['msg1', 'msg2']);
      },
    };
  };

  const p1 = new mongoose.Types.ObjectId();
  const p2 = new mongoose.Types.ObjectId();
  Message.getConversation(p1, p2);

  assert.equal(capturedQuery.chatType, 'private');
  assert.deepEqual(capturedQuery.$or, [
    { sender: p1, receiver: p2 },
    { sender: p2, receiver: p1 },
  ]);
  assert.deepEqual(capturedSort, { createdAt: 1 });
});

test('static getTableMessages queries table messages, populates sender, and sorts', () => {
  let capturedQuery = null;
  let capturedPopulate = null;
  let capturedSort = null;

  Message.find = (query) => {
    capturedQuery = query;
    return {
      populate: (field, select) => {
        capturedPopulate = { field, select };
        return {
          sort: (sortObj) => {
            capturedSort = sortObj;
            return Promise.resolve(['tableMsg']);
          },
        };
      },
    };
  };

  Message.getTableMessages('table-777');

  assert.equal(capturedQuery.chatType, 'table');
  assert.equal(capturedQuery.table, 'table-777');
  assert.deepEqual(capturedPopulate, { field: 'sender', select: 'username' });
  assert.deepEqual(capturedSort, { createdAt: 1 });
});

test('static createPrivateMessage creates message with private chatType', async () => {
  let capturedPayload = null;
  Message.create = (payload) => {
    capturedPayload = payload;
    return Promise.resolve({ _id: 'new-id', ...payload });
  };

  const sId = new mongoose.Types.ObjectId();
  const rId = new mongoose.Types.ObjectId();
  await Message.createPrivateMessage(sId, rId, 'Hello friend!');

  assert.equal(capturedPayload.sender, sId);
  assert.equal(capturedPayload.receiver, rId);
  assert.equal(capturedPayload.chatType, 'private');
  assert.equal(capturedPayload.message, 'Hello friend!');
});

test('static createTableMessage creates message with table chatType', async () => {
  let capturedPayload = null;
  Message.create = (payload) => {
    capturedPayload = payload;
    return Promise.resolve({ _id: 'new-table-id', ...payload });
  };

  const sId = new mongoose.Types.ObjectId();
  await Message.createTableMessage(sId, 'table-42', 'Dealer hits on 16');

  assert.equal(capturedPayload.sender, sId);
  assert.equal(capturedPayload.table, 'table-42');
  assert.equal(capturedPayload.chatType, 'table');
  assert.equal(capturedPayload.message, 'Dealer hits on 16');
});
