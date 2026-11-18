const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const GameHistory = require('../models/GameHistory');
const Player = require('../models/Player');

const ROLES = ['player', 'admin'];
const ADMIN_CHIP_GRANT = 1000;
const MAX_CHIPS = 10_000_000;

function publicPlayer(player) {
  return {
    id: player._id,
    username: player.username,
    email: player.email,
    role: player.role || 'player',
    chips: player.chips ?? 1000,
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
      .select('username email role chips createdAt')
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

async function grantPlayerChips(req, res) {
  const { playerId } = req.params;
  const rawAmount = req.body?.amount;
  const amount = rawAmount === undefined ? ADMIN_CHIP_GRANT : Number(rawAmount);

  if (!mongoose.isValidObjectId(playerId)) {
    return res.status(400).json({ message: 'Invalid player ID.' });
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
    return res.status(400).json({ message: 'Chip grant must be a positive whole number.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: 'Player not found.' });

    player.chips = Math.min(MAX_CHIPS, (player.chips ?? 1000) + amount);
    await player.save();

    const io = req.app?.locals?.io;
    const tableStore = req.app?.locals?.tableStore;
    const onlineClients = new Set();
    for (const socket of io?.sockets?.sockets?.values() || []) {
      if (String(socket.data.client?.playerId) === playerId && socket.data.client?.clientId) {
        onlineClients.add(socket.data.client.clientId);
      }
    }
    for (const clientId of onlineClients) {
      tableStore?.addChips?.(clientId, amount);
    }
    io?.to?.(`player:${playerId}`)?.emit?.('chips:granted', {
      amount,
      chips: player.chips
    });

    return res.json(publicPlayer(player));
  } catch (error) {
    console.error('Admin chip grant error:', error.message);
    return res.status(500).json({ message: 'Unable to grant chips.' });
  }
}

async function createPlayer(req, res) {
  const { username, email, password, role = 'player', chips = 1000 } = req.body || {};

  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'Username, email, and password are required.' });
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();
  const startingChips = Number(chips);

  if (!cleanUsername || !cleanEmail) {
    return res.status(400).json({ message: 'Username, email, and password are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ message: 'Choose Player or Admin.' });
  }
  if (!Number.isInteger(startingChips) || startingChips < 0 || startingChips > MAX_CHIPS) {
    return res.status(400).json({ message: 'Starting chips must be a non-negative whole number.' });
  }

  try {
    const existing = await Player.findOne({
      $or: [
        { username: cleanUsername },
        { email: cleanEmail }
      ]
    });
    if (existing) {
      return res.status(409).json({ message: 'Username or email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const player = await Player.create({
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      role,
      chips: startingChips
    });

    return res.status(201).json(publicPlayer(player));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Username or email is already registered.' });
    }
    console.error('Admin create player error:', error.message);
    return res.status(500).json({ message: 'Unable to create user account.' });
  }
}

async function deletePlayer(req, res) {
  const { playerId } = req.params;

  if (!mongoose.isValidObjectId(playerId)) {
    return res.status(400).json({ message: 'Invalid player ID.' });
  }
  if (String(req.admin._id) === playerId) {
    return res.status(400).json({ message: 'You cannot delete your own admin account.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: 'Player not found.' });

    if (player.role === 'admin') {
      const adminCount = await Player.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'The last admin account cannot be deleted.' });
      }
    }

    disconnectPlayerSockets(req.app?.locals?.io, playerId);
    if (typeof Player.updateMany === 'function') {
      await Player.updateMany(
        {},
        {
          $pull: {
            friends: player._id,
            sentFriendRequests: player._id,
            receivedFriendRequests: player._id
          }
        }
      );
    }
    await Player.findByIdAndDelete(playerId);

    return res.json({
      message: 'Player account deleted.',
      id: String(player._id),
      username: player.username
    });
  } catch (error) {
    console.error('Admin delete player error:', error.message);
    return res.status(500).json({ message: 'Unable to delete user account.' });
  }
}

module.exports = {
  getOverview,
  listPlayers,
  createPlayer,
  updatePlayerRole,
  grantPlayerChips,
  deletePlayer,
  closeTable
};
