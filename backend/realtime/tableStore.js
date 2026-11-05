
const crypto = require('crypto');
const EventEmitter = require('events');
const bcrypt = require('bcryptjs');
const round = require('./round');

// 5 player seats + the bot dealer = the six-person table from the README.
// The dealer is always a bot: players can never deal.
const MAX_SEATS = 5;
// How long a seat is held after a player leaves
const SEAT_HOLD_MS = 10 * 1000;
// Empty player-made tables are removed after this long
const IDLE_TABLE_MS = 5 * 60 * 1000;
// Chips a player sits down with when their browser doesn't say
const STARTING_CHIPS = 1000;
const MAX_CHIPS = 10_000_000;

// Shared-round timing (each can be overridden for tests)
const ROUND_TIMING = {
  betMs: 15 * 1000,     // after the first bet, how long the others have to bet
  turnMs: 30 * 1000,    // per action; a player who runs out of time stands
  dealerMs: 900,        // pause so the last card lands before the dealer reveals
  settleMs: 6 * 1000    // results stay up this long before the next hand
};

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
    minBet: table.minBet,
    maxBet: table.maxBet,
    status: statusOf(table),
    inviteCode: table.visibility === 'public' ? table.inviteCode : undefined,
    createdAt: table.createdAt.getTime()
  };
}

class TableStore extends EventEmitter {
  // persist: { save(table), remove(id) }, both may return promises
  constructor({ persist = {}, now = Date.now, timing = {} } = {}) {
    super();
    this.tables = new Map();
    this.holdTimers = new Map();
    this.roundTimers = new Map();
    this.persist = persist;
    this.now = now;
    this.timing = { ...ROUND_TIMING, ...timing };
  }

  // Load saved tables. Nobody is connected after a restart, so seats start empty.
  load(docs) {
    for (const doc of docs) {
      const table = {
        ...doc,
        id: String(doc._id ?? doc.id),
        seats: [],
        createdAt: new Date(doc.createdAt ?? this.now()),
        emptySince: doc.isSystem ? null : new Date(this.now()),
        round: doc.solo ? null : round.newRound()
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

  // The shared round as players at the table see it (null for solo tables)
  roundState(tableId) {
    const table = this.tables.get(tableId);
    return table?.round ? round.roundView(table, this.now()) : null;
  }

  // A client holds at most one seat across all tables
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
      createdBy: client.clientId
    });
    this.tables.set(table.id, table);

    // The creator always sits as a player
    const seat = this._takeSeat(table, client, input.chips).index;

    this._changed(table, 'created');

    return { table: publicView(table), inviteCode: table.inviteCode, seat };
  }

  async join({ tableId, inviteCode, password, chips } = {}, client) {
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
        this._roundChanged(table);
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

    const seat = this._takeSeat(table, client, chips);
    this._changed(table);
    this._roundChanged(table);

    return { table: publicView(table), seat: seat.index, rejoined: false };
  }

  // Leave the current table. The seat is held for SEAT_HOLD_MS.
  // forfeited is true when the player left in the middle of a hand.
  leave(clientId) {
    const current = this.seatOf(clientId);
    if (!current || current.seat.reservedUntil) return null;

    const { table, seat } = current;
    const forfeited = seat.inHand;

    // Shared round: their hands are lost and play moves on without them
    if (table.round) round.forfeit(table, seat);
    seat.inHand = false;
    seat.bet = 0;
    seat.reservedUntil = new Date(this.now() + SEAT_HOLD_MS);

    const timer = setTimeout(() => this.releaseSeat(table.id, clientId), SEAT_HOLD_MS);
    timer.unref?.();
    this.holdTimers.set(`${table.id}:${clientId}`, timer);

    this._changed(table);
    this._roundChanged(table);

    const reservation = this._reservation(table, seat, forfeited);
    this.emit('seatReserved', { clientId, ...reservation });
    return reservation;
  }

  releaseSeat(tableId, clientId) {
    this._clearHold(tableId, clientId);

    const table = this.tables.get(tableId);
    if (!table) return;

    const leaving = table.seats.find(s => s.clientId === clientId);
    if (!leaving) return;

    if (table.round) round.forfeit(table, leaving);
    table.seats = table.seats.filter(s => s !== leaving);

    this._changed(table);
    this._roundChanged(table);
    this.emit('seatReleased', { clientId, tableId });
  }

