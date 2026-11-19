const mongoose = require('mongoose');
const FeedbackTicket = require('../models/FeedbackTicket');

const IMPORTANCE_LEVELS = ['low', 'medium', 'high'];
const TICKET_STATUSES = ['open', 'resolved'];

function populateTicket(query) {
  return query
    .populate('submittedBy', 'username')
    .populate('replies.sender', 'username');
}

async function submitFeedback(req, res) {
  const { title, importance, description } = req.body || {};
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDescription = typeof description === 'string' ? description.trim() : '';

  if (!cleanTitle || !cleanDescription || !IMPORTANCE_LEVELS.includes(importance)) {
    return res.status(400).json({
      message: 'Enter a title, choose an importance, and describe your feedback.'
    });
  }
  if (cleanTitle.length > 120 || cleanDescription.length > 5000) {
    return res.status(400).json({
      message: 'The title must be 120 characters or fewer and the description 5,000 or fewer.'
    });
  }

  try {
    const ticket = await FeedbackTicket.create({
      submittedBy: req.player._id,
      title: cleanTitle,
      importance,
      description: cleanDescription
    });
    return res.status(201).json(ticket);
  } catch (error) {
    console.error('Feedback submission error:', error.message);
    return res.status(500).json({ message: 'Unable to submit feedback.' });
  }
}

async function listMyFeedback(req, res) {
  try {
    const tickets = await populateTicket(
      FeedbackTicket.find({ submittedBy: req.player._id }).sort({ createdAt: -1 })
    );
    return res.json(tickets);
  } catch (error) {
    console.error('Player feedback list error:', error.message);
    return res.status(500).json({ message: 'Unable to load your feedback.' });
  }
}

async function listFeedback(req, res) {
  try {
    const tickets = await populateTicket(
      FeedbackTicket.find().sort({ createdAt: -1 })
    );
    return res.json(tickets);
  } catch (error) {
    console.error('Admin feedback list error:', error.message);
    return res.status(500).json({ message: 'Unable to load player feedback.' });
  }
}

async function updateFeedback(req, res) {
  const { ticketId } = req.params;
  const { reply, status } = req.body || {};
  const cleanReply = typeof reply === 'string' ? reply.trim() : '';
  const hasReply = reply !== undefined;
  const hasStatus = status !== undefined;

  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ message: 'Invalid feedback ticket.' });
  }
  if (
    (!hasReply && !hasStatus) ||
    (hasReply && (!cleanReply || cleanReply.length > 2000)) ||
    (hasStatus && !TICKET_STATUSES.includes(status))
  ) {
    return res.status(400).json({
      message: 'Add a valid reply or choose Open or Resolved.'
    });
  }

  const update = {};
  if (hasStatus) update.$set = { status };
  if (hasReply) {
    update.$push = {
      replies: {
        sender: req.admin._id,
        senderRole: 'admin',
        message: cleanReply
      }
    };
  }

  try {
    const ticket = await populateTicket(
      FeedbackTicket.findByIdAndUpdate(ticketId, update, {
        new: true,
        runValidators: true
      })
    );
    if (!ticket) return res.status(404).json({ message: 'Feedback ticket not found.' });
    return res.json(ticket);
  } catch (error) {
    console.error('Admin feedback update error:', error.message);
    return res.status(500).json({ message: 'Unable to update feedback.' });
  }
}

module.exports = {
  submitFeedback,
  listMyFeedback,
  listFeedback,
  updateFeedback
};
