const bcrypt = require('bcryptjs');
const Player = require('./models/Player');

async function ensureAdminAccount() {
  const username = process.env.ADMIN_USERNAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const configuredValues = [username, email, password];

  if (configuredValues.every(value => !value)) {
    return false;
  }

  if (configuredValues.some(value => !value)) {
    throw new Error(
      'ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD must all be configured.'
    );
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedUsername || !normalizedEmail) {
    throw new Error('Admin username and email cannot be blank.');
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
  }

  const existingEmail = await Player.findOne({ email: normalizedEmail });

  if (existingEmail) {
    if (existingEmail.role !== 'admin') {
      throw new Error(
        'The configured admin email already belongs to a non-admin account.'
      );
    }

    return false;
  }

  const existingUsername = await Player.findOne({
    username: normalizedUsername
  });

  if (existingUsername) {
    throw new Error(
      'The configured admin username already belongs to another account.'
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await Player.create({
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    role: 'admin'
  });

  return true;
}

module.exports = { ensureAdminAccount };
