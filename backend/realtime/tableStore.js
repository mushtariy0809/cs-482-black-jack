
const crypto = require('crypto');
const EventEmitter = require('events');
const bcrypt = require('bcryptjs');

// 5 player seats + 1 dealer = the six-person table from the README
const MAX_SEATS = 5;
// How long a seat is held after a player leaves
const SEAT_HOLD_MS = 10 * 1000;
// Empty player-made tables are removed after this long
const IDLE_TABLE_MS = 5 * 60 * 1000;

// Always-available tables. They are created on startup and never removed.
const SYSTEM_TABLES = [
  { id: 'green-room', name: 'The Green Room', mode: 'people', minBet: 10, maxBet: 500 },
  { id: 'practice', name: 'Practice', mode: 'bots', solo: true, minBet: 5, maxBet: 100 }
];

class TableError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function newId() {
  return crypto.randomBytes(5).toString('hex');
}

// No 0/O or 1/I so codes are easy to read out loud
function newInviteCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (const byte of crypto.randomBytes(6)) {
    code += letters[byte % letters.length];
  }
  return code;
}

function statusOf(table) {
  if (!table.solo && table.seats.length >= table.maxSeats) return 'full';
  if (table.seats.some(seat => seat.inHand)) return 'in_game';
  return 'waiting';
}

// What every lobby is allowed to see. Never includes passwords or client ids,
// and private invite codes are only given to the table creator.
function publicView(table) {
  return {
    id: table.id,
    name: table.name,
    visibility: table.visibility,
    mode: table.mode,
    solo: table.solo,
    isSystem: table.isSystem,
    maxSeats: table.maxSeats,
    players: table.seats.length,
    seats: table.seats.map(seat => ({
      index: seat.index,
      name: seat.name,
      reserved: Boolean(seat.reservedUntil)
    })),
    dealer: table.dealer ? table.dealer.name : null,
    minBet: table.minBet,
    maxBet: table.maxBet,
    status: statusOf(table),
    inviteCode: table.visibility === 'public' ? table.inviteCode : undefined,
    createdAt: table.createdAt.getTime()
  };
}

class TableStore extends EventEmitter {
  // persist: { save(table), remove(id) }, both may return promises
  constructor({ persist = {}, now = Date.now } = {}) {
    super();
    this.tables = new Map();
    this.holdTimers = new Map();
    this.persist = persist;
    this.now = now;
  }

  // Load saved tables. Nobody is connected after a restart, so seats start empty.
  load(docs) {
    for (const doc of docs) {
      const table = {
        ...doc,
        id: String(doc._id ?? doc.id),
        seats: [],
        dealer: null,
        createdAt: new Date(doc.createdAt ?? this.now()),
        emptySince: doc.isSystem ? null : new Date(this.now())
      };
      delete table._id;
      delete table.__v;
      delete table.updatedAt;
      this.tables.set(table.id, table);
    }
  }

  ensureSystemTables() {
    for (const system of SYSTEM_TABLES) {
      if (this.tables.has(system.id)) continue;

      const table = this._newTable({ ...system, isSystem: true, createdBy: null });
      this.tables.set(table.id, table);
      this._save(table);
    }
  }

  list() {
    return [...this.tables.values()].map(publicView);
  }

  get(tableId) {
    const table = this.tables.get(tableId);
    return table ? publicView(table) : null;
  }

  // A client holds at most one seat (or dealer spot) across all tables
  seatOf(clientId) {
    for (const table of this.tables.values()) {
      const seat = table.seats.find(s => s.clientId === clientId);
      if (seat) return { table, seat };
    }
    return null;
  }

  reservationFor(clientId) {
    const current = this.seatOf(clientId);
    if (!current || !current.seat.reservedUntil) return null;
    return this._reservation(current.table, current.seat, false);
  }

