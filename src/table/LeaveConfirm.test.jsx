import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LeaveConfirm from './LeaveConfirm.jsx';
import SoundButton from '../sound/SoundButton.jsx';

describe('LeaveConfirm (dialog focus + dismiss hooks)', () => {
  it('focuses Stay, shows the stake and confirms on Leave', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<LeaveConfirm stake={1500} onConfirm={onConfirm} onCancel={() => {}} />);

    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus();
    expect(screen.getByText(/lose your 1,500-chip bet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave and lose bet' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('Escape and a click on the backdrop both cancel; a click inside does not', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<LeaveConfirm stake={10} onConfirm={() => {}} onCancel={onCancel} />);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('alertdialog'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(container.querySelector('.leave-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe('SoundButton (outside-click hook)', () => {
  it('opens on click and closes on Escape or a click elsewhere', async () => {
    const user = userEvent.setup();
    // The panel fades out before it is removed
    const gone = () => waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sound settings' })).not.toBeInTheDocument());
    render(<><SoundButton /><p>elsewhere</p></>);

    await user.click(screen.getByRole('button', { name: /Sound/ }));
    expect(screen.getByRole('dialog', { name: 'Sound settings' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await gone();

    await user.click(screen.getByRole('button', { name: /Sound/ }));
    await user.click(screen.getByText('elsewhere'));
    await gone();
  });
});
