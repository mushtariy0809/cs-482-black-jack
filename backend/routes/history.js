
const express = require('express');
const GameHistory = require('../models/GameHistory');

const router = express.Router();

// Get the player's game history
router.get('/:playerId', async (req, res) => {
  try {
    const history = await GameHistory.find({
      player: req.params.playerId
    }).sort({ createdAt: -1 });

    res.json(history);
  } catch (error) {
    console.error('History retrieval error:', error.message);
    res.status(500).json({
      message: 'Unable to retrieve game history.'
    });
  }
});

// This should save a completed game
router.post('/', async (req, res) => {
  try {
    const { playerId, result, playerScore, dealerScore } = req.body;

    if (!playerId || !['win', 'loss', 'push'].includes(result)) {
      return res.status(400).json({
        message: 'Player ID and a valid game result are required.'
      });
    }

    const savedGame = await GameHistory.create({
      player: playerId,
      result,
      playerScore,
      dealerScore
    });

    res.status(201).json({
      message: 'Game history saved successfully.',
      game: savedGame
    });
  } catch (error) {
    console.error('Saving history error:', error.message);
    res.status(500).json({
      message: 'Unable to save game history.'
    });
  }
});

module.exports = router;
