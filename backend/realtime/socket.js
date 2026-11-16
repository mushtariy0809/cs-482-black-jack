
// Socket events
//
// client -> server (all take an optional ack callback that gets { ok, ...result } or { ok: false, code, message })
//   lobby:subscribe              start receiving table events, replies with tables:snapshot
//   lobby:unsubscribe
//   table:create  { name, visibility, password?, maxSeats, chips? }   creator is seated as a player.
//                 password is an optional 4–6 digit PIN for private tables; maxSeats is 2–7.
//   table:join    { tableId } or { inviteCode }, plus password? and chips? (balance to sit down with)
//   table:peek    { inviteCode }  -> { table, needsPin } without joining
//   table:invite-info             -> { tableId, tableName, inviteCode, visibility, hasPin } for your table
//   table:invite  { playerId }    invite a friend (logged-in players only) -> { online }
//   table:mine                   -> { tables }  tables you created (History > My tables)
//   table:delete  { tableId }     delete a table you created; only when nobody is seated
//   table:leave                  seat is held for 10 seconds
//   ad:status                    -> { status: { reward, perDay, watchedToday, remaining, nextAt } }
//   ad:start      { adId? }      -> { viewId, adId, durationMs, status }
//   ad:complete   { viewId }     -> { reward, status, seatChips }  seatChips: new balance at a multiplayer table, else null
//   ad:abandon    { viewId }     closed early, no reward
//   seat:hand     { inHand }     solo tables only: the player's local hand started or ended
//   round:bet     { amount }     multiplayer tables: place or change your bet while betting
//   round:action  { type }       multiplayer tables: 'hit' | 'stand' | 'double' | 'split' on your turn
//
// server -> client
//   tables:snapshot  [table]     the tables this player may see, sent after lobby:subscribe
//   table:created    table       private tables only go to the people let into them
//   table:updated    table
//   table:invite     { tableId, tableName, inviteCode, hasPin, fromName, players, maxSeats }   to the invited friend
//   table:removed    tableId
//   seat:reserved    { tableId, tableName, seat, expiresAt, forfeited }   only to that player
//   seat:released    { tableId }                                          only to that player
//   table:state      round view (see round.js roundView)   to everyone seated at a multiplayer table

const jwt = require('jsonwebtoken');
const { AdStore } = require('./adStore');

// Are these two accounts friends? (looked up in MongoDB; tests pass their own)
async function areFriendsInDb(playerId, friendId) {
  const Player = require('../models/Player');
  try {
    return Boolean(await Player.exists({ _id: playerId, friends: friendId }));
  } catch {
    // Not a valid account id
    return false;
  }
}

function cleanName(name) {
  const trimmed = String(name ?? '').trim().slice(0, 24);
  return trimmed || 'Guest';
}

// An error the client is told about as { ok: false, code, message }
function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireRegistered(client, message) {
  if (!client.playerId) throw codedError('authentication_required', message);
}

function cleanMessage(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw codedError('invalid_message', 'Please enter a message.');
  }
  return message.trim().slice(0, 300);
}

// Socket.IO middleware: every socket needs a clientId; a login token is optional
function authenticateSocket(socket, next) {
  const { clientId, name, token } = socket.handshake.auth ?? {};

  if (typeof clientId !== 'string' || !/^[\w-]{8,64}$/.test(clientId)) {
    return next(new Error('clientId is required.'));
  }

  let playerId = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      playerId = decoded.playerId;
    } catch {
      return next(new Error('Invalid or expired login token.'));
    }
  }

  socket.data.client = { clientId, name: cleanName(name), playerId };
  next();
}

// Registers a client -> server event. The action's return value (or thrown error) is sent to the ack.
function handle(socket, event, action) {
  socket.on(event, async (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const payload = args[0] ?? {};

    try {
      const result = await action(payload);
      ack?.({ ok: true, ...result });
    } catch (error) {
      if (!error.code) console.error(`${event} failed:`, error);
      ack?.({
        ok: false,
        code: error.code ?? 'server_error',
        message: error.code ? error.message : 'Something went wrong. Please try again.'
      });
    }
  });
}

// Every tab of this player follows the table they sit at
function enterTableRoom(ctx, tableId) {
  const { io, store, tableRooms, client } = ctx;
  const tabs = `client:${client.clientId}`;
  const previous = tableRooms.get(client.clientId);

  if (previous && previous !== tableId) io.in(tabs).socketsLeave(`table:${previous}`);
  tableRooms.set(client.clientId, tableId);
  io.in(tabs).socketsJoin(`table:${tableId}`);

  const state = store.roundState(tableId);
  if (state) io.to(tabs).emit('table:state', state);
}

