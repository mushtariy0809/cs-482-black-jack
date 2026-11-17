const mongoose = require('mongoose');
const GameHistory = require('../models/GameHistory');
const Player = require('../models/Player');

const ROLES = ['player', 'admin'];

function publicPlayer(player) {
  return {
    id: player._id,
    username: player.username,
    email: player.email,
    role: player.role || 'player',
    createdAt: player.createdAt
  };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getOverview(req, res) {
  try {
    const now = new Date();
    const since = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 6
    ));

    const [players, rounds, resultCounts, recordedDailyRounds] = await Promise.all([
      Player.countDocuments(),
      GameHistory.countDocuments(),
      GameHistory.aggregate([
        { $group: { _id: '$result', count: { $sum: 1 } } }
      ]),
      GameHistory.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);
    const dailyCounts = new Map(recordedDailyRounds.map(day => [day._id, day.count]));
    const dailyRounds = Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(since);
      day.setUTCDate(since.getUTCDate() + offset);
      const key = day.toISOString().slice(0, 10);
      return { _id: key, count: dailyCounts.get(key) || 0 };
    });

    const tableStore = req.app.locals.tableStore;
    // Admins see every table, private ones included
    const tables = (tableStore?.list({ admin: true }) || []).map(table => ({
      id: table.id,
      name: table.name,
      visibility: table.visibility,
      mode: table.mode,
      isSystem: table.isSystem,
      players: table.players,
      maxSeats: table.maxSeats,
      status: table.status,
      seats: table.seats
    }));
    const results = { win: 0, loss: 0, push: 0 };
    for (const result of resultCounts) {
      if (Object.hasOwn(results, result._id)) results[result._id] = result.count;
    }

    return res.json({
      metrics: {
        players,
        rounds,
        onlineNow: req.app.locals.io?.engine?.clientsCount ?? 0,
        activeTables: tables.filter(table => table.players > 0).length
      },
      results,
      dailyRounds,
      tables
    });
  } catch (error) {
    console.error('Admin overview error:', error.message);
    return res.status(500).json({ message: 'Unable to load the admin overview.' });
  }
}

async function listPlayers(req, res) {
  try {
    const search = typeof req.query.search === 'string'
      ? req.query.search.trim().slice(0, 100)
      : '';
    const query = search
      ? {
          $or: [
            { username: { $regex: escapeRegex(search), $options: 'i' } },
            { email: { $regex: escapeRegex(search), $options: 'i' } }
          ]
        }
      : {};

    const players = await Player.find(query)
      .select('username email role createdAt')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.json(players.map(publicPlayer));
  } catch (error) {
    console.error('Admin player list error:', error.message);
    return res.status(500).json({ message: 'Unable to load players.' });
  }
}

async function updatePlayerRole(req, res) {
  const { playerId } = req.params;
  const { role } = req.body || {};

  if (!mongoose.isValidObjectId(playerId)) {
    return res.status(400).json({ message: 'Invalid player ID.' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ message: 'Choose Player or Admin.' });
  }
  if (String(req.admin._id) === playerId && role !== 'admin') {
    return res.status(400).json({ message: 'You cannot remove your own admin role.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: 'Player not found.' });

    if (player.role === 'admin' && role !== 'admin') {
      const adminCount = await Player.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'The last admin account cannot be demoted.' });
      }
    }

    player.role = role;
    await player.save();
    if (role !== 'admin') {
      disconnectPlayerSockets(req.app.locals.io, playerId);
    }
    return res.json(publicPlayer(player));
  } catch (error) {
    console.error('Admin role update error:', error.message);
    return res.status(500).json({ message: 'Unable to update account role.' });
  }
}

function disconnectPlayerSockets(io, playerId) {
  for (const socket of io?.sockets?.sockets?.values() || []) {
    if (String(socket.data.client?.playerId) === playerId) {
      socket.disconnect(true);
    }
  }
}

async function closeTable(req, res) {
  const { tableId } = req.params;
  const tableStore = req.app.locals.tableStore;

  if (!tableStore) {
    return res.status(503).json({ message: 'Live table operations are unavailable.' });
  }

  try {
    const result = tableStore.closeEmptyTable(tableId);
    return res.json({ message: 'Empty table closed.', id: result.id });
  } catch (error) {
    if (error.code === 'not_found') {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === 'table_occupied' || error.code === 'system_table') {
      return res.status(409).json({ message: error.message });
    }
    console.error('Admin table closure error:', error.message);
    return res.status(500).json({ message: 'Unable to close table.' });
  }
}

module.exports = {
  getOverview,
  listPlayers,
  updatePlayerRole,
  closeTable
};
