const mongoose = require('mongoose');

// An ad players can see (A4): a video ad watched for chips, or a lobby/table banner.
// "Removing" an ad archives it, so its stats stay in the Ad revenue totals.
const adSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  kind: {
    type: String,
    enum: ['video', 'banner'],
    required: true
  },
  sponsor: {
    type: String,
    required: true,
    trim: true,
    maxlength: 40
  },
  headline: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  tagline: {
    type: String,
    default: '',
    maxlength: 120
  },
  // Shorter title for the narrow ad column next to the table (banners)
  shortTitle: {
    type: String,
    default: '',
    maxlength: 30
  },
  // The video (MP4) or banner image: /assets/ads/..., /uploads/ads/... or a full URL
  mediaUrl: {
    type: String,
    required: true
  },
  posterUrl: {
    type: String,
    default: ''
  },
  // Where "Learn more" / "Visit sponsor" goes
  link: {
    type: String,
    default: ''
  },
  // Video length; the chips are paid only after this much time
  durationMs: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  },
  builtIn: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: false, updatedAt: true }
});

module.exports = mongoose.model('Ad', adSchema);
