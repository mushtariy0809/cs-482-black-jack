import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../test/setup.js';
import FeedbackModal from './FeedbackModal.jsx';

describe('FeedbackModal', () => {
  it('submits title, importance, and description using the player token', async () => {
    const fetch = mockFetch([{
      url: 'http://localhost:5000/api/feedback',
      method: 'POST',
      status: 201,
      body: { _id: 'ticket-1' }
    }]);
    const user = userEvent.setup();
    render(<FeedbackModal player={{ token: 'player-token' }} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Title'), 'Sound settings reset');
    await user.selectOptions(screen.getByLabelText('Importance'), 'high');
    await user.type(screen.getByLabelText('Description'), 'Sound resets when I rejoin.');
    await user.click(screen.getByRole('button', { name: 'Send to admin' }));

    expect(await screen.findByText('Your feedback was sent to the admin team.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('http://localhost:5000/api/feedback', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer player-token'
      },
      body: JSON.stringify({
        title: 'Sound settings reset',
        importance: 'high',
        description: 'Sound resets when I rejoin.'
      })
    }));
  });

  it('shows server errors without pretending submission succeeded', async () => {
    mockFetch([{
      url: 'http://localhost:5000/api/feedback',
      method: 'POST',
      status: 503,
      body: { message: 'Feedback is temporarily unavailable.' }
    }]);
    const user = userEvent.setup();
    render(<FeedbackModal player={{ token: 'player-token' }} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Title'), 'A problem');
    await user.type(screen.getByLabelText('Description'), 'The game is stuck.');
    await user.click(screen.getByRole('button', { name: 'Send to admin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Feedback is temporarily unavailable.');
    expect(screen.queryByText('Your feedback was sent to the admin team.')).not.toBeInTheDocument();
  });

  it('lets a player read the admin reply on one of their tickets', async () => {
    mockFetch([{
      url: 'http://localhost:5000/api/feedback/mine',
      body: [{
        _id: 'ticket-2',
        title: 'Private table access',
        importance: 'low',
        description: 'I cannot join my private table.',
        status: 'resolved',
        replies: [{ senderRole: 'admin', message: 'We fixed the invite link.' }]
      }]
    }]);
    const user = userEvent.setup();
    render(<FeedbackModal player={{ token: 'player-token' }} onClose={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'My tickets' }));
    expect(await screen.findByText('I cannot join my private table.')).toBeInTheDocument();
    expect(screen.getByText('We fixed the invite link.')).toBeInTheDocument();
  });
});
