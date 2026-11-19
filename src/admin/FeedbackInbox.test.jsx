import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeedbackInbox from './FeedbackInbox.jsx';

const ticket = {
  _id: 'feedback-0001042',
  title: 'Sound settings reset',
  importance: 'medium',
  description: 'My sound resets when I rejoin a table.',
  status: 'open',
  submittedBy: { username: 'Mush' },
  replies: [],
  createdAt: '2026-11-18T18:00:00.000Z'
};

describe('FeedbackInbox', () => {
  it('shows player feedback and lets an admin reply and resolve it', async () => {
    const fetch = vi.fn(async (_url, options = {}) => {
      if (options.method !== 'PATCH') {
        return { ok: true, json: async () => [ticket] };
      }

      const changes = JSON.parse(options.body);
      const updated = {
        ...ticket,
        ...changes,
        replies: changes.reply
          ? [{ senderRole: 'admin', message: changes.reply }]
          : ticket.replies
      };
      return { ok: true, json: async () => updated };
    });
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<FeedbackInbox token="admin-token" />);

    expect(await screen.findByRole('heading', { name: 'Sound settings reset' })).toBeInTheDocument();
    expect(screen.getByText('My sound resets when I rejoin a table.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reply to player'), 'We will investigate.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Reply sent.')).toBeInTheDocument();
    expect(screen.getByText('We will investigate.')).toBeInTheDocument();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ reply: 'We will investigate.' });

    await user.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(await screen.findByText('Ticket marked resolved.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Resolved/ }));
    expect(screen.getByText('resolved', { selector: '.admin-status' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Feedback tickets')).getByText('Sound settings reset')).toBeInTheDocument();
  });
});
