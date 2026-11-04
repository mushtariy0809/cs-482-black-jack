
const express = require('express');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Player = require('../models/Player');

const router = express.Router();

// Send a message to a friend
router.post('/send', async (req, res) => {
  try {
    const { senderId, receiverId, message } = req.body;

    if (!senderId || !receiverId || !message || !message.trim()) {
      return res.status(400).json({
        message: 'All fields are required.'
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(senderId) ||
      !mongoose.Types.ObjectId.isValid(receiverId)
    ) {
      return res.status(400).json({
        message: 'Invalid player ID.'
      });
    }

    const sender = await Player.findById(senderId);
    const receiver = await Player.findById(receiverId);

    if (!sender || !receiver) {
      return res.status(404).json({
        message: 'Player not found.'
      });
    }

    if (!sender.friends.includes(receiver._id)) {
      return res.status(403).json({
        message: 'You can only message your friends.'
      });
    }

    const newMessage = await Message.create({
      sender: senderId,
      receiver: receiverId,
      message: message.trim()
    });

    res.status(201).json(newMessage);

  } catch (error) {
    console.error('Send message error:', error.message);

    res.status(500).json({
      message: 'Unable to send message.'
    });
  }
});

// Get messages between two friends
router.get('/:playerId/:friendId', async (req, res) => {
  try {
    const { playerId, friendId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(playerId) ||
      !mongoose.Types.ObjectId.isValid(friendId)
    ) {
      return res.status(400).json({
        message: 'Invalid player ID.'
      });
    }

    const player = await Player.findById(playerId);

    const isFriend = player?.friends.some(
        id => id.equals(friendId)
    );

    if (!isFriend) {
        return res.status(403).json({
            message: 'You can only view conversations with your friends.'
        });
    }

    const messages = await Message.find({
      $or: [
        { sender: playerId, receiver: friendId },
        { sender: friendId, receiver: playerId }
      ]
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'username profilePicture')
      .populate('receiver', 'username profilePicture');

    res.json(messages);

  } catch (error) {
    console.error('Get messages error:', error.message);

    res.status(500).json({
      message: 'Unable to retrieve messages.'
    });
  }
});

module.exports = router;