function subscribeToLobby({ socket, store, client }) {
  socket.join('lobby');
  const tables = store.list(client);
  socket.emit('tables:snapshot', tables);
  return { tables };
}

// Invite a friend to the table you're at: it shows up in their lobby, and if
// they're online they get a popup with a Join button.
async function inviteFriend(ctx, { playerId }) {
  const { io, store, client, areFriends } = ctx;
  requireRegistered(client, 'Log in to invite friends.');

  if (typeof playerId !== 'string' || !playerId || playerId === client.playerId) {
    throw codedError('invalid_friend', 'Pick a friend to invite.');
  }
  if (!(await areFriends(client.playerId, playerId))) {
    throw codedError('not_friends', 'You can only invite people on your friends list.');
  }

  const info = store.inviteFriend(client.clientId, playerId);
  const table = store.get(info.tableId);
  io.to(`player:${playerId}`).emit('table:invite', {
    tableId: info.tableId,
    tableName: info.tableName,
    inviteCode: info.inviteCode,
    hasPin: info.hasPin,
    players: table.players,
    maxSeats: table.maxSeats,
    fromName: client.name,
    sentAt: Date.now()
  });

  const online = (await io.in(`player:${playerId}`).fetchSockets()).length > 0;
  return { online };
}

// The ad finished: pay the reward. At a multiplayer table the seat's chips go up on the server.
function completeAd({ ads, store, client }, payload) {
  const result = ads.complete(client, payload);
  const seatChips = store.addChips(client.clientId, result.reward);
  return { ...result, seatChips };
}

// Message to everyone at the sender's table (registered players only)
function sendTableChat(ctx, { message }) {
  const { io, store, client } = ctx;
  requireRegistered(client, 'You must be logged in to use table chat.');

  const current = store.seatOf(client.clientId);
  if (!current) throw codedError('not_seated', 'You must be seated at a table to chat.');

  const chatMessage = {
    tableId: current.table.id,
    playerId: client.playerId,
    senderName: client.name,
    text: cleanMessage(message),
    sentAt: Date.now()
  };

  io.to(`table:${current.table.id}`).emit('table:chat:message', chatMessage);
  return { message: chatMessage };
}

// The seated, logged-in player at recipientSeat (not the sender), and their playerId
async function findPrivateRecipient(ctx, current, recipientSeat) {
  const { io, client } = ctx;

  if (!Number.isInteger(recipientSeat)) throw codedError('invalid_recipient', 'Invalid recipient.');

  const recipient = current.table.seats.find(
    seat => seat.index === recipientSeat && seat.clientId !== client.clientId && !seat.reservedUntil
  );
  if (!recipient) throw codedError('recipient_not_seated', 'That player is no longer at your table.');

  const recipientSockets = await io.in(`client:${recipient.clientId}`).fetchSockets();
  const loggedIn = recipientSockets.find(recipientSocket => recipientSocket.data.client.playerId);
  if (!loggedIn) {
    throw codedError('recipient_not_authenticated', 'That player must be logged in to receive private messages.');
  }

  return { recipient, recipientPlayerId: loggedIn.data.client.playerId };
}

// Message between two logged-in players at the same table; delivered only to the two of them
async function sendPrivateMessage(ctx, { recipientSeat, message }) {
  const { io, store, client } = ctx;
  requireRegistered(client, 'You must be logged in to use private chat.');
  const text = cleanMessage(message);

  const current = store.seatOf(client.clientId);
  if (!current || current.seat.reservedUntil) throw codedError('not_seated', 'You must be seated at a table.');

  const { recipient, recipientPlayerId } = await findPrivateRecipient(ctx, current, recipientSeat);

  const privateMessage = {
    tableId: current.table.id,
    senderPlayerId: client.playerId,
    recipientPlayerId,
    senderName: client.name,
    recipientName: recipient.name,
    text,
    sentAt: Date.now(),
    senderSeat: current.seat.index,
    recipientSeat: recipient.index,
  };

  io.to(`client:${client.clientId}`).emit('table:private:message', privateMessage);
  io.to(`client:${recipient.clientId}`).emit('table:private:message', privateMessage);
  return { message: privateMessage };
}

// Last tab closed: treat it like pressing Leave
function handleDisconnect({ store, openSockets, client }) {
  const remaining = (openSockets.get(client.clientId) ?? 1) - 1;

  if (remaining > 0) {
    openSockets.set(client.clientId, remaining);
    return;
  }

  openSockets.delete(client.clientId);
  store.leave(client.clientId);
}

