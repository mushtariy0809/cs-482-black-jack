const mongoose = require('mongoose');

// One video ad a player started watching (U21). Saved so the admin
// ad-revenue page (A4) can count views, finished views and chips paid out.
const adViewSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  // "player:<id>" for logged-in players, "client:<id>" for guests
  viewerKey: {
    type: String,
    required: true,
    index: true
  },
  playerId: {
    type: String,
    default: null
  },
  clientId: {
    type: String,
    required: true
  },
  adId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['started', 'completed', 'abandoned'],
    default: 'started'
  },
  // Chips paid for this view (0 unless completed)
  reward: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date,
    required: true
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdView', adViewSchema);
