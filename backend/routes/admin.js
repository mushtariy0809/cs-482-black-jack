const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const {
  getOverview,
  listPlayers,
  updatePlayerRole,
  closeTable
} = require('../controllers/adminController');
const {
  getAdSummary,
  listAds,
  createAd,
  updateAd,
  uploadAdMedia
} = require('../controllers/adminAdsController');
const {
  listFeedback,
  updateFeedback
} = require('../controllers/feedbackController');

const router = express.Router();

router.use(requireAdmin);
router.get('/overview', getOverview);
router.get('/players', listPlayers);
router.patch('/players/:playerId/role', updatePlayerRole);
router.delete('/tables/:tableId', closeTable);
router.get('/feedback', listFeedback);
router.patch('/feedback/:ticketId', updateFeedback);

// A4 Ad revenue: totals, and the ads players see
router.get('/ads/summary', getAdSummary);
router.get('/ads', listAds);
router.post('/ads', createAd);
router.patch('/ads/:adId', updateAd);
router.post(
  '/ads/media',
  express.raw({ type: ['video/mp4', 'image/png', 'image/jpeg', 'image/webp'], limit: '50mb' }),
  uploadAdMedia
);

module.exports = router;
