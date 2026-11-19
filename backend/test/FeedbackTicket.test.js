const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const FeedbackTicket = require('../models/FeedbackTicket');

const playerId = new mongoose.Types.ObjectId();

test('feedback ticket stores importance, status, and timestamps', async () => {
  const ticket = new FeedbackTicket({
    submittedBy: playerId,
    title: '  Sound settings reset  ',
    importance: 'medium',
    description: '  My sound resets when I rejoin a table.  '
  });

  await ticket.validate();
  assert.equal(ticket.title, 'Sound settings reset');
  assert.equal(ticket.description, 'My sound resets when I rejoin a table.');
  assert.equal(ticket.status, 'open');
  assert.deepEqual(ticket.replies, []);
  assert.equal(FeedbackTicket.schema.options.timestamps, true);
});

test('feedback ticket rejects unsupported importance and invalid replies', async () => {
  const ticket = new FeedbackTicket({
    submittedBy: playerId,
    title: 'Game issue',
    importance: 'urgent',
    description: 'The game is stuck.',
    replies: [{
      sender: playerId,
      senderRole: 'support',
      message: 'We are looking into it.'
    }]
  });

  await assert.rejects(ticket.validate(), error => {
    assert.ok(error.errors.importance);
    assert.ok(error.errors['replies.0.senderRole']);
    return true;
  });
});
