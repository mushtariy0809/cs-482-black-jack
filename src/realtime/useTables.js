import { useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import { getClientId } from './clientId.js';
import { createMockTables, mockAction } from './mockTables.js';

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const ACK_TIMEOUT_MS = 8000;

const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnectionDelayMax: 5000,
  auth: { clientId: getClientId(), name: 'Guest' }
});

// One shared copy of the live table list for the whole app.
// connection: 'idle' | 'connecting' | 'online' | 'reconnecting'
// offline: true while showing demo tables because the server never answered
// mySeat: { tableId, seat } after joining
// reservation: { tableId, tableName, seat, expiresAt, forfeited } while a seat is held after leaving
// tableState: the shared round at a multiplayer table (from the server), plus receivedAt for timers
let state = {
  tables: [],
  connection: 'idle',
  offline: false,
  mySeat: null,
  reservation: null,
  tableState: null,
  chatMessages: [],
  privateMessages: [],
  // Friend invites waiting for an answer: { tableId, tableName, inviteCode, hasPin, fromName, players, maxSeats, sentAt }
  invites: [],
  // Active video and banner ads from the server (null until it answers: the built-in ads are used)
  adCatalog: null
};
// Ad events waiting for the connection (see trackAd)
const pendingAdEvents = [];

// Chips the player sits down with (the app keeps the balance between tables)
let chipsHint = null;
export function setChipsHint(chips) {
  chipsHint = chips;
}
const listeners = new Set();

function setState(changes) {
  state = { ...state, ...changes };
  listeners.forEach(listener => listener());
}

function upsert(table) {
  const exists = state.tables.some(t => t.id === table.id);
  setState({
    tables: exists ? state.tables.map(t => (t.id === table.id ? table : t)) : [...state.tables, table]
  });
}

socket.on('connect', () => {
  // A seat taken in demo mode doesn't exist on the server
  setState({ connection: 'online', offline: false, mySeat: state.offline ? null : state.mySeat });
  socket.emit('lobby:subscribe');
  socket.emit('ads:list', {}, result => {
    if (result?.ok) setState({ adCatalog: result.ads });
  });
  // Ad impressions/clicks from before the connection was up (the lobby shows its banners right away)
  pendingAdEvents.splice(0).forEach(event => socket.emit('ad:track', event));
  // Back after a dropped connection: take the held seat again (and get the table's state)
  if (state.mySeat) {
    socket.emit('table:join', { tableId: state.mySeat.tableId }, result => {
      if (!result?.ok) setState({ mySeat: null, tableState: null });
    });
  }
});

socket.on('table:private:message', message => {
  setState({
    privateMessages: [...state.privateMessages, message].slice(-200)
  });
});

socket.on('table:chat:message', message => {
  setState({
    chatMessages: [...state.chatMessages, message].slice(-100)
  });
});

// An admin added, changed or archived an ad
socket.on('ads:catalog', ads => setState({ adCatalog: ads }));

// A friend invited us to their table (shown by InviteToasts)
socket.on('table:invite', invite => {
  const others = state.invites.filter(i => i.tableId !== invite.tableId);
  setState({ invites: [...others, invite].slice(-3) });
});

socket.on('disconnect', () => setState({ connection: 'reconnecting' }));
socket.on('connect_error', () => {
  // Never got a real list: show demo tables so the lobby isn't empty
  if (state.offline || state.tables.length === 0) {
    setState({ connection: 'reconnecting', offline: true, tables: state.offline ? state.tables : createMockTables() });
  } else {
    setState({ connection: 'reconnecting' });
  }
});

socket.on('tables:snapshot', tables => setState({ tables }));
socket.on('table:created', upsert);
socket.on('table:updated', upsert);
socket.on('table:removed', tableId => setState({ tables: state.tables.filter(t => t.id !== tableId) }));
socket.on('seat:reserved', reservation => setState({ reservation, mySeat: null, tableState: null }));
// Can arrive just before the join reply, so it's kept even before mySeat is set;
// the table screen only uses it when tableState.tableId matches mySeat.tableId.
socket.on('table:state', tableState => {
  setState({ tableState: { ...tableState, receivedAt: Date.now() } });
});
socket.on('seat:released', ({ tableId }) => {
  if (state.reservation?.tableId === tableId) setState({ reservation: null });
});

// Sends an event and resolves with the server's { ok, ... } reply. Never rejects.
async function request(event, payload = {}) {
  if (state.offline) {
    const result = mockAction(event, payload, state.tables);
    if (result.table) upsert(result.table);
    return result;
  }
  if (!socket.connected) {
    return { ok: false, code: 'offline', message: 'Reconnecting… try again in a moment.' };
  }
  try {
    return await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload);
  } catch {
    return { ok: false, code: 'timeout', message: 'The server took too long to answer. Try again.' };
  }
}

