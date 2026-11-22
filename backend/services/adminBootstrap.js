/**
 * The administrator account from the environment (backend/.env):
 *
 *   ADMIN_USER_EMAIL=you@example.com
 *   ADMIN_USER_PASSWORD=a strong password   (same rules as scripts/create-first-admin.js: 12+ characters, three kinds, no common words)
 *   ADMIN_USER_NAME=Administrator           (optional)
 *
 * Runs once when the server starts, after the database is connected:
 *   - no account with that e-mail   -> it is created, as an administrator (role 1);
 *   - the account exists            -> it is made an administrator again if needed, and its password is replaced when it no longer matches
 *                                      the one in the environment (so changing the password in .env and restarting changes the password).
 * Nothing is done when the two main variables are not both set. A weak password or an invalid e-mail is reported (never the value) and the
 * server keeps running without touching any account. The password and its hash are never logged.
 */

const bcrypt = require('bcrypt');
const { passwordProblems, cleanEmail, BCRYPT_ROUNDS } = require('../scripts/create-first-admin');
const logger = require('../utils/logger');
const securityLog = require('../utils/securityLog');

const EMAIL_VARIABLE = 'ADMIN_USER_EMAIL';
const PASSWORD_VARIABLE = 'ADMIN_USER_PASSWORD';
const NAME_VARIABLE = 'ADMIN_USER_NAME';
const DEFAULT_NAME = 'Administrator';

const defaultUsers = () => {
  const User = require('../models/User');
  return {
    // Including a deleted account: its e-mail is still taken (unique), so it is brought back instead of creating a second one.
    findAnyByEmail: (email) => User.findOne({ email }),
    findOtherByName: (name, email) => User.findOne({ name, email: { $ne: email }, isDeleted: false }),
    create: (data) => User.create(data),
    updateById: (id, data) => User.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: false }),
  };
};

async function ensureAdminFromEnv({
  env = process.env,
  users = defaultUsers(),
  hash = (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
  compare = (password, stored) => bcrypt.compare(password, stored),
  report = (status) => securityLog.record('admin_account', null, { result: status }),
  fail = (text) => logger.error(text),
} = {}) {
  const rawEmail = env[EMAIL_VARIABLE];
  const password = env[PASSWORD_VARIABLE];
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '' || typeof password !== 'string' || password === '') {
    return { status: 'not_configured' };
  }

  const email = cleanEmail(rawEmail);
  if (!email) {
    fail(`Administrator account not set up: ${EMAIL_VARIABLE} is not a valid email address.`);
    return { status: 'invalid_email' };
  }
  const problems = passwordProblems(password, email);
  if (problems.length > 0) {
    fail(`Administrator account not set up: ${PASSWORD_VARIABLE} is too weak (${problems.join('; ')}).`);
    return { status: 'weak_password' };
  }
  const rawName = env[NAME_VARIABLE];
  const name = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim().slice(0, 100) : DEFAULT_NAME;

  try {
    const existing = await users.findAnyByEmail(email);

    if (!existing) {
      if (await users.findOtherByName(name, email)) {
        fail(`Administrator account not set up: another account already uses the name "${name}". Set ${NAME_VARIABLE} to another name.`);
        return { status: 'name_taken' };
      }
      await users.create({ name, email, password: await hash(password), role: 1 });
      report('created');
      return { status: 'created' };
    }

    const changes = {};
    if (existing.role !== 1) changes.role = 1;
    if (existing.isDeleted) changes.isDeleted = false;
    if (!existing.password || !(await compare(password, existing.password))) changes.password = await hash(password);

    if (Object.keys(changes).length === 0) return { status: 'unchanged' };
    await users.updateById(existing._id, changes);
    report('updated');
    return { status: 'updated', changed: Object.keys(changes) };
  } catch (error) {
    fail(`Administrator account could not be set up (${(error && (error.code || error.name)) || 'error'}).`);
    return { status: 'error' };
  }
}

module.exports = { ensureAdminFromEnv, EMAIL_VARIABLE, PASSWORD_VARIABLE, NAME_VARIABLE };
