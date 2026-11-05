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
let state = {
  tables: [],
  connection: 'idle',
  offline: false,
  mySeat: null,
  reservation: null
};
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
socket.on('seat:reserved', reservation => setState({ reservation, mySeat: null }));
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
export function startTables(name = 'Guest') {
  if (socket.auth.name !== name) {
    socket.auth = { ...socket.auth, name };
    if (socket.connected) socket.disconnect();
  }
  if (!socket.connected && !socket.active) {
    if (state.connection === 'idle') setState({ connection: 'connecting' });
    socket.connect();
  }
}

export async function joinTable({ tableId, inviteCode, password }) {
  const result = await request('table:join', { tableId, inviteCode, password });
  if (result.ok) setState({ mySeat: { tableId: result.table.id, seat: result.seat }, reservation: null });
  return result;
}

export async function createTable(fields) {
  const result = await request('table:create', fields);
  if (result.ok) setState({ mySeat: { tableId: result.table.id, seat: result.seat }, reservation: null });
  return result;
}

export async function leaveTable() {
  const result = await request('table:leave');
  setState({ mySeat: null });
  return result;
}

// Tell the server a hand started or ended (drives the In game status)
export function setInHand(inHand) {
  return request('seat:hand', { inHand });
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

export async function updateHand(handData) {
  return request('seat:update', handData);
}