// Connect (or reconnect with a new display name). Safe to call more than once.
export function startTables(name = 'Guest', token) {
  if (socket.auth.name !== name || socket.auth.token !== token) {
    socket.auth = { ...socket.auth, name, token };
    if (socket.connected) socket.disconnect();
  }
  if (!socket.connected && !socket.active) {
    if (state.connection === 'idle') setState({ connection: 'connecting' });
    socket.connect();
  }
}

export function stopTables() {
  socket.disconnect();
  socket.auth = { clientId: getClientId(), name: 'Guest' };
  setState({
    tables: [],
    connection: 'idle',
    offline: false,
    mySeat: null,
    reservation: null,
    tableState: null,
    chatMessages: [],
    privateMessages: [],
    invites: []
  });
}

// Keeps a table:state that already arrived for this table
function seated(result) {
  if (!result.ok) return;
  const sameTable = state.tableState?.tableId === result.table.id;
  setState({
    mySeat: { tableId: result.table.id, seat: result.seat },
    reservation: null,
    tableState: sameTable ? state.tableState : null,
    chatMessages: sameTable ? state.chatMessages : [],
    privateMessages: sameTable ? state.privateMessages : []
  });
}

export async function joinTable({ tableId, inviteCode, password }) {
  const result = await request('table:join', { tableId, inviteCode, password, chips: chipsHint ?? undefined });
  seated(result);
  if (result.ok) dismissInvite(result.table.id);
  return result;
}

// fields: { name, visibility, password? (4–6 digit PIN, private only), maxSeats }
export async function createTable(fields) {
  const result = await request('table:create', { ...fields, chips: chipsHint ?? undefined });
  seated(result);
  return result;
}

export async function leaveTable() {
  const result = await request('table:leave');
  setState({ mySeat: null, tableState: null, chatMessages: [], privateMessages: []});
  return result;
}

// Multiplayer tables: the server runs the round, the browser only asks
export function placeBet(amount) {
  return request('round:bet', { amount });
}

export function decideInsurance(take) {
  return request('round:insurance', { take });
}

// type: 'hit' | 'stand' | 'double' | 'split'
export function playAction(type) {
  return request('round:action', { type });
}

// Tell the server a hand started or ended (drives the In game status)
export function setInHand(inHand) {
  return request('seat:hand', { inHand });
}

// Invites (U1) and private tables (T1)

// Looks up an invite code without joining: { table, needsPin }
export function peekInvite(inviteCode) {
  return request('table:peek', { inviteCode });
}

// { tableId, tableName, inviteCode, visibility, hasPin } for the table you're at
export function getInviteInfo() {
  return request('table:invite-info');
}

// Logged-in players only: invite a friend by account id. Resolves to { ok, online }
export function inviteFriend(playerId) {
  return request('table:invite', { playerId });
}

export function dismissInvite(tableId) {
  if (state.invites.some(i => i.tableId === tableId)) {
    setState({ invites: state.invites.filter(i => i.tableId !== tableId) });
  }
}

// Tables you created (History > My tables): [{ ...table, inviteCode, seatedHere, canDelete }]
export function getMyTables() {
  return request('table:mine');
}

// Only works when nobody is seated (the server checks)
export function deleteTable(tableId) {
  return request('table:delete', { tableId });
}

// Video ads (U21). The server checks the limits and pays the reward.

export function getAdStatus() {
  return request('ad:status');
}

export function startAd(adId) {
  return request('ad:start', { adId });
}

export function completeAd(viewId) {
  return request('ad:complete', { viewId });
}

export function abandonAd(viewId) {
  return request('ad:abandon', { viewId });
}

// A banner was shown, or an ad link clicked (A4). Fire and forget: never blocks the UI.
// placement: 'lobby' | 'table' | 'video'
// Sent once connected if the socket isn't up yet; dropped in demo mode (no server to count them).
export function trackAd(adId, type, placement) {
  if (state.offline) return;
  const event = { adId, type, placement };
  if (socket.connected) socket.emit('ad:track', event);
  else if (pendingAdEvents.length < 50) pendingAdEvents.push(event);
}

export function sendTableChat(message) {
  return request('table:chat:send', { message });
}

export function sendPrivateTableChat(recipientSeat, message) {
  return request('table:private:send', { recipientSeat, message });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState() {
  return state;
}

export function useTables() {
  return useSyncExternalStore(subscribe, getState, getState);
}