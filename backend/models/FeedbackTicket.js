const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  senderRole: {
    type: String,
    enum: ['player', 'admin'],
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const feedbackTicketSchema = new mongoose.Schema({
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  importance: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  status: {
    type: String,
    enum: ['open', 'resolved'],
    default: 'open',
    required: true
  },
  replies: {
    type: [replySchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FeedbackTicket', feedbackTicketSchema);
