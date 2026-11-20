import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader.jsx';

vi.mock('../realtime/useTables.js', () => ({
  useTables: () => ({ connection: 'connected', offline: false })
}));

function renderHeader(player, screenName = 'lobby') {
  const props = { onHome: vi.fn(), onNavigate: vi.fn(), onLogOut: vi.fn(), onGuestExit: vi.fn() };
  render(<AppHeader screen={screenName} player={player} chips={1250} {...props} />);
  return { ...props, user: userEvent.setup() };
}

describe('AppHeader', () => {
  it('shows practice mode before anyone has logged in', () => {
    renderHeader(null, 'start');
    expect(screen.getByText('Practice mode')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  });

  it('guests see their chips but no history or profile menu', () => {
    renderHeader({ type: 'guest', name: 'Guest' });
    expect(screen.getByText('1,250 chips')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open profile menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit guest session' })).toBeInTheDocument();
  });

  it('lets guests exit the game', async () => {
    const { onGuestExit, user } = renderHeader({ type: 'guest', name: 'Guest' });

    await user.click(screen.getByRole('button', { name: 'Exit guest session' }));

    expect(onGuestExit).toHaveBeenCalledOnce();
  });

  it('registered players get history and the profile menu', async () => {
    const { onNavigate, onLogOut, user } = renderHeader({ type: 'registered', name: 'mush', email: 'm@x.com' });

    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(onNavigate).toHaveBeenCalledWith('history');

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(screen.getByText('m@x.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /View Friends/ }));
    expect(onNavigate).toHaveBeenCalledWith('friends');
    expect(screen.queryByText('m@x.com')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
    await user.click(screen.getByRole('button', { name: /Log Out/ }));
    expect(onLogOut).toHaveBeenCalled();
  });

  it('lets registered players open the feedback form', async () => {
    const onFeedback = vi.fn();
    const user = userEvent.setup();
    render(
      <AppHeader
        screen="lobby"
        player={{ type: 'registered', role: 'player', name: 'Mush' }}
        chips={1000}
        onHome={vi.fn()}
        onNavigate={vi.fn()}
        onLogOut={vi.fn()}
        onFeedback={onFeedback}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(onFeedback).toHaveBeenCalledOnce();
  });

  it('does not show player feedback controls to admins', () => {
    renderHeader({ type: 'registered', role: 'admin', name: 'Admin' });
    expect(screen.queryByRole('button', { name: 'Send feedback' })).not.toBeInTheDocument();
  });

  it('identifies an admin account in the profile menu', async () => {
    const { user } = renderHeader({
      type: 'registered',
      role: 'admin',
      name: 'Admin',
      email: 'admin@example.com'
    });

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('the logo and Play both go home', async () => {
    const { onHome, user } = renderHeader(null, 'tutorial');
    await user.click(screen.getByText('21 CLUB'));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onHome).toHaveBeenCalledTimes(2);
  });
});
