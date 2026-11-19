
const express = require('express');

const {
  registerPlayer,
  loginPlayer,
  updatePlayerProfile
} = require('../controllers/authController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.post('/register', registerPlayer);
router.post('/login', loginPlayer);
router.patch('/profile', requireAuth, updatePlayerProfile);

module.exports = router;
