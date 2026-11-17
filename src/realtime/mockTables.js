import { AD_REWARD, ADS_PER_DAY, BUILT_IN_ADS } from '../../shared/ads.js';

// Demo tables shown when the socket server can't be reached,
// so the lobby still works while the backend is down.
function table(fields) {
  return {
    visibility: 'public',
    hasPin: false,
    mode: 'people',
    solo: false,
    isSystem: false,
    maxSeats: 5,
    players: 0,
    seats: [],
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
      hasPin: Boolean(payload.password),
      maxSeats: payload.maxSeats ?? 5,
      players: 1
    });
    return { ok: true, table: created, inviteCode: 'DEMO00', seat: 0 };
  }

  return mockExtras(event, payload) ?? { ok: true };
}

// Demo ads: no limits, nothing saved
let demoAdIndex = 0;
const demoAdStatus = { reward: AD_REWARD, perDay: ADS_PER_DAY, watchedToday: 0, remaining: ADS_PER_DAY, nextAt: null };

function mockExtras(event, payload) {
  switch (event) {
    case 'table:peek':
      return { ok: false, code: 'offline', message: 'Invite codes need the server. Try again once you are back online.' };
    case 'table:invite-info':
      return { ok: true, tableId: null, tableName: '', inviteCode: 'DEMO00', visibility: 'public', hasPin: false };
    case 'table:invite':
      return { ok: false, code: 'offline', message: 'Invites need the server. Try again once you are back online.' };
    case 'table:mine':
      return { ok: true, tables: [] };
    case 'table:delete':
      return { ok: false, code: 'offline', message: 'Deleting tables needs the server. Try again once you are back online.' };
    case 'ad:status':
      return { ok: true, status: demoAdStatus };
    case 'ad:start': {
      const videos = BUILT_IN_ADS.filter(a => a.kind === 'video');
      const ad = videos.find(a => a.id === payload.adId) ?? videos[demoAdIndex++ % videos.length];
      return { ok: true, viewId: `demo-${Date.now()}`, adId: ad.id, durationMs: ad.durationMs, ad, status: demoAdStatus };
    }
    case 'ads:list':
      return { ok: true, ads: BUILT_IN_ADS };
    case 'ad:complete':
      return { ok: true, reward: AD_REWARD, status: demoAdStatus, seatChips: null };
    default:
      return null;
  }
}
