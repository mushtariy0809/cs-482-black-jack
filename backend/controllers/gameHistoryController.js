
const GameHistory = require('../models/GameHistory');

// Save a completed game
const saveGameHistory = async (req, res) => {
  try {
    const { playerId, result, playerScore, dealerScore } = req.body;

    if (!playerId || !result || playerScore == null || dealerScore == null) {
      return res.status(400).json({
        message: 'All game history fields are required.'
      });
    }

    if (!['win', 'loss', 'push'].includes(result)) {
      return res.status(400).json({
        message: 'Invalid game result.'
      });
    }

    const gameHistory = await GameHistory.create({
      player: playerId,
      result,
      playerScore,
      dealerScore
    });

    res.status(201).json({
      message: 'Game history saved successfully.',
      gameHistory
    });
  } catch (error) {
    console.error('Save game history error:', error);
    res.status(500).json({
      message: 'Failed to save game history.'
    });
  }
};

// Get a player's game history
const getGameHistory = async (req, res) => {
  try {
    const { playerId } = req.params;

    const history = await GameHistory.find({ player: playerId })
      .sort({ createdAt: -1 });

    res.status(200).json(history);
  } catch (error) {
    console.error('Get game history error:', error);
    res.status(500).json({
      message: 'Failed to retrieve game history.'
    });
  }
};

module.exports = {
  saveGameHistory,
  getGameHistory
};