  async create(input = {}, client) {
    const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
    const visibility = input.visibility ?? 'public';
    const mode = input.mode ?? 'people';
    const role = input.seat ?? 'player';
    const password = input.password ? String(input.password) : '';

    if (name.length < 3 || name.length > 30) {
      throw new TableError('invalid_name', 'Table name must be 3 to 30 characters.');
    }
    if (!['public', 'private'].includes(visibility)) {
      throw new TableError('invalid_input', 'Choose public or private.');
    }
    if (!['people', 'bots'].includes(mode)) {
      throw new TableError('invalid_input', 'Choose people or bots.');
    }
    if (!['player', 'dealer'].includes(role)) {
      throw new TableError('invalid_input', 'Choose player or dealer.');
    }
    if (visibility === 'private' && !password) {
      throw new TableError('password_required', 'Private tables need a password.');
    }

    const passwordHash = visibility === 'private' ? await bcrypt.hash(password, 10) : null;

    // Checked after the await so two people can't grab the same name at once
    this._checkNameFree(name);
    this._checkCanSwitch(client.clientId);
    this._releaseEverywhere(client.clientId);

    const table = this._newTable({
      name,
      visibility,
      passwordHash,
      mode,
      createdBy: client.clientId,
      dealer: role === 'dealer' ? { clientId: client.clientId, name: client.name } : null
    });
    this.tables.set(table.id, table);

    let seat = null;
    if (role === 'player') {
      seat = this._takeSeat(table, client).index;
    }

    this._changed(table, 'created');

    return { table: publicView(table), inviteCode: table.inviteCode, seat, role };
  }

  async join({ tableId, inviteCode, password } = {}, client) {
    const table = tableId
      ? this.tables.get(tableId)
      : [...this.tables.values()].find(t => t.inviteCode === String(inviteCode ?? '').trim().toUpperCase());

    if (!table) {
      throw new TableError('not_found', 'That table is no longer available.');
    }

    const alreadyHere = table.seats.some(s => s.clientId === client.clientId);

    if (table.visibility === 'private' && !alreadyHere) {
      const ok = Boolean(password) && await bcrypt.compare(String(password), table.passwordHash);
      if (!ok) throw new TableError('bad_password', 'Wrong table password.');
    }

    // Everything below is synchronous, so seat counts can't change under us
    const current = this.seatOf(client.clientId);

    if (current && current.table === table) {
      const rejoined = Boolean(current.seat.reservedUntil);
      if (rejoined) {
        this._clearHold(table.id, client.clientId);
        current.seat.reservedUntil = null;
        current.seat.name = client.name;
        this._changed(table);
      }
      return { table: publicView(table), seat: current.seat.index, rejoined };
    }

    // README rule: no switching tables during an active game
    this._checkCanSwitch(client.clientId);

    if (statusOf(table) === 'full') {
      throw new TableError('full', 'That table is full.');
    }

    // Joining a different table gives up any held seat right away
    this._releaseEverywhere(client.clientId);

    const seat = this._takeSeat(table, client);
    this._changed(table);

    return { table: publicView(table), seat: seat.index, rejoined: false };
  }

  // Leave the current table. The seat is held for SEAT_HOLD_MS.
  // forfeited is true when the player left in the middle of a hand.
  leave(clientId) {
    this._releaseDealerSpots(clientId);

    const current = this.seatOf(clientId);
    if (!current || current.seat.reservedUntil) return null;

    const { table, seat } = current;
    const forfeited = seat.inHand;

    seat.inHand = false;
    seat.reservedUntil = new Date(this.now() + SEAT_HOLD_MS);

    const timer = setTimeout(() => this.releaseSeat(table.id, clientId), SEAT_HOLD_MS);
    timer.unref?.();
    this.holdTimers.set(`${table.id}:${clientId}`, timer);

    this._changed(table);

    const reservation = this._reservation(table, seat, forfeited);
    this.emit('seatReserved', { clientId, ...reservation });
    return reservation;
  }

  releaseSeat(tableId, clientId) {
    this._clearHold(tableId, clientId);

    const table = this.tables.get(tableId);
    if (!table) return;

    const before = table.seats.length;
    table.seats = table.seats.filter(s => s.clientId !== clientId);
    if (table.seats.length === before) return;

    this._changed(table);
    this.emit('seatReleased', { clientId, tableId });
  }

