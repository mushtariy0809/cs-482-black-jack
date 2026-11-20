import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableChat from './TableChat.jsx';

vi.mock('./realtime/useTables.js', () => ({
  useTables: () => ({
    chatMessages: [],
    privateMessages: [],
    tableState: {
      tableId: 'table-1',
      seats: [
        { index: 0, name: 'Me' },
        { index: 1, name: 'Alice' }
      ]
    },
    mySeat: { seat: 0 }
  }),
  sendTableChat: vi.fn(),
  sendPrivateTableChat: vi.fn()
}));

describe('TableChat unread private message notifications', () => {
  it('shows unread counts on sender tabs and marks the selected chat read', async () => {
    const onActiveChatChange = vi.fn();
    render(
      <TableChat
        player={{ id: 'me', token: 'token' }}
        table={{ id: 'table-1' }}
        unreadPrivateBySeat={{ 1: 3 }}
        onActiveChatChange={onActiveChatChange}
      />
    );

    const aliceTab = screen.getByRole('button', { name: 'Alice, 3 unread messages' });
    expect(aliceTab).toBeInTheDocument();

    await userEvent.setup().click(aliceTab);

    expect(onActiveChatChange).toHaveBeenCalledWith(1);
  });

  it('switching back to table chat updates the active conversation', async () => {
    const onActiveChatChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TableChat
        player={{ id: 'me', token: 'token' }}
        table={{ id: 'table-1' }}
        onActiveChatChange={onActiveChatChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Alice' }));
    await user.click(screen.getByRole('button', { name: 'Table Chat' }));

    expect(onActiveChatChange).toHaveBeenLastCalledWith(null);
  });
});