function registerEvents(ctx) {
  const { socket, store, client } = ctx;
  const id = client.clientId;

  handle(socket, 'lobby:subscribe', () => subscribeToLobby(ctx));
  handle(socket, 'lobby:unsubscribe', () => {
    socket.leave('lobby');
    return {};
  });
  handle(socket, 'table:create', async input => {
    const result = await store.create(input, client);
    enterTableRoom(ctx, result.table.id);
    return result;
  });
  handle(socket, 'table:join', async input => {
    const result = await store.join(input, client);
    enterTableRoom(ctx, result.table.id);
    return result;
  });
  handle(socket, 'table:peek', payload => store.peek(payload, client));
  handle(socket, 'table:invite-info', () => store.inviteInfo(id));
  handle(socket, 'table:invite', payload => inviteFriend(ctx, payload));
  handle(socket, 'table:mine', () => ({ tables: store.mine(client) }));
  handle(socket, 'table:delete', ({ tableId }) => store.remove(client, String(tableId ?? '')));
  handle(socket, 'ad:status', () => ({ status: ctx.ads.status(client) }));
  handle(socket, 'ad:start', payload => ({ ...ctx.ads.start(client, payload), status: ctx.ads.status(client) }));
  handle(socket, 'ad:complete', payload => completeAd(ctx, payload));
  handle(socket, 'ad:abandon', payload => ctx.ads.abandon(client, payload));
  handle(socket, 'table:chat:send', payload => sendTableChat(ctx, payload));
  handle(socket, 'table:private:send', payload => sendPrivateMessage(ctx, payload));
  handle(socket, 'round:bet', ({ amount }) => store.bet(id, amount));
  handle(socket, 'round:action', ({ type }) => store.action(id, type));
  handle(socket, 'table:leave', () => ({ reservation: store.leave(id) }));
  handle(socket, 'seat:hand', ({ inHand }) => store.setInHand(id, Boolean(inHand)) ?? {});

  socket.on('disconnect', () => handleDisconnect(ctx));
}

function onConnection(shared, socket) {
  const client = socket.data.client;
  const ctx = { ...shared, socket, client };

  socket.join(`client:${client.clientId}`);
  // Friend invites are addressed to the account, so every device it's logged in on gets them
  if (client.playerId) socket.join(`player:${client.playerId}`);
  shared.openSockets.set(client.clientId, (shared.openSockets.get(client.clientId) ?? 0) + 1);

  // A returning player may still have a seat being held for them
  const held = shared.store.reservationFor(client.clientId);
  if (held) socket.emit('seat:reserved', held);

  registerEvents(ctx);
}

// Server -> client events that come from the table store
// Public tables go to every lobby; private ones only to the people let in (audience from the store)
function toAudience(io, audience) {
  if (!audience) return io.to('lobby');
  const rooms = [
    ...audience.clientIds.map(clientId => `client:${clientId}`),
    ...audience.playerIds.map(playerId => `player:${playerId}`)
  ];
  return rooms.length ? io.to(rooms) : null;
}

function forwardStoreEvents({ io, store, tableRooms }) {
  store.on('created', (table, audience) => toAudience(io, audience)?.emit('table:created', table));
  store.on('updated', (table, audience) => toAudience(io, audience)?.emit('table:updated', table));
  store.on('removed', tableId => io.to('lobby').emit('table:removed', tableId));

  store.on('seatReserved', ({ clientId, ...reservation }) => {
    io.to(`client:${clientId}`).emit('seat:reserved', reservation);
  });
  store.on('seatReleased', ({ clientId, tableId }) => {
    io.to(`client:${clientId}`).emit('seat:released', { tableId });
    if (tableRooms.get(clientId) === tableId) {
      tableRooms.delete(clientId);
      io.in(`client:${clientId}`).socketsLeave(`table:${tableId}`);
    }
  });
  store.on('round', (tableId, state) => io.to(`table:${tableId}`).emit('table:state', state));
}

// options: { ads: AdStore, areFriends(playerId, friendId) } (tests pass their own)
function attachTableSockets(io, store, { ads = new AdStore(), areFriends = areFriendsInDb } = {}) {
  const shared = {
    io,
    store,
    ads,
    areFriends,
    // clientId -> number of open sockets (a player can have several tabs open)
    openSockets: new Map(),
    // clientId -> table whose round updates their tabs receive
    tableRooms: new Map()
  };

  io.use(authenticateSocket);
  io.on('connection', socket => onConnection(shared, socket));
  forwardStoreEvents(shared);
}

module.exports = { attachTableSockets };
