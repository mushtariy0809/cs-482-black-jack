
const express = require('express');
const {
  saveGameHistory,
  getGameHistory
} = require('../controllers/gameHistoryController');

const router = express.Router();

// Get the player's game history
router.get('/:playerId', getGameHistory);

// Save a completed game
router.post('/', saveGameHistory);

module.exports = router;
