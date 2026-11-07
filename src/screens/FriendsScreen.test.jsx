import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FriendsScreen from './FriendsScreen.jsx';
import { mockFetch } from '../test/setup.js';

const me = { type: 'registered', id: 'me', name: 'Mush' };
const FRIENDS = 'http://localhost:5000/api/friends';

const lists = (friends, friendRequests) => ({ url: `${FRIENDS}/me`, body: { friends, friendRequests } });

describe('FriendsScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
  });

  it('shows friends and pending requests', async () => {
    mockFetch([lists([{ _id: 'f1', username: 'jorge' }], [{ _id: 'r1', username: 'michele' }])]);
    render(<FriendsScreen player={me} onBack={() => {}} />);

    expect(await screen.findByText('jorge')).toBeInTheDocument();
    expect(screen.getByText('michele')).toBeInTheDocument();
  });

  it('shows empty states', async () => {
    mockFetch([lists([], [])]);
    render(<FriendsScreen player={me} onBack={() => {}} />);

    expect(await screen.findByText('No pending friend requests.')).toBeInTheDocument();
    expect(screen.getByText("You haven't added any friends yet.")).toBeInTheDocument();
  });

  it('shows an error when the friends list cannot load', async () => {
    mockFetch([{ url: `${FRIENDS}/me`, status: 500, body: {} }]);
    render(<FriendsScreen player={me} onBack={() => {}} />);
    expect(await screen.findByText('Unable to load your friends.')).toBeInTheDocument();
  });

  it('accepting a request refreshes both lists', async () => {
    let accepted = false;
    const fetch = vi.fn(async (url, options = {}) => {
      if (options.method === 'POST') {
        accepted = true;
        return { ok: true, json: async () => ({ message: 'Friend request accepted!' }) };
      }
      const body = accepted
        ? { friends: [{ _id: 'r1', username: 'michele' }], friendRequests: [] }
        : { friends: [], friendRequests: [{ _id: 'r1', username: 'michele' }] };
      return { ok: true, json: async () => body };
    });
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<FriendsScreen player={me} onBack={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(fetch).toHaveBeenCalledWith(`${FRIENDS}/accept`, expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ playerId: 'me', requesterId: 'r1' });
    expect(alert).toHaveBeenCalledWith('Friend request accepted!');
    expect(await screen.findByText('No pending friend requests.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
  });

  it('shows the server message when an action is refused', async () => {
    mockFetch([
      lists([{ _id: 'f1', username: 'jorge' }], []),
      { url: `${FRIENDS}/remove`, method: 'DELETE', status: 404, body: { message: 'Player not found.' } }
    ]);
    const user = userEvent.setup();
    render(<FriendsScreen player={me} onBack={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Player not found.'));
  });

  it('searching hides the player themself and sends a friend request', async () => {
    const fetch = mockFetch([
      lists([], []),
      { url: /search\?username=/, body: [{ _id: 'me', username: 'Mush' }, { _id: 'j1', username: 'jim' }] },
      { url: `${FRIENDS}/request`, method: 'POST', body: { message: 'ok' } }
    ]);
    const user = userEvent.setup();
    render(<FriendsScreen player={me} onBack={() => {}} />);

    await user.type(screen.getByPlaceholderText('Search username...'), 'ji');
    const results = await screen.findByText('jim');
    const row = results.closest('.search-result');
    expect(screen.queryAllByText('Mush')).toHaveLength(0);

    await user.click(within(row).getByRole('button', { name: '+ Add Friend' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Friend request sent successfully!'));
    const request = fetch.mock.calls.find(([url]) => url === `${FRIENDS}/request`);
    expect(JSON.parse(request[1].body)).toEqual({ senderId: 'me', receiverId: 'j1' });
  });

  it('says so when a search finds nobody', async () => {
    mockFetch([lists([], []), { url: /search\?username=/, body: [] }]);
    const user = userEvent.setup();
    render(<FriendsScreen player={me} onBack={() => {}} />);

    await user.type(screen.getByPlaceholderText('Search username...'), 'zz');
    expect(await screen.findByText('No players found.')).toBeInTheDocument();
  });

  it('opens a chat with a friend', async () => {
    mockFetch([
      lists([{ _id: 'f1', username: 'jorge' }], []),
      { url: 'http://localhost:5000/api/messages/me/f1', body: [] }
    ]);
    const user = userEvent.setup();
    render(<FriendsScreen player={me} onBack={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Chat' }));
    expect(await screen.findByText('No messages yet. Say hello!')).toBeInTheDocument();
  });
});
