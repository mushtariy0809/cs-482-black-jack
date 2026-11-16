import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitePanel from './InvitePanel.jsx';
import { getInviteInfo, inviteFriend } from '../realtime/useTables.js';
import { fetchFriends } from '../friends/friendsApi.js';

vi.mock('../realtime/useTables.js', () => ({ getInviteInfo: vi.fn(), inviteFriend: vi.fn() }));
vi.mock('../friends/friendsApi.js', () => ({ fetchFriends: vi.fn() }));

const table = { id: 't1', name: 'Hidden Den', players: 1, maxSeats: 4 };
const player = { type: 'registered', id: 'me', name: 'Mush' };

describe('InvitePanel (U1 share / invite friends)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInviteInfo.mockResolvedValue({ ok: true, tableId: 't1', tableName: 'Hidden Den', inviteCode: 'ABC234', visibility: 'private', hasPin: true });
    fetchFriends.mockResolvedValue({ friends: [{ _id: 'f1', username: 'Jorge' }, { _id: 'f2', username: 'Michele' }] });
    inviteFriend.mockResolvedValue({ ok: true, online: true });
  });

  it('shows the invite link, code, seats left and the creator\'s PIN', async () => {
    const user = userEvent.setup();
    render(<InvitePanel table={table} player={player} pin="4821" onClose={() => {}} />);

    expect(await screen.findByDisplayValue(/\?join=ABC234$/)).toBeInTheDocument();
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(screen.getByText(/3 seats open · hidden from the lobby/)).toBeInTheDocument();

    expect(screen.queryByText('4821')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('4821')).toBeInTheDocument();
  });

  it('invites a friend from the list', async () => {
    const user = userEvent.setup();
    render(<InvitePanel table={table} player={player} onClose={() => {}} />);

    const row = (await screen.findByText('Jorge')).closest('li');
    await user.click(within(row).getByRole('button', { name: 'Invite' }));

    expect(inviteFriend).toHaveBeenCalledWith('f1');
    expect(await within(row).findByText('Invite sent')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Invited' })).toBeDisabled();
  });

  it('guests get the link but are asked to log in for the friends list', async () => {
    render(<InvitePanel table={table} player={{ type: 'guest', name: 'Guest' }} onClose={() => {}} />);

    expect(await screen.findByText(/Log in to invite people/)).toBeInTheDocument();
    expect(fetchFriends).not.toHaveBeenCalled();
  });
});
