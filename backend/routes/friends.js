
const express = require('express');
const router = express.Router();

const {
  searchPlayers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  getFriends,
  removeFriend
} = require('../controllers/friendsController');

// Search for players
router.get('/search', searchPlayers);

// Send a friend request
router.post('/request', sendFriendRequest);

// Accept a friend request
router.post('/accept', acceptFriendRequest);

// Decline a friend request
router.post('/decline', declineFriendRequest);

// Get friends and incoming requests
router.get('/:playerId', getFriends);

// Remove a friend
router.delete('/remove', removeFriend);

module.exports = router;
