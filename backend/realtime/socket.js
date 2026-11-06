
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

function attachTableSockets(io, store) {
  // clientId -> number of open sockets (a player can have several tabs open)
  const openSockets = new Map();
  // clientId -> table whose round updates their tabs receive
  const tableRooms = new Map();

  io.use((socket, next) => {
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
  });

  io.on('connection', socket => {
    const client = socket.data.client;

    socket.join(`client:${client.clientId}`);
    openSockets.set(client.clientId, (openSockets.get(client.clientId) ?? 0) + 1);

    // A returning player may still have a seat being held for them
    const held = store.reservationFor(client.clientId);
    if (held) socket.emit('seat:reserved', held);

    function handle(event, action) {
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

    handle('lobby:subscribe', () => {
      socket.join('lobby');
      const tables = store.list();
      socket.emit('tables:snapshot', tables);
      return { tables };
    });

    handle('lobby:unsubscribe', () => {
      socket.leave('lobby');
      return {};
    });

    // Every tab of this player follows the table they sit at
    function enterTableRoom(tableId) {
      const previous = tableRooms.get(client.clientId);
      if (previous && previous !== tableId) io.in(`client:${client.clientId}`).socketsLeave(`table:${previous}`);
      tableRooms.set(client.clientId, tableId);
      io.in(`client:${client.clientId}`).socketsJoin(`table:${tableId}`);

      const state = store.roundState(tableId);
      if (state) io.to(`client:${client.clientId}`).emit('table:state', state);
    }

    handle('table:create', async input => {
      const result = await store.create(input, client);
      enterTableRoom(result.table.id);
      return result;
    });
    handle('table:join', async input => {
      const result = await store.join(input, client);
      enterTableRoom(result.table.id);
      return result;
    });

    handle('table:chat:send', ({ message }) => {

      // Only registered players can use table chat, not guests
      if (!client.playerId) {
        const error = new Error('You must be logged in to use table chat.');
        error.code = 'authentication_required';
        throw error;
      }

      // The player must be seated at a table
      const current = store.seatOf(client.clientId);

      if (!current) {
        const error = new Error('You must be seated at a table to chat.');
        error.code = 'not_seated';
        throw error;
      }

      if (typeof message !== 'string' || !message.trim()) {
        const error = new Error('Please enter a message.');
        error.code = 'invalid_message';
        throw error;
      }

      const chatMessage = {
        tableId: current.table.id,
        playerId: client.playerId,
        senderName: client.name,
        text: message.trim().slice(0, 300),
        sentAt: Date.now()
      };

      io.to(`table:${current.table.id}`).emit(
        'table:chat:message',
        chatMessage
      );

      return { message: chatMessage };
    });

    handle('table:private:send', async ({ recipientSeat, message }) => {
      
      // Both players must be registered
      if (!client.playerId) {
        const error = new Error('You must be logged in to use private chat.');
        error.code = 'authentication_required';
        throw error;
      }

      // Validate message
      if (typeof message !== 'string' || !message.trim()) {
        const error = new Error('Please enter a message.');
        error.code = 'invalid_message';
        throw error;
      }

      // Find the sender's current table
      const current = store.seatOf(client.clientId);

      if (!current || current.seat.reservedUntil) {
        const error = new Error('You must be seated at a table.');
        error.code = 'not_seated';
        throw error;
      }

      // Find the recipient at the same table
      if (!Number.isInteger(recipientSeat)) {
        const error = new Error('Invalid recipient.');
        error.code = 'invalid_recipient';
        throw error;
      }

      const recipient = current.table.seats.find(
        seat =>
          seat.index === recipientSeat &&
          seat.clientId !== client.clientId &&
          !seat.reservedUntil
      );

      if (!recipient) {
        const error = new Error('That player is no longer at your table.');
        error.code = 'recipient_not_seated';
        throw error;
      }

      // Verify the recipient is logged in
      const recipientSockets = await io
        .in(`client:${recipient.clientId}`)
        .fetchSockets();

      const registeredRecipient = recipientSockets.some(
        recipientSocket => Boolean(recipientSocket.data.client.playerId)
      );

      if (!registeredRecipient) {
        const error = new Error('That player must be logged in to receive private messages.');
        error.code = 'recipient_not_authenticated';
        throw error;
      }

      const privateMessage = {
        tableId: current.table.id,
        senderPlayerId: client.playerId,
        recipientPlayerId: recipientSockets.find(
          recipientSocket => recipientSocket.data.client.playerId
        ).data.client.playerId,
        senderName: client.name,
        recipientName: recipient.name,
        text: message.trim().slice(0, 300),
        sentAt: Date.now(),
        senderSeat: current.seat.index,
        recipientSeat: recipient.index,
      };

      // Deliver only to the sender and recipient
      io.to(`client:${client.clientId}`).emit(
        'table:private:message',
        privateMessage
      );

      io.to(`client:${recipient.clientId}`).emit(
        'table:private:message',
        privateMessage
      );

      return { message: privateMessage };
    });

    handle('round:bet', ({ amount }) => store.bet(client.clientId, amount));
    handle('round:action', ({ type }) => store.action(client.clientId, type));
    handle('table:leave', () => ({ reservation: store.leave(client.clientId) }));
    handle('seat:hand', ({ inHand }) => store.setInHand(client.clientId, Boolean(inHand)) ?? {});

    socket.on('disconnect', () => {
      const remaining = (openSockets.get(client.clientId) ?? 1) - 1;

      if (remaining > 0) {
        openSockets.set(client.clientId, remaining);
        return;
      }

      // Last tab closed: treat it like pressing Leave
      openSockets.delete(client.clientId);
      store.leave(client.clientId);
    });
  });

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

module.exports = { attachTableSockets };
