
const express = require('express');
const router = express.Router();

const {
  sendMessage,
  getMessages,
  getNotificationCount
} = require('../controllers/messagesController');
const requireAuth = require('../middleware/requireAuth');

// Send a message to a friend
router.post('/send', sendMessage);

router.get('/notifications', requireAuth, getNotificationCount);

// Get messages between two friends
router.get('/:playerId/:friendId', requireAuth, getMessages);

module.exports = router;