
const { test } = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const Player = require('../models/Player');

const {
  registerPlayer,
  loginPlayer,
  updatePlayerProfile
} = require('../controllers/authController');

process.env.JWT_SECRET = 'test-secret-key';

// Mock response object
const createResponse = () => {
  const res = {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    }
  };

  return res;
};

// Registration tests

test('registerPlayer should create a new account successfully', async (t) => {
  t.mock.method(Player, 'findOne', async () => null);
  t.mock.method(bcrypt, 'hash', async () => 'hashedPassword');

  const create = t.mock.method(Player, 'create', async (data) => ({
    _id: 'player123',
    username: data.username,
    email: data.email,
    role: data.role
  }));

  const req = {
    body: {
      username: 'PlayerOne',
      email: 'PLAYER@EMAIL.COM',
      password: 'password123',
      role: 'admin'
    }
  };

  const res = createResponse();

  await registerPlayer(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.message, 'Account created successfully!');
  assert.equal(res.body.player.username, 'PlayerOne');
  assert.equal(res.body.player.email, 'player@email.com');
  assert.equal(res.body.player.role, 'player');
  assert.equal(create.mock.calls[0].arguments[0].role, 'player');
});

test('registerPlayer should reject missing fields', async (t) => {
  const req = {
    body: {
      username: '',
      email: 'player@email.com',
      password: 'password123'
    }
  };

  const res = createResponse();

  await registerPlayer(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    'Username, email, and password are required.'
  );
});

test('registerPlayer should reject invalid data types', async (t) => {
  const req = {
    body: {
      username: 123,
      email: 'player@email.com',
      password: 'password123'
    }
  };

  const res = createResponse();

  await registerPlayer(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid registration information.');
});

test('registerPlayer should reject passwords shorter than 8 characters', async (t) => {
  const req = {
    body: {
      username: 'PlayerOne',
      email: 'player@email.com',
      password: '1234567'
    }
  };

  const res = createResponse();

  await registerPlayer(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    'Password must be at least 8 characters long.'
  );
});

test('registerPlayer should reject an already registered player', async (t) => {
  t.mock.method(Player, 'findOne', async () => ({
    username: 'PlayerOne'
  }));

  const req = {
    body: {
      username: 'PlayerOne',
      email: 'player@email.com',
      password: 'password123'
    }
  };

  const res = createResponse();

  await registerPlayer(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(
    res.body.message,
    'Username or email is already registered.'
  );
});

// Login tests

test('loginPlayer should log in an existing player successfully', async (t) => {
  const player = {
    _id: 'player123',
    username: 'PlayerOne',
    email: 'player@email.com',
    password: 'hashedPassword',
    role: 'player',
    profilePicture: '/assets/avatar2.jpg'
  };

  t.mock.method(Player, 'findOne', async () => player);
  t.mock.method(bcrypt, 'compare', async () => true);

  const req = {
    body: {
      email: 'PLAYER@EMAIL.COM',
      password: 'password123'
    }
  };

  const res = createResponse();

  await loginPlayer(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Login successful!');
  assert.equal(res.body.player.username, 'PlayerOne');
  assert.equal(res.body.player.role, 'player');
  assert.equal(res.body.player.profilePicture, '/assets/avatar2.jpg');
});

test('loginPlayer returns the admin role for an admin account', async (t) => {
  const player = {
    _id: 'admin123',
    username: 'Admin',
    email: 'admin@example.com',
    password: 'hashedPassword',
    role: 'admin'
  };

  t.mock.method(Player, 'findOne', async () => player);
  t.mock.method(bcrypt, 'compare', async () => true);

  const res = createResponse();

  await loginPlayer({
    body: { email: 'admin@example.com', password: 'password123' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.player.role, 'admin');
  assert.equal(
    require('jsonwebtoken').verify(res.body.token, process.env.JWT_SECRET).role,
    'admin'
  );
});

test('loginPlayer should reject missing email or password', async (t) => {
  const req = {
    body: {
      email: '',
      password: 'password123'
    }
  };

  const res = createResponse();

  await loginPlayer(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    'Email and password are required.'
  );
});

test('loginPlayer should reject invalid data types', async (t) => {
  const req = {
    body: {
      email: 123,
      password: 'password123'
    }
  };

  const res = createResponse();

  await loginPlayer(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid login information.');
});

test('loginPlayer should reject incorrect credentials', async (t) => {
  t.mock.method(Player, 'findOne', async () => null);

  const req = {
    body: {
      email: 'player@email.com',
      password: 'wrongpassword'
    }
  };

  const res = createResponse();

  await loginPlayer(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Invalid email or password.');
});

test('updatePlayerProfile saves the authenticated player profile', async (t) => {
  const updatedPlayer = {
    _id: 'player123',
    username: 'NewName',
    profilePicture: '/assets/avatar3.jpg'
  };
  const updateProfile = t.mock.method(Player, 'updateProfile', async () => updatedPlayer);
  const req = {
    player: { _id: 'player123' },
    body: { username: ' NewName ', profilePicture: '/assets/avatar3.jpg' }
  };
  const res = createResponse();

  await updatePlayerProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateProfile.mock.calls[0].arguments, [
    'player123',
    { username: 'NewName', profilePicture: '/assets/avatar3.jpg' }
  ]);
  assert.deepEqual(res.body.player, {
    id: 'player123',
    username: 'NewName',
    profilePicture: '/assets/avatar3.jpg'
  });
});

test('updatePlayerProfile rejects invalid profile data', async () => {
  const req = {
    player: { _id: 'player123' },
    body: { username: '   ', profilePicture: 123 }
  };
  const res = createResponse();

  await updatePlayerProfile(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid profile information.');
});
