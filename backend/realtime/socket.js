
// Socket events
//
// client -> server (all take an optional ack callback that gets { ok, ...result } or { ok: false, code, message })
//   lobby:subscribe              start receiving table events, replies with tables:snapshot
//   lobby:unsubscribe
//   table:create  { name, visibility, password?, mode }   creator is seated as a player
//   table:join    { tableId } or { inviteCode }, plus password? for private tables
//   table:leave                  seat is held for 10 seconds
//   seat:hand     { inHand }     the player's hand started or ended
//
// server -> client
//   tables:snapshot  [table]     full list, sent after lobby:subscribe
//   table:created    table
//   table:updated    table
//   table:removed    tableId
//   seat:reserved    { tableId, tableName, seat, expiresAt, forfeited }   only to that player
//   seat:released    { tableId }                                          only to that player

function cleanName(name) {
  const trimmed = String(name ?? '').trim().slice(0, 24);
  return trimmed || 'Guest';
}

function attachTableSockets(io, store) {
  // clientId -> number of open sockets (a player can have several tabs open)
  const openSockets = new Map();

  io.use((socket, next) => {
    const { clientId, name } = socket.handshake.auth ?? {};

    if (typeof clientId !== 'string' || !/^[\w-]{8,64}$/.test(clientId)) {
      return next(new Error('clientId is required.'));
    }

    socket.data.client = { clientId, name: cleanName(name) };
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

    handle('seat:update', payload => store.updateSeatCards(client.clientId, payload));

    handle('table:create', input => store.create(input, client));
    handle('table:join', input => store.join(input, client));
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
  });
}

module.exports = { attachTableSockets };
