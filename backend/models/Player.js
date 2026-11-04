
const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  profilePicture: {
    type: String,
    default: ''
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  sentFriendRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  receivedFriendRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Player', playerSchema);
