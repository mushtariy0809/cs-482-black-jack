
const crypto = require('crypto');
const EventEmitter = require('events');
const bcrypt = require('bcryptjs');
const round = require('./round');

// The dealer is always a bot: players can never deal, and bots never take a player seat.
// Table creators pick 2–7 player seats; the system tables keep 5 (+ the dealer).
const MIN_SEATS = 2;
const MAX_SEATS = 7;
const DEFAULT_SEATS = 5;
// Private tables can have an optional PIN
const PIN_PATTERN = /^\d{4,6}$/;
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

// Private tables are hidden from the lobby. Only people who were let in (the creator,
// invited friends, anyone who joined with the code) and the players seated there see them.
// viewer: { clientId, playerId? }, or { admin: true } for the admin dashboard.
// Socket viewers are built on the server from the login token, so players can't claim admin.
function canSee(table, viewer) {
  if (table.visibility === 'public') return true;
  if (!viewer) return false;
  if (viewer.admin === true) return true;
  return isCreator(table, viewer)
    || table.allowedClients.includes(viewer.clientId)
    || Boolean(viewer.playerId && table.invitedPlayers.includes(viewer.playerId))
    || table.seats.some(seat => seat.clientId === viewer.clientId);
}

// The creator: same browser, or the same account on any device
function isCreator(table, viewer) {
  if (!viewer || table.isSystem) return false;
  return table.createdBy === viewer.clientId
    || Boolean(viewer.playerId && table.createdByPlayer === viewer.playerId);
}

// Who gets live updates about a table: null means every lobby
function audienceOf(table) {
  if (table.visibility === 'public') return null;
  return {
    clientIds: [...new Set([...table.allowedClients, ...table.seats.map(seat => seat.clientId)])],
    playerIds: [...new Set([...table.invitedPlayers, ...(table.createdByPlayer ? [table.createdByPlayer] : [])])]
  };
}

