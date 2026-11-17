const { test } = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const Player = require('../models/Player');
const { ensureAdminAccount } = require('../bootstrapAdmin');

const adminEnvironment = [
  'ADMIN_USERNAME',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD'
];

function setAdminEnvironment(t, values = {}) {
  const previous = Object.fromEntries(
    adminEnvironment.map(key => [key, process.env[key]])
  );

  t.after(() => {
    for (const key of adminEnvironment) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  for (const key of adminEnvironment) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
}

test('does not create an admin when admin configuration is absent', async (t) => {
  setAdminEnvironment(t);
  const findOne = t.mock.method(Player, 'findOne');

  assert.equal(await ensureAdminAccount(), false);
  assert.equal(findOne.mock.calls.length, 0);
});

test('rejects incomplete admin configuration', async (t) => {
  setAdminEnvironment(t, { ADMIN_EMAIL: 'admin@example.com' });

  await assert.rejects(
    ensureAdminAccount(),
    /ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD must all be configured/
  );
});

test('creates a hashed admin account from configured credentials', async (t) => {
  setAdminEnvironment(t, {
    ADMIN_USERNAME: '  Admin  ',
    ADMIN_EMAIL: ' ADMIN@EXAMPLE.COM ',
    ADMIN_PASSWORD: 'secure-password'
  });
  t.mock.method(Player, 'findOne', async () => null);
  t.mock.method(bcrypt, 'hash', async () => 'hashed-admin-password');
  const create = t.mock.method(Player, 'create', async () => ({}));

  assert.equal(await ensureAdminAccount(), true);
  assert.deepEqual(create.mock.calls[0].arguments[0], {
    username: 'Admin',
    email: 'admin@example.com',
    password: 'hashed-admin-password',
    role: 'admin'
  });
});

test('does not promote a regular account matching the configured admin email', async (t) => {
  setAdminEnvironment(t, {
    ADMIN_USERNAME: 'Admin',
    ADMIN_EMAIL: 'player@example.com',
    ADMIN_PASSWORD: 'secure-password'
  });
  t.mock.method(Player, 'findOne', async () => ({
    email: 'player@example.com',
    role: 'player'
  }));
  const create = t.mock.method(Player, 'create');

  await assert.rejects(
    ensureAdminAccount(),
    /already belongs to a non-admin account/
  );
  assert.equal(create.mock.calls.length, 0);
});

test('does not reset credentials for an existing admin account', async (t) => {
  setAdminEnvironment(t, {
    ADMIN_USERNAME: 'Admin',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'secure-password'
  });
  t.mock.method(Player, 'findOne', async () => ({
    email: 'admin@example.com',
    role: 'admin'
  }));
  const create = t.mock.method(Player, 'create');
  const hash = t.mock.method(bcrypt, 'hash');

  assert.equal(await ensureAdminAccount(), false);
  assert.equal(create.mock.calls.length, 0);
  assert.equal(hash.mock.calls.length, 0);
});
