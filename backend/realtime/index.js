
const Table = require('../models/Table');
const { TableStore } = require('./tableStore');
const { attachTableSockets } = require('./socket');

const SWEEP_EVERY_MS = 30 * 1000;

// Saves tables to MongoDB. Saves for the same table run one after another
// so an older save can never overwrite a newer one.
function mongoPersistence() {
  const pending = new Map();

  function queue(id, write) {
    const next = (pending.get(id) ?? Promise.resolve()).then(write, write);
    pending.set(id, next);
    next.finally(() => {
      if (pending.get(id) === next) pending.delete(id);
    });
    return next;
  }

  return {
    save: table => queue(table.id, () => Table.findByIdAndUpdate(
      table.id,
      {
        name: table.name,
        visibility: table.visibility,
        passwordHash: table.passwordHash,
        inviteCode: table.inviteCode,
        mode: table.mode,
        solo: table.solo,
        maxSeats: table.maxSeats,
        seats: table.seats,
        dealer: table.dealer,
        minBet: table.minBet,
        maxBet: table.maxBet,
        status: table.status,
        createdBy: table.createdBy,
        isSystem: table.isSystem,
        emptySince: table.emptySince
      },
      { upsert: true }
    )),
    remove: id => queue(id, () => Table.deleteOne({ _id: id }))
  };
}

// Call after MongoDB is connected
async function startRealtime(io) {
  const store = new TableStore({ persist: mongoPersistence() });

  store.load(await Table.find().lean());
  store.ensureSystemTables();
  attachTableSockets(io, store);

  setInterval(() => store.sweepIdle(), SWEEP_EVERY_MS).unref();

  return store;
}

module.exports = { startRealtime };
