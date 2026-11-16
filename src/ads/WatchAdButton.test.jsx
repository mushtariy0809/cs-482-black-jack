import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchAdButton from './WatchAdButton.jsx';

const status = { reward: 100, perDay: 5, watchedToday: 1, remaining: 4, nextAt: null };

describe('WatchAdButton (U21 watch ads)', () => {
  it('offers +100 chips when an ad is ready', async () => {
    const onWatch = vi.fn();
    const user = userEvent.setup();
    render(<WatchAdButton status={status} onWatch={onWatch} />);

    const button = screen.getByRole('button', { name: /Watch ad \+100 · 4 of 5 left today/ });
    await user.click(button);
    expect(onWatch).toHaveBeenCalled();
  });

  it('counts down during the break between ads', () => {
    render(<WatchAdButton status={{ ...status, nextAt: Date.now() + 12_000 }} onWatch={() => {}} />);

    const button = screen.getByRole('button', { name: /Next ad in 1[12]s/ });
    expect(button).toBeDisabled();
  });

  it('is disabled after the daily limit', () => {
    render(<WatchAdButton status={{ ...status, watchedToday: 5, remaining: 0, nextAt: Date.now() + 3_600_000 }} onWatch={() => {}} />);

    expect(screen.getByRole('button', { name: /No more ads today/ })).toBeDisabled();
    expect(screen.getByText('Done today')).toBeInTheDocument();
  });
});
