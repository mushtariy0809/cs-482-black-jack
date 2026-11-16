
const Table = require('../models/Table');
const AdView = require('../models/AdView');
const { TableStore } = require('./tableStore');
const { AdStore, startOfDay } = require('./adStore');
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
        allowedClients: table.allowedClients,
        invitedPlayers: table.invitedPlayers,
        minBet: table.minBet,
        maxBet: table.maxBet,
        status: table.status,
        createdBy: table.createdBy,
        createdByPlayer: table.createdByPlayer,
        isSystem: table.isSystem,
        emptySince: table.emptySince
      },
      { upsert: true }
    )),
    remove: id => queue(id, () => Table.deleteOne({ _id: id }))
  };
}

// Every video ad view is saved (for the daily limit after a restart, and for A4 ad revenue)
function adViewPersistence() {
  return {
    save: view => AdView.findByIdAndUpdate(
      view.viewId,
      {
        viewerKey: view.viewerKey,
        playerId: view.playerId,
        clientId: view.clientId,
        adId: view.adId,
        status: view.status,
        reward: view.reward,
        startedAt: view.startedAt,
        completedAt: view.completedAt
      },
      { upsert: true }
    )
  };
}

// Call after MongoDB is connected
async function startRealtime(io) {
  const store = new TableStore({ persist: mongoPersistence() });
  const ads = new AdStore({ persist: adViewPersistence() });

  store.load(await Table.find().lean());
  store.ensureSystemTables();
  ads.load(await AdView.find({ status: 'completed', completedAt: { $gte: new Date(startOfDay(Date.now())) } }).lean());
  attachTableSockets(io, store, { ads });

  setInterval(() => store.sweepIdle(), SWEEP_EVERY_MS).unref();

  return store;
}

module.exports = { startRealtime };
