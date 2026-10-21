

const express = require('express');
const bcrypt = require('bcryptjs');
const Player = require('../models/Player');

const router = express.Router();

// Register a new player
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'Username, email, and password are required.'
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

    res.status(201).json({
      message: 'Account created successfully!',
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
    res.status(500).json({
      message: 'Unable to create account.'
    });
  }
});

// Log in an existing player
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
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

    res.json({
      message: 'Login successful!',
      player: {
        id: player._id,
        username: player.username,
        email: player.email
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      message: 'Unable to log in.'
    });
  }
});

module.exports = router;