  // Players report when a hand starts and ends, which drives the in_game status
  setInHand(clientId, inHand) {
    const current = this.seatOf(clientId);
    if (!current || current.seat.reservedUntil || current.seat.inHand === inHand) return null;

    current.seat.inHand = inHand;
    this._changed(current.table);
    return { tableId: current.table.id, inHand };
  }

  sweepIdle() {
    const cutoff = this.now() - IDLE_TABLE_MS;

    for (const table of this.tables.values()) {
      if (table.isSystem || !table.emptySince || table.emptySince.getTime() > cutoff) continue;

      this.tables.delete(table.id);
      Promise.resolve(this.persist.remove?.(table.id))
        .catch(error => console.error('Table remove failed:', error.message));
      this.emit('removed', table.id);
    }
  }

  stop() {
    for (const timer of this.holdTimers.values()) clearTimeout(timer);
    this.holdTimers.clear();
  }

  _newTable(fields) {
    let inviteCode = newInviteCode();
    while ([...this.tables.values()].some(t => t.inviteCode === inviteCode)) {
      inviteCode = newInviteCode();
    }

    return {
      id: newId(),
      visibility: 'public',
      passwordHash: null,
      mode: 'people',
      solo: false,
      maxSeats: MAX_SEATS,
      seats: [],
      dealer: null,
      minBet: 10,
      maxBet: 500,
      isSystem: false,
      inviteCode,
      createdAt: new Date(this.now()),
      emptySince: null,
      ...fields
    };
  }

  _takeSeat(table, client) {
    let index = 0;
    while (table.seats.some(s => s.index === index)) index++;

    const seat = { index, clientId: client.clientId, name: client.name, inHand: false, reservedUntil: null };
    table.seats.push(seat);
    table.seats.sort((a, b) => a.index - b.index);
    return seat;
  }

  _checkNameFree(name) {
    const taken = [...this.tables.values()].some(t => t.name.toLowerCase() === name.toLowerCase());
    if (taken) {
      throw new TableError('duplicate_name', 'A table with that name already exists.');
    }
  }

  _checkCanSwitch(clientId) {
    const current = this.seatOf(clientId);
    if (current && current.seat.inHand) {
      throw new TableError('in_hand', 'Finish or leave your current hand before switching tables.');
    }
  }

  _releaseEverywhere(clientId) {
    const current = this.seatOf(clientId);
    if (current) this.releaseSeat(current.table.id, clientId);
    this._releaseDealerSpots(clientId);
  }

  _releaseDealerSpots(clientId) {
    for (const table of this.tables.values()) {
      if (table.dealer && table.dealer.clientId === clientId) {
        table.dealer = null;
        this._changed(table);
      }
    }
  }

  _clearHold(tableId, clientId) {
    const key = `${tableId}:${clientId}`;
    clearTimeout(this.holdTimers.get(key));
    this.holdTimers.delete(key);
  }

  _reservation(table, seat, forfeited) {
    return {
      tableId: table.id,
      tableName: table.name,
      seat: seat.index,
      expiresAt: seat.reservedUntil.getTime(),
      forfeited
    };
  }

  // Call after every change: refreshes status/idle time, saves, and tells the lobbies
  _changed(table, event = 'updated') {
    table.status = statusOf(table);

    const empty = table.seats.length === 0 && !table.dealer;
    if (!empty) table.emptySince = null;
    else if (!table.emptySince) table.emptySince = new Date(this.now());

    this._save(table);
    this.emit(event, publicView(table));
  }

  _save(table) {
    Promise.resolve(this.persist.save?.(table))
      .catch(error => console.error('Table save failed:', error.message));
  }
}

module.exports = {
  TableStore,
  TableError,
  publicView,
  MAX_SEATS,
  SEAT_HOLD_MS,
  IDLE_TABLE_MS
};
