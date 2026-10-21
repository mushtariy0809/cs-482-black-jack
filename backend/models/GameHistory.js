

const mongoose = require('mongoose');

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
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('GameHistory', gameHistorySchema);
