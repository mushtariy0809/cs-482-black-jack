
const express = require('express');
const router = express.Router();

const {
  sendMessage,
  getMessages
} = require('../controllers/messagesController');

// Send a message to a friend
router.post('/send', sendMessage);

// Get messages between two friends
router.get('/:playerId/:friendId', getMessages);

module.exports = router;