// What a lobby is allowed to see. Never includes PINs or client ids,
// and private invite codes are only given to people at the table (see inviteInfo).
function publicView(table) {
  return {
    id: table.id,
    name: table.name,
    visibility: table.visibility,
    hasPin: Boolean(table.passwordHash),
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
        allowedClients: doc.allowedClients ?? [],
        invitedPlayers: doc.invitedPlayers ?? [],
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

  // The tables this viewer may see (no viewer: public tables only; { admin: true }: all of them)
  list(viewer) {
    return [...this.tables.values()].filter(table => canSee(table, viewer)).map(publicView);
  }

  get(tableId) {
    const table = this.tables.get(tableId);
    return table ? publicView(table) : null;
  }

  closeEmptyTable(tableId) {
    const table = this.tables.get(tableId);
    if (!table) {
      throw new TableError('not_found', 'That table no longer exists.');
    }
    if (table.isSystem) {
      throw new TableError('system_table', 'System tables cannot be closed.');
    }
    if (table.seats.length > 0) {
      throw new TableError('table_occupied', 'Only empty tables can be closed.');
    }

    this._clearRoundTimer(table);
    this.tables.delete(tableId);
    Promise.resolve(this.persist.remove?.(tableId))
      .catch(error => console.error('Table remove failed:', error.message));
    this.emit('removed', tableId);
    return { id: tableId };
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

  // input: { name, visibility, password? (private only: an optional 4–6 digit PIN), maxSeats, chips? }
  async create(input = {}, client) {
    const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
    const visibility = input.visibility ?? 'public';
    const pin = visibility === 'private' && input.password ? String(input.password) : '';
    const maxSeats = input.maxSeats ?? DEFAULT_SEATS;

    if (name.length < 3 || name.length > 30) {
      throw new TableError('invalid_name', 'Table name must be 3 to 30 characters.');
    }
    if (!['public', 'private'].includes(visibility)) {
      throw new TableError('invalid_input', 'Choose public or private.');
    }
    if (pin && !PIN_PATTERN.test(pin)) {
      throw new TableError('invalid_pin', 'The PIN must be 4 to 6 digits.');
    }
    if (!Number.isInteger(maxSeats) || maxSeats < MIN_SEATS || maxSeats > MAX_SEATS) {
      throw new TableError('invalid_seats', `Choose ${MIN_SEATS} to ${MAX_SEATS} players.`);
    }

    const passwordHash = pin ? await bcrypt.hash(pin, 10) : null;

    // Checked after the await so two people can't grab the same name at once
    this._checkNameFree(name);
    this._checkCanSwitch(client.clientId);
    this._releaseEverywhere(client.clientId);

    // Bots only ever deal, so every created table is for people
    const table = this._newTable({
      name,
      visibility,
      passwordHash,
      maxSeats,
      createdBy: client.clientId,
      createdByPlayer: client.playerId ?? null,
      allowedClients: [client.clientId]
    });
    this.tables.set(table.id, table);

    // The creator always sits as a player
    const seat = this._takeSeat(table, client, input.chips).index;

    this._changed(table, 'created');

    return { table: publicView(table), inviteCode: table.inviteCode, seat };
  }

  // Join by tableId (from the lobby) or by inviteCode (invite link or "Have a code?").
  // password is the private table's PIN, when it has one.
  async join({ tableId, inviteCode, password, chips } = {}, client) {
    const table = await this._findForJoin({ tableId, inviteCode, password }, client);

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

    // Got in once: a private table stays in your lobby so you can come back
    if (!table.allowedClients.includes(client.clientId)) table.allowedClients.push(client.clientId);

    const seat = this._takeSeat(table, client, chips);
    this._changed(table);
    this._roundChanged(table);

    return { table: publicView(table), seat: seat.index, rejoined: false };
  }

  // Looks up an invite code without joining, so the browser knows the table's name
  // and whether to ask for a PIN first.
  peek({ inviteCode } = {}, client) {
    const table = this._byInviteCode(inviteCode);
    if (!table) throw new TableError('not_found', 'No table has that invite code.');
    return { table: publicView(table), needsPin: this._needsPin(table, client) };
  }

  // Invite link details for the table you're sitting at. Anyone seated may share it.
  inviteInfo(clientId) {
    const { table } = this._invitingSeat(clientId);
    return {
      tableId: table.id,
      tableName: table.name,
      inviteCode: table.inviteCode,
      visibility: table.visibility,
      hasPin: Boolean(table.passwordHash)
    };
  }

  // Lets a friend (by account id) see this private table in their lobby.
  // The socket layer checks that they really are friends and sends the invite.
  inviteFriend(clientId, playerId) {
    const { table } = this._invitingSeat(clientId);
    if (!table.invitedPlayers.includes(playerId)) {
      table.invitedPlayers.push(playerId);
      this._changed(table);
    }
    return this.inviteInfo(clientId);
  }

  // "My tables" in History: the tables this player created that are still open.
  // canDelete is true once nobody (other than the creator's own held seat) is sitting there.
  mine(viewer) {
    return [...this.tables.values()]
      .filter(table => isCreator(table, viewer))
      .map(table => {
        const others = table.seats.filter(seat => seat.clientId !== viewer.clientId);
        const mySeat = table.seats.find(seat => seat.clientId === viewer.clientId);
        const seatedHere = Boolean(mySeat && !mySeat.reservedUntil);
        return {
          ...publicView(table),
          inviteCode: table.inviteCode,
          seatedHere,
          othersSeated: others.length,
          canDelete: others.length === 0 && !seatedHere
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // Deletes a table you created. Only when it's empty: you can't close a table on other players.
  remove(viewer, tableId) {
    const table = this.tables.get(tableId);
    if (!table || !canSee(table, viewer)) {
      throw new TableError('not_found', 'That table is already gone.');
    }
    if (!isCreator(table, viewer)) {
      throw new TableError('not_owner', 'Only the person who created a table can delete it.');
    }

    const mySeat = table.seats.find(seat => seat.clientId === viewer.clientId);
    if (mySeat && !mySeat.reservedUntil) {
      throw new TableError('seated_here', 'Leave the table first, then delete it.');
    }
    const others = table.seats.filter(seat => seat !== mySeat).length;
    if (others > 0) {
      throw new TableError('not_empty', `${others === 1 ? '1 player is' : `${others} players are`} still seated. Tables can only be deleted when empty.`);
    }

    // Your own seat held from leaving a moment ago goes with it
    if (mySeat) this._clearHold(table.id, viewer.clientId);
    this._clearRoundTimer(table);
    this.tables.delete(table.id);
    Promise.resolve(this.persist.remove?.(table.id))
      .catch(error => console.error('Table remove failed:', error.message));
    if (mySeat) this.emit('seatReleased', { clientId: viewer.clientId, tableId: table.id });
    this.emit('removed', table.id);
    return { tableId: table.id };
  }

  // Chips won from a video ad. At a multiplayer table the server holds the balance,
  // so it is added to the seat; returns the new seat balance, or null when the
  // browser keeps the balance itself (lobby, Solo Practice).
  addChips(clientId, amount) {
    const current = this.seatOf(clientId);
    if (!current || current.seat.reservedUntil || !current.table.round) return null;

    current.seat.chips = Math.min(MAX_CHIPS, current.seat.chips + amount);
    this._roundChanged(current.table);
    return current.seat.chips;
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

// Shared round: take or decline insurance when dealer shows an Ace
  insurance(clientId, take) {
    const { table, seat } = this._roundSeat(clientId);
    round.decideInsurance(table, seat, Boolean(take));
    this._roundChanged(table);
    return { insurance: seat.insurance, insuranceBet: seat.insuranceBet };
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
    } else if (r.phase === 'insurance' && round.everyoneDecidedInsurance(table)) {
      round.resolveInsurancePhase(table);
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
    }else if (current.phase === 'insurance') {
      key = 'insurance';
      ms = this.timing.insuranceMs ?? this.timing.betMs;
      onTimeout = () => round.resolveInsurancePhase(table); 
    }else if (current.phase === 'playing') {
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
      maxSeats: DEFAULT_SEATS,
      seats: [],
      // Private tables: who can see the table (client ids) and friends invited to it (account ids)
      allowedClients: [],
      invitedPlayers: [],
      minBet: 10,
      maxBet: 500,
      isSystem: false,
      createdByPlayer: null,
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

  // The table to join, after the visibility and PIN checks
  async _findForJoin({ tableId, inviteCode, password }, client) {
    if (!tableId) {
      const table = this._byInviteCode(inviteCode);
      if (!table) throw new TableError('not_found', 'No table has that invite code.');
      await this._checkPin(table, password, client);
      return table;
    }

    // A hidden table you weren't let into looks the same as one that doesn't exist
    const table = this.tables.get(tableId);
    if (!table || !canSee(table, client)) {
      throw new TableError('not_found', 'That table is no longer available.');
    }
    await this._checkPin(table, password, client);
    return table;
  }

  async _checkPin(table, password, client) {
    if (!this._needsPin(table, client)) return;
    if (!password) throw new TableError('pin_required', 'This table needs a PIN.');
    const ok = await bcrypt.compare(String(password), table.passwordHash);
    if (!ok) throw new TableError('bad_password', 'Wrong PIN. Try again.');
  }

  _byInviteCode(inviteCode) {
    const code = String(inviteCode ?? '').trim().toUpperCase();
    if (!code) return null;
    return [...this.tables.values()].find(t => t.inviteCode === code) ?? null;
  }

  // The creator and anyone already seated (or holding a seat) skip the PIN
  _needsPin(table, client) {
    if (!table.passwordHash || table.createdBy === client.clientId) return false;
    return !table.seats.some(seat => seat.clientId === client.clientId);
  }

  _invitingSeat(clientId) {
    const current = this.seatOf(clientId);
    if (!current || current.seat.reservedUntil) {
      throw new TableError('not_seated', 'Sit at a table first.');
    }
    if (current.table.solo) {
      throw new TableError('solo_table', 'Practice is a solo table. Create a table to play with friends.');
    }
    return current;
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
    this.emit(event, publicView(table), audienceOf(table));
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
  canSee,
  MIN_SEATS,
  MAX_SEATS,
  DEFAULT_SEATS,
  SEAT_HOLD_MS,
  IDLE_TABLE_MS,
  ROUND_TIMING
};
