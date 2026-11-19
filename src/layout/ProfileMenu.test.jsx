import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileMenu from './ProfileMenu.jsx';

const player = { name: 'Mush', email: 'mush@example.com' };

describe('ProfileMenu notifications', () => {
  it('shows the unread count on the profile icon', () => {
    render(
      <ProfileMenu
        player={player}
        notificationCount={4}
        onProfile={vi.fn()}
        onFriends={vi.fn()}
        onLogOut={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Open profile menu, 4 notifications' })).toBeInTheDocument();
    expect(screen.getByText('4')).toHaveClass('profile-notification-badge');
  });

  it('caps large counts and hides the badge when there are no notifications', () => {
    const { rerender } = render(
      <ProfileMenu player={player} notificationCount={125} onProfile={vi.fn()} onFriends={vi.fn()} onLogOut={vi.fn()} />
    );

    expect(screen.getByText('99+')).toBeInTheDocument();

    rerender(
      <ProfileMenu player={player} notificationCount={0} onProfile={vi.fn()} onFriends={vi.fn()} onLogOut={vi.fn()} />
    );

    expect(screen.queryByText('99+')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open profile menu' })).toBeInTheDocument();
  });

  it('keeps the existing profile menu actions available', async () => {
    const onFriends = vi.fn();
    render(
      <ProfileMenu
        player={player}
        notificationCount={7}
        friendRequestCount={0}
        onProfile={vi.fn()}
        onFriends={onFriends}
        onLogOut={vi.fn()}
      />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open profile menu, 7 notifications' }));
    const viewFriendsButton = screen.getByRole('button', {
      name: 'View Friends, 7 notifications, including 0 friend requests'
    });
    expect(within(viewFriendsButton).getByText('7')).toHaveClass('profile-menu-count');
    await user.click(screen.getByRole('button', { name: /View Friends/ }));

    expect(onFriends).toHaveBeenCalledOnce();
  });
});
