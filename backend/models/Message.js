
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    default: null
  },
  table: {
    type: String,
    ref: 'Table',
    default: null
  },
  chatType: {
    type: String,
    enum: ['private', 'table'],
    default: 'private',
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

// Find private messages between two players
messageSchema.statics.getConversation = function(playerId, friendId) {
  return this.find({
    chatType: 'private',
    $or: [
      { sender: playerId, receiver: friendId },
      { sender: friendId, receiver: playerId }
    ]
  }).sort({ createdAt: 1 });
};

// Find all messages sent to a table
messageSchema.statics.getTableMessages = function(tableId) {
  return this.find({
    chatType: 'table',
    table: tableId
  })
    .populate('sender', 'username')
    .sort({ createdAt: 1 });
};

// Create a private message
messageSchema.statics.createPrivateMessage = function(senderId, receiverId, message) {
  return this.create({
    sender: senderId,
    receiver: receiverId,
    chatType: 'private',
    message: message
  });
};

// Create a table message
messageSchema.statics.createTableMessage = function(senderId, tableId, message) {
  return this.create({
    sender: senderId,
    table: tableId,
    chatType: 'table',
    message: message
  });
};

module.exports = mongoose.model('Message', messageSchema);