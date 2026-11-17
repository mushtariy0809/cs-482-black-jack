const mongoose = require('mongoose');

// One time a banner ad was shown, or any ad's link was clicked (A4 Ad revenue).
// Video views are in AdView.
const adEventSchema = new mongoose.Schema({
  adId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['impression', 'click'],
    required: true
  },
  // Where it happened: the lobby banners, the table's ad column, or the video player
  placement: {
    type: String,
    enum: ['lobby', 'table', 'video'],
    required: true
  },
  // "player:<id>" for logged-in players, "client:<id>" for guests
  viewerKey: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('AdEvent', adEventSchema);
