import React, { useEffect, useState } from 'react';

// Private chat with one friend (polls for new messages every 3 seconds)
export default function ChatScreen({ player, friend, onBack }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadMessages() {
    try {
      const response = await fetch(
        `http://localhost:5000/api/messages/${player.id}/${friend._id}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load messages.');
      }

      setMessages(data);
      setError('');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();

    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [player.id, friend._id]);

  async function sendMessage() {
    if (!newMessage.trim()) return;

    try {
      const response = await fetch(
        'http://localhost:5000/api/messages/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            senderId: player.id,
            receiverId: friend._id,
            message: newMessage.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to send message.');
      }

      setNewMessage('');
      await loadMessages();
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <div className="instagram-chat">

      <div className="chat-header">
        <button className="chat-back" onClick={onBack}>
          ←
        </button>

        <div className="chat-header-avatar">
          {friend.username.charAt(0).toUpperCase()}
        </div>

        <div className="chat-header-info">
          <h2>{friend.username}</h2>
          <span>21 CLUB · FRIENDS</span>
        </div>

        <div className="chat-header-status">
          <span></span>
        </div>
      </div>

      <div className="instagram-chat-messages">

        <div className="chat-welcome">
          <div className="chat-large-avatar">
            {friend.username.charAt(0).toUpperCase()}
          </div>

          <h3>{friend.username}</h3>
          <p>You're connected on 21 CLUB.</p>
          <span>Start your conversation below.</span>
        </div>

        {loading ? (
          <p className="chat-status">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="chat-status">No messages yet. Say hello!</p>
        ) : (
          messages.map(message => {
            const isMine =
              String(message.sender?._id) === String(player.id);

            return (
              <div
                key={message._id}
                className={`chat-message-row ${isMine ? 'mine' : 'theirs'}`}
              >
                <div className="chat-message-content">

                  <span className="chat-sender-name">
                    {isMine ? 'YOU' : friend.username.toUpperCase()}
                  </span>

                  <div className="chat-bubble">
                    {message.message}
                  </div>

                </div>
              </div>
            );
          })
        )}

        {error && <p className="chat-error">{error}</p>}
      </div>

      <div className="instagram-chat-input">

        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') sendMessage();
          }}
          placeholder={`Message ${friend.username}...`}
        />

        <button
          className="chat-send-button"
          onClick={sendMessage}
          disabled={!newMessage.trim()}
        >
          Send
        </button>

      </div>

    </div>
  );
}
