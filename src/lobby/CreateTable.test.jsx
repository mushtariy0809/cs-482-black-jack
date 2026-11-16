import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateTable from './CreateTable.jsx';
import { createTable } from '../realtime/useTables.js';

vi.mock('../realtime/useTables.js', () => ({ createTable: vi.fn() }));

const created = { ok: true, table: { id: 't1', name: 'Den', visibility: 'private' }, inviteCode: 'ABC234', seat: 0 };

describe('CreateTable (T1 private tables, seat count)', () => {
  beforeEach(() => {
    createTable.mockReset();
    createTable.mockResolvedValue(created);
  });

  it('creates a public 5-seat table by default, with no People/Bots choice', async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CreateTable onCreated={onCreated} onCancel={() => {}} />);

    expect(screen.queryByRole('button', { name: /Bots/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByLabelText(/Table name/), 'Late Night');
    await user.click(screen.getByRole('button', { name: /Create table/ }));

    expect(createTable).toHaveBeenCalledWith({ name: 'Late Night', visibility: 'public', password: undefined, maxSeats: 5 });
    expect(onCreated).toHaveBeenCalledWith(created, { pin: '' });
  });

  it('a private table can skip the PIN, and players pick 2 to 7 seats', async () => {
    const user = userEvent.setup();
    render(<CreateTable onCreated={() => {}} onCancel={() => {}} />);

    expect(screen.getAllByRole('button', { name: /^[2-7]$/ })).toHaveLength(6);

    await user.type(screen.getByLabelText(/Table name/), 'Den');
    await user.click(screen.getByRole('button', { name: /Private/ }));
    await user.click(screen.getByRole('button', { name: '7' }));
    expect(screen.getByText(/hidden from the lobby. Only people with your invite link/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Create table/ }));
    expect(createTable).toHaveBeenCalledWith({ name: 'Den', visibility: 'private', password: undefined, maxSeats: 7 });
  });

  it('with the PIN switched on, it needs 4–6 digits and passes the PIN on', async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CreateTable onCreated={onCreated} onCancel={() => {}} />);

    await user.type(screen.getByLabelText(/Table name/), 'Den');
    await user.click(screen.getByRole('button', { name: /Private/ }));
    await user.click(screen.getByRole('switch', { name: /Require a PIN/ }));

    const pin = screen.getByLabelText(/^PIN/);
    await user.type(pin, '12a');
    expect(pin).toHaveValue('12');

    await user.click(screen.getByRole('button', { name: /Create table/ }));
    expect(screen.getByText('The PIN needs at least 4 digits.')).toBeInTheDocument();
    expect(createTable).not.toHaveBeenCalled();

    await user.type(pin, '3456789');
    expect(pin).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: /Create table/ }));

    expect(createTable).toHaveBeenCalledWith({ name: 'Den', visibility: 'private', password: '123456', maxSeats: 5 });
    expect(onCreated).toHaveBeenCalledWith(created, { pin: '123456' });
  });
});
