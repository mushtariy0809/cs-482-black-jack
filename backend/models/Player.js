
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

// Find a player by username
playerSchema.statics.findByUsername = function(username) {
  return this.findOne({ username: username });
};

// Find a player by email
playerSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Update a player's profile
playerSchema.statics.updateProfile = function(playerId, updates) {
  const allowedUpdates = {};

  if (updates.username !== undefined) {
    allowedUpdates.username = updates.username;
  }

  if (updates.profilePicture !== undefined) {
    allowedUpdates.profilePicture = updates.profilePicture;
  }

  return this.findByIdAndUpdate(
    playerId,
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  );
};

module.exports = mongoose.model('Player', playerSchema);
