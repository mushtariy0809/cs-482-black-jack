// Demo tables shown when the socket server can't be reached,
// so the lobby still works while the backend is down.
function table(fields) {
  return {
    visibility: 'public',
    mode: 'people',
    solo: false,
    isSystem: false,
    maxSeats: 5,
    players: 0,
    seats: [],
    dealer: null,
    minBet: 10,
    maxBet: 500,
    status: 'waiting',
    createdAt: Date.now(),
    ...fields
  };
}

export function createMockTables() {
  return [
    table({ id: 'green-room', name: 'The Green Room', isSystem: true, players: 3 }),
    table({ id: 'practice', name: 'Practice', mode: 'bots', solo: true, isSystem: true, minBet: 5, maxBet: 100 }),
    table({ id: 'demo-high-rollers', name: 'High Rollers', players: 5, status: 'full', minBet: 100, maxBet: 2000 }),
    table({ id: 'demo-friday', name: 'Friday Night', visibility: 'private', players: 2, status: 'in_game' })
  ];
}

// Offline versions of the server actions. They only change this browser's copy.
export function mockAction(event, payload, tables) {
  const find = id => tables.find(t => t.id === id);

  if (event === 'table:join') {
    const target = find(payload.tableId);
    if (!target) return { ok: false, code: 'not_found', message: 'That table is no longer available.' };
    if (target.status === 'full') return { ok: false, code: 'full', message: 'That table is full.' };

    const updated = { ...target, players: target.players + 1 };
    if (!updated.solo && updated.players >= updated.maxSeats) updated.status = 'full';
    return { ok: true, table: updated, seat: target.players, rejoined: false };
  }

  if (event === 'table:create') {
    const name = String(payload.name ?? '').trim();
    if (name.length < 3 || name.length > 30) {
      return { ok: false, code: 'invalid_name', message: 'Table name must be 3 to 30 characters.' };
    }
    if (tables.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, code: 'duplicate_name', message: 'A table with that name already exists.' };
    }

    const created = table({
      id: 'demo-' + Date.now(),
      name,
      visibility: payload.visibility ?? 'public',
      mode: payload.mode ?? 'people',
      players: payload.seat === 'dealer' ? 0 : 1
    });
    return { ok: true, table: created, inviteCode: 'DEMO00', seat: payload.seat === 'dealer' ? null : 0 };
  }

  return { ok: true };
}
