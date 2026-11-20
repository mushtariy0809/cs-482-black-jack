import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TableBar from './TableBar.jsx';

vi.mock('../realtime/useTables.js', () => ({
  useTables: () => ({ tables: [] })
}));

describe('TableBar chat notifications', () => {
  it('shows unread table messages on the chat button', () => {
    render(
      <TableBar
        table={{ id: 'table-1', name: 'Main Table', players: 2, maxSeats: 5 }}
        canChat
        unreadChatCount={4}
        onChat={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Chat, 4 unread messages' })).toBeInTheDocument();
    expect(screen.getByText('4')).toHaveClass('profile-notification-badge');
  });

  it('does not show a badge when there are no unread messages', () => {
    render(
      <TableBar
        table={{ id: 'table-1', name: 'Main Table', players: 2, maxSeats: 5 }}
        canChat
        onChat={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
