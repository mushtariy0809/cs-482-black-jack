const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const {
  submitFeedback,
  listMyFeedback
} = require('../controllers/feedbackController');

const router = express.Router();

router.use(requireAuth);
router.post('/', submitFeedback);
router.get('/mine', listMyFeedback);

module.exports = router;
