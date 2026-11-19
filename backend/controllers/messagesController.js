
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Player = require('../models/Player');

// Send a message to a friend
const sendMessage = async (req, res) => {
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

    const newMessage = await Message.createPrivateMessage(
      senderId,
      receiverId,
      message.trim()
    );

    return res.status(201).json(newMessage);

  } catch (error) {
    console.error('Send message error:', error.message);

    return res.status(500).json({
      message: 'Unable to send message.'
    });
  }
};

// Get messages between two friends
const getMessages = async (req, res) => {
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

    if (String(req.player._id) !== playerId) {
      return res.status(403).json({
        message: 'You can only view your own conversations.'
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
      chatType: 'private',
      $or: [
        { sender: playerId, receiver: friendId },
        { sender: friendId, receiver: playerId }
      ]
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'username profilePicture')
      .populate('receiver', 'username profilePicture');

    await Message.updateMany(
      {
        chatType: 'private',
        sender: friendId,
        receiver: playerId,
        readAt: null
      },
      { $set: { readAt: new Date() } }
    );

    return res.json(messages);

  } catch (error) {
    console.error('Get messages error:', error.message);

    return res.status(500).json({
      message: 'Unable to retrieve messages.'
    });
  }
};

const getNotificationCount = async (req, res) => {
  try {
    const unreadMessages = await Message.aggregate([
      {
        $match: {
          chatType: 'private',
          receiver: req.player._id,
          sender: { $in: req.player.friends ?? [] },
          readAt: null
        }
      },
      { $group: { _id: '$sender', count: { $sum: 1 } } }
    ]);

    const messageCounts = Object.fromEntries(
      unreadMessages.map(({ _id, count }) => [String(_id), count])
    );
    const friendRequestCount = req.player.receivedFriendRequests?.length ?? 0;
    const unreadMessageCount = unreadMessages.reduce((sum, item) => sum + item.count, 0);

    return res.json({
      count: friendRequestCount + unreadMessageCount,
      friendRequestCount,
      messageCounts
    });
  } catch (error) {
    console.error('Notification count error:', error.message);

    return res.status(500).json({
      message: 'Unable to retrieve notifications.'
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getNotificationCount
};
