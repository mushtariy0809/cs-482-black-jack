
const bcrypt = require('bcryptjs');
const Player = require('../models/Player');
const jwt = require('jsonwebtoken');

const generateToken = (player) => {
  return jwt.sign(
    {
      playerId: player._id.toString()
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Register a new player
const registerPlayer = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'Username, email, and password are required.'
      });
    }

    if (typeof username !== 'string' ||
        typeof email !== 'string' ||
        typeof password !== 'string') {
      return res.status(400).json({
        message: 'Invalid registration information.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long.'
      });
    }

    const existingPlayer = await Player.findOne({
      $or: [
        { username: username.trim() },
        { email: email.trim().toLowerCase() }
      ]
    });

    if (existingPlayer) {
      return res.status(409).json({
        message: 'Username or email is already registered.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const player = await Player.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword
    });

    return res.status(201).json({
      message: 'Account created successfully!',
      token: generateToken(player),
      player: {
        id: player._id,
        username: player.username,
        email: player.email
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Username or email is already registered.'
      });
    }

    console.error('Registration error:', error.message);

    return res.status(500).json({
      message: 'Unable to create account.'
    });
  }
};

// Log in an existing player
const loginPlayer = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        message: 'Invalid login information.'
      });
    }

    const player = await Player.findOne({
      email: email.trim().toLowerCase()
    });

    if (!player || !(await bcrypt.compare(password, player.password))) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    return res.json({
      message: 'Login successful!',
      token: generateToken(player),
      player: {
        id: player._id,
        username: player.username,
        email: player.email
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);

    return res.status(500).json({
      message: 'Unable to log in.'
    });
  }
};

module.exports = {
  registerPlayer,
  loginPlayer
};
