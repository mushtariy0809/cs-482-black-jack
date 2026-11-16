
const GameHistory = require('../models/GameHistory');
const { RANKS, SUITS } = require('../../shared/rules.js');

// A blackjack hand never needs more than 11 cards; anything odd is dropped
const MAX_CARDS = 12;

function cleanCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .filter(card => card && RANKS.includes(card.rank) && SUITS.includes(card.suit))
    .slice(0, MAX_CARDS)
    .map(card => ({ rank: card.rank, suit: card.suit }));
}

// Save a completed game
const saveGameHistory = async (req, res) => {
  try {
    const { playerId, result, playerScore, dealerScore, tableName, playerCards, dealerCards } = req.body;

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
      dealerScore,
      // Optional: the table and the cards, for the History screen
      tableName: typeof tableName === 'string' ? tableName.trim().slice(0, 40) : '',
      playerCards: cleanCards(playerCards),
      dealerCards: cleanCards(dealerCards)
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