  // Players report when a hand starts and ends, which drives the in_game status
  // On multiplayer tables the server's round decides this, so reports are ignored mid-round.
  setInHand(clientId, inHand) {
    const current = this.seatOf(clientId);
    if (!current || current.seat.reservedUntil || current.seat.inHand === inHand) return null;
    if (current.table.round && current.table.round.phase !== 'betting') return null;

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
    for (const timer of this.roundTimers.values()) clearTimeout(timer);
    this.roundTimers.clear();
  }

  // Shared round: place or change a bet while the table is betting
  bet(clientId, amount) {
    const { table, seat } = this._roundSeat(clientId);
    round.placeBet(table, seat, amount);
    this._roundChanged(table);
    return { bet: seat.bet };
  }

  // Shared round: hit, stand, double or split on your turn
  action(clientId, type) {
    const { table, seat } = this._roundSeat(clientId);
    round.act(table, seat, type);
    this._roundChanged(table);
    return {};
  }

  _roundSeat(clientId) {
    const current = this.seatOf(clientId);
    if (!current || current.seat.reservedUntil) {
      throw new TableError('not_seated', 'Join a table first.');
    }
    if (!current.table.round) {
      throw new TableError('solo_table', 'This table plays solo hands.');
    }
    return current;
  }

  // Runs the round forward (dealing, timers, dealer, next hand) after any change,
  // then sends the new state to everyone at the table.
  _roundChanged(table) {
    const r = table.round;
    if (!r || !this.tables.has(table.id)) return;

    if (table.seats.length === 0) {
      this._clearRoundTimer(table);
      round.resetRound(table);
    } else if (r.phase === 'betting' && round.everyoneHasBet(table)) {
      round.deal(table);
    }

    const current = table.round;
    let key = null;
    let ms = 0;
    let onTimeout = null;

    if (current.phase === 'betting' && round.anyBets(table)) {
      key = 'bet';
      ms = this.timing.betMs;
      onTimeout = () => {
        if (!round.deal(table)) current.timerKey = null;
      };
    } else if (current.phase === 'playing') {
      const seat = table.seats.find(s => s.index === current.turn.seat);
      const cards = seat?.hands[current.turn.hand]?.cards.length ?? 0;
      key = `turn:${current.turn.seat}:${current.turn.hand}:${cards}:${seat?.hands.length}`;
      ms = this.timing.turnMs;
      onTimeout = () => round.act(table, seat, 'stand');
    } else if (current.phase === 'dealer') {
      key = 'dealer';
      ms = this.timing.dealerMs;
      onTimeout = () => round.playDealerAndSettle(table);
    } else if (current.phase === 'settled') {
      key = 'settled';
      ms = this.timing.settleMs;
      onTimeout = () => round.resetRound(table);
    }

    if (key === null) {
      this._clearRoundTimer(table);
      current.timerKey = null;
      current.deadline = null;
    } else if (key !== current.timerKey) {
      current.timerKey = key;
      current.deadline = this.now() + ms;
      this._clearRoundTimer(table);
      const timer = setTimeout(() => {
        this.roundTimers.delete(table.id);
        if (table.round !== current || current.timerKey !== key) return;
        try {
          onTimeout();
        } catch (error) {
          console.error('Round step failed:', error);
          round.resetRound(table);
        }
        this._roundChanged(table);
      }, ms);
      timer.unref?.();
      this.roundTimers.set(table.id, timer);
    }

    // Lobby status (In game / Waiting) only changes when hands start or end
    if (statusOf(table) !== table.status) this._changed(table);
    this.emit('round', table.id, round.roundView(table, this.now()));
  }

  _clearRoundTimer(table) {
    clearTimeout(this.roundTimers.get(table.id));
    this.roundTimers.delete(table.id);
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
      minBet: 10,
      maxBet: 500,
      isSystem: false,
      inviteCode,
      createdAt: new Date(this.now()),
      emptySince: null,
      ...fields,
      round: fields.solo ? null : round.newRound()
    };
  }

  _takeSeat(table, client, chips) {
    let index = 0;
    while (table.seats.some(s => s.index === index)) index++;

    // The browser carries its balance between tables (accounts don't store chips yet)
    const balance = Number.isFinite(chips) && chips >= 0 ? Math.min(Math.floor(chips), MAX_CHIPS) : STARTING_CHIPS;
    const seat = {
      index,
      clientId: client.clientId,
      name: client.name,
      inHand: false,
      reservedUntil: null,
      chips: balance,
      bet: 0,
      hands: []
    };
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

    const empty = table.seats.length === 0;
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
  IDLE_TABLE_MS,
  ROUND_TIMING
};
