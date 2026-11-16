

const mongoose = require('mongoose');
const { RANKS, SUITS } = require('../../shared/rules.js');

// A card as it was dealt (saved so the History screen can draw the hand)
const cardSchema = new mongoose.Schema({
  rank: { type: String, enum: RANKS, required: true },
  suit: { type: String, enum: SUITS, required: true }
}, { _id: false });

const gameHistorySchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true
    },
    result: {
      type: String,
      enum: ['win', 'loss', 'push'],
      required: true
    },
    playerScore: {
      type: Number,
      required: true
    },
    dealerScore: {
      type: Number,
      required: true
    },
    // Added for the History screen. Hands saved before this have none of these.
    tableName: {
      type: String,
      trim: true,
      maxlength: 40,
      default: ''
    },
    playerCards: {
      type: [cardSchema],
      default: []
    },
    dealerCards: {
      type: [cardSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('GameHistory', gameHistorySchema);
