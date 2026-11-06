
import React, { useState } from 'react';
import {
  useTables,
  sendTableChat,
  sendPrivateTableChat
} from './realtime/useTables.js';

export default function TableChat({ player, table, onClose }) {
  const { chatMessages, privateMessages, tableState, mySeat } = useTables();

  const [activeChat, setActiveChat] = useState('table');
  const [minimized, setMinimized] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reactions = [
    'Good luck 🍀',
    'Nice hand! 👏',
    'Bust! 💥',
    'GG 🔥',
    'Thanks!'
  ];

  const seatedPlayers = (
    tableState?.tableId === table?.id
      ? tableState.seats
      : []
  ).filter(seat => seat && seat.index !== mySeat?.seat);

  const messages = chatMessages.filter(
    item => item.tableId === table?.id
  );

  const selectedPlayer = seatedPlayers.find(
    seat => `player-${seat.index}` === activeChat
  );

  const privateConversation = privateMessages.filter(item => {
    const selectedSeat = Number(activeChat.replace('player-', ''));

    return (
      item.tableId === table?.id &&
      (
        (item.senderSeat === mySeat?.seat &&
          item.recipientSeat === selectedSeat) ||
        (item.senderSeat === selectedSeat &&
          item.recipientSeat === mySeat?.seat)
      )
    );
  });

  async function sendMessage(text) {
    let result;

    if (activeChat === 'table') {
      result = await sendTableChat(text);
    } else {
      const recipientSeat = Number(
        activeChat.replace('player-', '')
      );

      result = await sendPrivateTableChat(recipientSeat, text);
    }

    if (!result.ok) {
      setError(result.message || 'Unable to send message.');
      return false;
    }

    setError('');
    return true;
  }

  async function handleSend(e) {
    e.preventDefault();

    const trimmed = message.trim();
    if (!trimmed) return;

    const success = await sendMessage(trimmed);

    if (success) {
      setMessage('');
    }
  }

  async function handleReaction(reaction) {
    await sendMessage(reaction);
  }

  if (!player?.token || !table || table.solo) return null;

  return React.createElement(
    'div',
    { className: 'table-chat' },

    // Header and conversation tabs
    React.createElement(
      'div',
      { className: 'table-chat-header' },

      React.createElement(
        'div',
        { className: 'table-chat-tabs' },

        React.createElement(
          'button',
          {
            className: `table-chat-tab ${
              activeChat === 'table' ? 'active' : ''
            }`,
            onClick: () => setActiveChat('table')
          },
          'Table Chat'
        ),

        ...seatedPlayers.map(seat =>
          React.createElement(
            'button',
            {
              key: seat.index,
              className: `table-chat-tab ${
                activeChat === `player-${seat.index}` ? 'active' : ''
              }`,
              onClick: () => setActiveChat(`player-${seat.index}`)
            },
            seat.name
          )
        )
      ),

      React.createElement(
        'div',
        { className: 'table-chat-controls' },

        React.createElement(
          'button',
          {
            onClick: () => setMinimized(!minimized),
            title: minimized ? 'Expand chat' : 'Minimize chat'
          },
          minimized ? '+' : '−'
        ),

        React.createElement(
          'button',
          {
            onClick: onClose,
            title: 'Close chat'
          },
          '×'
        )
      )
    ),

    // Conversation content
    !minimized
      ? React.createElement(
          'div',
          { className: 'table-chat-conversation' },

          // Message feed
          React.createElement(
            'div',
            { className: 'table-chat-messages' },

            activeChat === 'table'
              ? messages.length === 0
                ? React.createElement(
                    'p',
                    null,
                    'No messages yet. Say hello!'
                  )
                : messages.map((item, index) =>
                    React.createElement(
                      'div',
                      {
                        key: `${item.sentAt}-${index}`,
                        className: 'table-chat-message theirs'
                      },
                      React.createElement(
                        'strong',
                        null,
                        item.senderName
                      ),
                      React.createElement('p', null, item.text)
                    )
                  )
              : privateConversation.length === 0
                ? React.createElement(
                    'p',
                    null,
                    'No messages yet. Say hello!'
                  )
                : privateConversation.map((item, index) =>
                    React.createElement(
                      'div',
                      {
                        key: `${item.sentAt}-${index}`,
                        className:
                          item.senderSeat === mySeat?.seat
                            ? 'table-chat-message mine'
                            : 'table-chat-message theirs'
                      },
                      React.createElement(
                        'strong',
                        null,
                        item.senderName
                      ),
                      React.createElement('p', null, item.text)
                    )
                  )
          ),

          // Quick reactions
          React.createElement(
            'div',
            { className: 'table-chat-reactions' },

            ...reactions.map(reaction =>
              React.createElement(
                'button',
                {
                  key: reaction,
                  type: 'button',
                  className: 'table-chat-reaction',
                  onClick: () => handleReaction(reaction)
                },
                reaction
              )
            )
          ),

          // Message input
          React.createElement(
            'form',
            {
              className: 'table-chat-input-area',
              onSubmit: handleSend
            },

            React.createElement(
              'button',
              {
                type: 'button',
                className: 'table-chat-emoji',
                title: 'Add emoji',
                onClick: () =>
                  setMessage(current => current + ' 😊')
              },
              '😊'
            ),

            React.createElement('input', {
              value: message,
              onChange: e => setMessage(e.target.value),
              placeholder: activeChat === 'table'
                ? 'Message table...'
                : `Message ${selectedPlayer?.name ?? 'Player'}...`,
              maxLength: 300
            }),

            React.createElement(
              'button',
              {
                type: 'submit',
                className: 'table-chat-send',
                disabled: !message.trim(),
                title: 'Send message'
              },
              '➤'
            )
          )
        )
      : null,

    error
      ? React.createElement(
          'p',
          { className: 'table-chat-error' },
          error
        )
      : null
  );
}
