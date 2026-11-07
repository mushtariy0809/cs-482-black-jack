
// Socket events
//
// client -> server (all take an optional ack callback that gets { ok, ...result } or { ok: false, code, message })
//   lobby:subscribe              start receiving table events, replies with tables:snapshot
//   lobby:unsubscribe
//   table:create  { name, visibility, password?, mode, chips? }   creator is seated as a player
//   table:join    { tableId } or { inviteCode }, plus password? and chips? (balance to sit down with)
//   table:leave                  seat is held for 10 seconds
//   seat:hand     { inHand }     solo tables only: the player's local hand started or ended
//   round:bet     { amount }     multiplayer tables: place or change your bet while betting
//   round:action  { type }       multiplayer tables: 'hit' | 'stand' | 'double' | 'split' on your turn
//
// server -> client
//   tables:snapshot  [table]     full list, sent after lobby:subscribe
//   table:created    table
//   table:updated    table
//   table:removed    tableId
//   seat:reserved    { tableId, tableName, seat, expiresAt, forfeited }   only to that player
//   seat:released    { tableId }                                          only to that player
//   table:state      round view (see round.js roundView)   to everyone seated at a multiplayer table

const jwt = require('jsonwebtoken');

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

function subscribeToLobby({ socket, store }) {
  socket.join('lobby');
  const tables = store.list();
  socket.emit('tables:snapshot', tables);
  return { tables };
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
  shared.openSockets.set(client.clientId, (shared.openSockets.get(client.clientId) ?? 0) + 1);

  // A returning player may still have a seat being held for them
  const held = shared.store.reservationFor(client.clientId);
  if (held) socket.emit('seat:reserved', held);

  registerEvents(ctx);
}

// Server -> client events that come from the table store
function forwardStoreEvents({ io, store, tableRooms }) {
  store.on('created', table => io.to('lobby').emit('table:created', table));
  store.on('updated', table => io.to('lobby').emit('table:updated', table));
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

function attachTableSockets(io, store) {
  const shared = {
    io,
    store,
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
