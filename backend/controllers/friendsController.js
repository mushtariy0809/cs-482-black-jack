
const Player = require('../models/Player');

// A failure we already have a message for (400 / 404). Anything else becomes a 500.
class FriendsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Runs a handler and turns thrown errors into JSON responses.
// `logLabel` and `failMessage` are used for unexpected (500) errors.
function friendsRoute(logLabel, failMessage, handler) {
  return async (req, res) => {
    try {
      return res.json(await handler(req));
    } catch (error) {
      if (error instanceof FriendsError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error(`${logLabel}:`, error.message);
      return res.status(500).json({ message: failMessage });
    }
  };
}

// Loads both players, or fails with the same messages every route uses
async function findBothPlayers(firstId, secondId) {
  if (!firstId || !secondId) {
    throw new FriendsError(400, 'Both player IDs are required.');
  }

  const first = await Player.findById(firstId);
  const second = await Player.findById(secondId);

  if (!first || !second) {
    throw new FriendsError(404, 'Player not found.');
  }

  return [first, second];
}

// Shared by accept and decline: checks the request exists and removes it from both players
async function takePendingRequest(playerId, requesterId) {
  const [player, requester] = await findBothPlayers(playerId, requesterId);

  const hasRequest = player.receivedFriendRequests.some(
    id => id.equals(requester._id)
  );

  if (!hasRequest) {
    throw new FriendsError(400, 'Friend request not found.');
  }

  player.receivedFriendRequests.pull(requester._id);
  requester.sentFriendRequests.pull(player._id);

  return [player, requester];
}

async function saveBoth(first, second) {
  await first.save();
  await second.save();
}

// Treat the search text as plain text, not a regular expression
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Search for players by username
const searchPlayers = friendsRoute('Player search error', 'Unable to search for players.', async req => {
  const { username } = req.query;

  if (!username || !username.trim()) {
    throw new FriendsError(400, 'Please enter a username.');
  }

  return Player.find({
    username: {
      $regex: escapeRegex(username.trim()),
      $options: 'i'
    }
  }).select('username profilePicture');
});

// Send a friend request
const sendFriendRequest = friendsRoute('Friend request error', 'Unable to send friend request.', async req => {
  const { senderId, receiverId } = req.body;

  if (senderId && senderId === receiverId) {
    throw new FriendsError(400, 'You cannot send a friend request to yourself.');
  }

  const [sender, receiver] = await findBothPlayers(senderId, receiverId);

  if (sender.friends.includes(receiver._id)) {
    throw new FriendsError(400, 'You are already friends.');
  }

  if (
    sender.sentFriendRequests.includes(receiver._id) ||
    receiver.receivedFriendRequests.includes(sender._id)
  ) {
    throw new FriendsError(400, 'Friend request already sent.');
  }

  sender.sentFriendRequests.push(receiver._id);
  receiver.receivedFriendRequests.push(sender._id);
  await saveBoth(sender, receiver);

  return { message: 'Friend request sent successfully!' };
});

// Accept a friend request
const acceptFriendRequest = friendsRoute('Accept request error', 'Unable to accept friend request.', async req => {
  const [player, requester] = await takePendingRequest(req.body.playerId, req.body.requesterId);

  player.friends.addToSet(requester._id);
  requester.friends.addToSet(player._id);
  await saveBoth(player, requester);

  return { message: 'Friend request accepted!' };
});

// Decline a friend request
const declineFriendRequest = friendsRoute('Decline request error', 'Unable to decline friend request.', async req => {
  const [player, requester] = await takePendingRequest(req.body.playerId, req.body.requesterId);

  await saveBoth(player, requester);

  return { message: 'Friend request declined.' };
});

// Get friends and incoming friend requests
const getFriends = friendsRoute('Get friends error', 'Unable to retrieve friends.', async req => {
  const player = await Player.findById(req.params.playerId)
    .populate('friends', 'username profilePicture')
    .populate('receivedFriendRequests', 'username profilePicture');

  if (!player) {
    throw new FriendsError(404, 'Player not found.');
  }

  return {
    friends: player.friends,
    friendRequests: player.receivedFriendRequests
  };
});

// Remove a friend
const removeFriend = friendsRoute('Remove friend error', 'Unable to remove friend.', async req => {
  const [player, friend] = await findBothPlayers(req.body.playerId, req.body.friendId);

  player.friends.pull(friend._id);
  friend.friends.pull(player._id);
  await saveBoth(player, friend);

  return { message: 'Friend removed successfully!' };
});

module.exports = {
  searchPlayers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  getFriends,
  removeFriend
};
