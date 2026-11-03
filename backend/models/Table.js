
const mongoose = require('mongoose');

// A seat at a table. reservedUntil is set while a player who left
// can still come back to the same seat.
const seatSchema = new mongoose.Schema({
  index: {
    type: Number,
    required: true
  },
  clientId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    default: 'Guest'
  },
  inHand: {
    type: Boolean,
    default: false
  },
  reservedUntil: {
    type: Date,
    default: null
  }
}, {
  _id: false
});

const tableSchema = new mongoose.Schema({
  // Short readable id, also used in socket events
  _id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  passwordHash: {
    type: String,
    default: null
  },
  inviteCode: {
    type: String,
    required: true,
    unique: true
  },
  mode: {
    type: String,
    enum: ['people', 'bots'],
    default: 'people'
  },
  // Practice is solo: every player gets their own hand vs. the dealer,
  // so the table never fills up
  solo: {
    type: Boolean,
    default: false
  },
  maxSeats: {
    type: Number,
    default: 5
  },
  seats: [seatSchema],
  minBet: {
    type: Number,
    default: 10
  },
  maxBet: {
    type: Number,
    default: 500
  },
  status: {
    type: String,
    enum: ['waiting', 'in_game', 'full'],
    default: 'waiting'
  },
  createdBy: {
    type: String,
    default: null
  },
  isSystem: {
    type: Boolean,
    default: false
  },
  emptySince: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Table', tableSchema);
