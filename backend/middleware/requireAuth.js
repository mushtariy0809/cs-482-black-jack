const jwt = require('jsonwebtoken');
const Player = require('../models/Player');

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Sign-in is required.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired login token.' });
  }

  try {
    const player = await Player.findById(decoded.playerId);
    if (!player) {
      return res.status(401).json({ message: 'Invalid or expired login token.' });
    }

    req.player = player;
    return next();
  } catch (error) {
    console.error('Player authentication error:', error.message);
    return res.status(500).json({ message: 'Unable to verify your account.' });
  }
}

module.exports = requireAuth;
