const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const FeedbackTicket = require('../models/FeedbackTicket');
const {
  submitFeedback,
  listMyFeedback,
  updateFeedback
} = require('./feedbackController');

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

function queryResult(result) {
  const query = {
    sort(value) {
      query.sortValue = value;
      return query;
    },
    populate() {
      return query;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    }
  };
  return query;
}

test('submits a trimmed ticket for the authenticated player', async t => {
  const playerId = new mongoose.Types.ObjectId();
  const create = t.mock.method(FeedbackTicket, 'create', async data => data);
  const res = response();

  await submitFeedback({
    player: { _id: playerId },
    body: {
      title: '  Table freezes  ',
      importance: 'high',
      description: '  The table stops responding after I hit.  ',
      submittedBy: new mongoose.Types.ObjectId()
    }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(create.mock.calls[0].arguments[0].submittedBy, playerId);
  assert.equal(res.body.title, 'Table freezes');
  assert.equal(res.body.description, 'The table stops responding after I hit.');
});

test('rejects empty or unsupported ticket submissions', async () => {
  const res = response();
  await submitFeedback({
    player: { _id: new mongoose.Types.ObjectId() },
    body: { title: ' ', importance: 'urgent', description: ' ' }
  }, res);

  assert.equal(res.statusCode, 400);
});

test('lists only the authenticated player’s own feedback', async t => {
  const playerId = new mongoose.Types.ObjectId();
  const tickets = [{ _id: 'mine' }];
  let filter;
  t.mock.method(FeedbackTicket, 'find', query => {
    filter = query;
    return queryResult(tickets);
  });
  const res = response();

  await listMyFeedback({ player: { _id: playerId } }, res);

  assert.deepEqual(filter, { submittedBy: playerId });
  assert.deepEqual(res.body, tickets);
});

test('admin can reply and update the status of a ticket', async t => {
  const ticketId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const ticket = { _id: ticketId, status: 'resolved' };
  let update;
  t.mock.method(FeedbackTicket, 'findByIdAndUpdate', (id, changes, options) => {
    update = { id, changes, options };
    return queryResult(ticket);
  });
  const res = response();

  await updateFeedback({
    params: { ticketId: String(ticketId) },
    admin: { _id: adminId },
    body: { reply: '  We fixed the issue.  ', status: 'resolved' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(update.changes, {
    $set: { status: 'resolved' },
    $push: {
      replies: {
        sender: adminId,
        senderRole: 'admin',
        message: 'We fixed the issue.'
      }
    }
  });
  assert.deepEqual(update.options, { new: true, runValidators: true });
  assert.equal(res.body, ticket);
});
