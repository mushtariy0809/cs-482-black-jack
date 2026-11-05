
const Player = require('../models/Player');

// Search for players by username
const searchPlayers = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username || !username.trim()) {
      return res.status(400).json({
        message: 'Please enter a username.'
      });
    }

    const players = await Player.find({
      username: {
        $regex: username.trim(),
        $options: 'i'
      }
    }).select('username profilePicture');

    return res.json(players);

  } catch (error) {
    console.error('Player search error:', error.message);

    return res.status(500).json({
      message: 'Unable to search for players.'
    });
  }
};

// Send a friend request
const sendFriendRequest = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    if (!senderId || !receiverId) {
      return res.status(400).json({
        message: 'Both player IDs are required.'
      });
    }

    if (senderId === receiverId) {
      return res.status(400).json({
        message: 'You cannot send a friend request to yourself.'
      });
    }

    const sender = await Player.findById(senderId);
    const receiver = await Player.findById(receiverId);

    if (!sender || !receiver) {
      return res.status(404).json({
        message: 'Player not found.'
      });
    }

    if (sender.friends.includes(receiver._id)) {
      return res.status(400).json({
        message: 'You are already friends.'
      });
    }

    if (
      sender.sentFriendRequests.includes(receiver._id) ||
      receiver.receivedFriendRequests.includes(sender._id)
    ) {
      return res.status(400).json({
        message: 'Friend request already sent.'
      });
    }

    sender.sentFriendRequests.push(receiver._id);
    receiver.receivedFriendRequests.push(sender._id);

    await sender.save();
    await receiver.save();

    return res.json({
      message: 'Friend request sent successfully!'
    });

  } catch (error) {
    console.error('Friend request error:', error.message);

    return res.status(500).json({
      message: 'Unable to send friend request.'
    });
  }
};

// Accept a friend request
const acceptFriendRequest = async (req, res) => {
  try {
    const { playerId, requesterId } = req.body;

    if (!playerId || !requesterId) {
      return res.status(400).json({
        message: 'Both player IDs are required.'
      });
    }

    const player = await Player.findById(playerId);
    const requester = await Player.findById(requesterId);

    if (!player || !requester) {
      return res.status(404).json({
        message: 'Player not found.'
      });
    }

    const hasRequest = player.receivedFriendRequests.some(
      id => id.equals(requester._id)
    );

    if (!hasRequest) {
      return res.status(400).json({
        message: 'Friend request not found.'
      });
    }

    player.receivedFriendRequests.pull(requester._id);
    requester.sentFriendRequests.pull(player._id);

    player.friends.addToSet(requester._id);
    requester.friends.addToSet(player._id);

    await player.save();
    await requester.save();

    return res.json({
      message: 'Friend request accepted!'
    });

  } catch (error) {
    console.error('Accept request error:', error.message);

    return res.status(500).json({
      message: 'Unable to accept friend request.'
    });
  }
};

// Decline a friend request
const declineFriendRequest = async (req, res) => {
  try {
    const { playerId, requesterId } = req.body;

    if (!playerId || !requesterId) {
      return res.status(400).json({
        message: 'Both player IDs are required.'
      });
    }

    const player = await Player.findById(playerId);
    const requester = await Player.findById(requesterId);

    if (!player || !requester) {
      return res.status(404).json({
        message: 'Player not found.'
      });
    }

    const hasRequest = player.receivedFriendRequests.some(
      id => id.equals(requester._id)
    );

    if (!hasRequest) {
      return res.status(400).json({
        message: 'Friend request not found.'
      });
    }

    player.receivedFriendRequests.pull(requester._id);
    requester.sentFriendRequests.pull(player._id);

    await player.save();
    await requester.save();

    return res.json({
      message: 'Friend request declined.'
    });

  } catch (error) {
    console.error('Decline request error:', error.message);

    return res.status(500).json({
      message: 'Unable to decline friend request.'
    });
  }
};

// Get friends and incoming friend requests
const getFriends = async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId)
      .populate('friends', 'username profilePicture')
      .populate('receivedFriendRequests', 'username profilePicture');

    if (!player) {
      return res.status(404).json({
        message: 'Player not found.'
      });
    }

    return res.json({
      friends: player.friends,
      friendRequests: player.receivedFriendRequests
    });

  } catch (error) {
    console.error('Get friends error:', error.message);

    return res.status(500).json({
      message: 'Unable to retrieve friends.'
    });
  }
};

// Remove a friend
const removeFriend = async (req, res) => {
  try {
    const { playerId, friendId } = req.body;

    if (!playerId || !friendId) {
      return res.status(400).json({
        message: 'Both player IDs are required.'
      });
    }

    const player = await Player.findById(playerId);
    const friend = await Player.findById(friendId);

    if (!player || !friend) {
      return res.status(404).json({
        message: 'Player not found.'
      });
    }

    player.friends.pull(friend._id);
    friend.friends.pull(player._id);

    await player.save();
    await friend.save();

    return res.json({
      message: 'Friend removed successfully!'
    });

  } catch (error) {
    console.error('Remove friend error:', error.message);

    return res.status(500).json({
      message: 'Unable to remove friend.'
    });
  }
};

module.exports = {
  searchPlayers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  getFriends,
  removeFriend
};
