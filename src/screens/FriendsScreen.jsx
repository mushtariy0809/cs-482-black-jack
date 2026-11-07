import React, { useEffect, useState } from 'react';
import ChatScreen from './ChatScreen.jsx';
import { fetchFriends, friendAction, searchPlayers } from '../friends/friendsApi.js';

function Avatar({ name }) {
  return <div className="friend-avatar">{name.charAt(0).toUpperCase()}</div>;
}

// One row: avatar, name, then whatever buttons the list needs
function FriendRow({ person, className = 'friend-card', subtitle, children }) {
  return (
    <div className={className}>
      <Avatar name={person.username} />
      <div className="friend-details">
        <h3>{person.username}</h3>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function FriendRequests({ requests, onAccept, onDecline }) {
  return (
    <div className="friend-requests-section">
      <h3>Friend Requests</h3>
      {requests.length === 0 ? (
        <p>No pending friend requests.</p>
      ) : (
        requests.map(request => (
          <FriendRow key={request._id} person={request} className="friend-card friend-request-card">
            <div className="friend-actions">
              <button className="friend-chat-button" onClick={() => onAccept(request._id)}>Accept</button>
              <button className="friend-remove-button" onClick={() => onDecline(request._id)}>Decline</button>
            </div>
          </FriendRow>
        ))
      )}
    </div>
  );
}

function FriendsList({ friends, onChat, onRemove }) {
  return (
    <div className="friends-list">
      {friends.length === 0 ? (
        <p>You haven't added any friends yet.</p>
      ) : (
        friends.map(friend => (
          <FriendRow key={friend._id} person={friend}>
            <div className="friend-actions">
              <button className="friend-chat-button" onClick={() => onChat(friend)}>Chat</button>
              <button className="friend-remove-button" onClick={() => onRemove(friend._id)}>Remove</button>
            </div>
          </FriendRow>
        ))
      )}
    </div>
  );
}

// Searches as the player types; hides the player themself from the results
function usePlayerSearch(searchTerm, playerId) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const username = searchTerm.trim();
    if (!username) {
      setResults([]);
      return;
    }

    setLoading(true);
    searchPlayers(username)
      .then(setResults)
      .catch(error => {
        console.error('Search error:', error);
        setResults([]);
      })
      .finally(() => setLoading(false));
  }, [searchTerm]);

  return { results: results.filter(result => result._id !== playerId), loading };
}

function PlayerSearch({ player, onAdd }) {
  const [searchTerm, setSearchTerm] = useState('');
  const { results, loading } = usePlayerSearch(searchTerm, player.id);

  let content = null;
  if (!searchTerm.trim()) {
    // Nothing typed yet: show no results
  } else if (loading) content = <p>Searching players...</p>;
  else if (results.length === 0) content = <p>No players found.</p>;
  else {
    content = results.map(result => (
      <FriendRow key={result._id} person={result} className="search-result" subtitle="Registered player">
        <button className="add-friend-button" onClick={() => onAdd(result._id)}>+ Add Friend</button>
      </FriendRow>
    ));
  }

  return (
    <section className="panel friends-panel">
      <span className="eyebrow">DISCOVER PLAYERS</span>
      <h2>Find a Friend</h2>
      <p>Search for other registered players.</p>

      <input
        type="text"
        placeholder="Search username..."
        className="friends-search"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />

      <div className="search-results">
        <h3>Registered Players</h3>
        {content}
      </div>
    </section>
  );
}

export default function FriendsScreen({ player, onBack }) {
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function showFriends(data) {
    setFriends(data.friends);
    setFriendRequests(data.friendRequests);
  }

  useEffect(() => {
    fetchFriends(player.id)
      .then(showFriends)
      .catch(() => setError('Unable to load your friends.'))
      .finally(() => setLoading(false));
  }, [player.id]);

  // Runs a friend action, tells the player how it went, and optionally reloads the lists
  async function runAction({ action, body, success, failure, logLabel, method, refresh = true }) {
    try {
      const result = await friendAction(action, body, failure, method);
      if (!result.ok) {
        alert(result.message);
        return;
      }
      alert(success);
      if (refresh) showFriends(await fetchFriends(player.id));
    } catch (err) {
      console.error(`${logLabel}:`, err);
      alert('Something went wrong. Please try again.');
    }
  }

  const sendFriendRequest = receiverId => runAction({
    action: 'request',
    body: { senderId: player.id, receiverId },
    success: 'Friend request sent successfully!',
    failure: 'Unable to send friend request.',
    logLabel: 'Friend request error',
    refresh: false
  });

  const acceptFriendRequest = requesterId => runAction({
    action: 'accept',
    body: { playerId: player.id, requesterId },
    success: 'Friend request accepted!',
    failure: 'Unable to accept friend request.',
    logLabel: 'Accept friend request error'
  });

  const declineFriendRequest = requesterId => runAction({
    action: 'decline',
    body: { playerId: player.id, requesterId },
    success: 'Friend request declined.',
    failure: 'Unable to decline friend request.',
    logLabel: 'Decline friend request error'
  });

  const removeFriend = friendId => runAction({
    action: 'remove',
    method: 'DELETE',
    body: { playerId: player.id, friendId },
    success: 'Friend removed successfully!',
    failure: 'Unable to remove friend.',
    logLabel: 'Remove friend error'
  });

  if (selectedFriend) {
    return <ChatScreen player={player} friend={selectedFriend} onBack={() => setSelectedFriend(null)} />;
  }

  return (
    <div className="friends-page">
      <div className="friends-columns">
        <section className="panel friends-panel">
          <h2>My Friends</h2>
          <p>Your friends and connections.</p>

          {loading && <p>Loading friends...</p>}
          {!loading && error && <p>{error}</p>}
          {!loading && !error && (
            <>
              <FriendRequests requests={friendRequests} onAccept={acceptFriendRequest} onDecline={declineFriendRequest} />
              <FriendsList friends={friends} onChat={setSelectedFriend} onRemove={removeFriend} />
            </>
          )}
        </section>

        <PlayerSearch player={player} onAdd={sendFriendRequest} />
      </div>

      <div className="friends-back-button">
        <button className="primary wide" onClick={onBack}>
          Back to the game
        </button>
      </div>
    </div>
  );
}
