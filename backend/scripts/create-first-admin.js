#!/usr/bin/env node
/**
 * One-off tool: creates the FIRST administrator account (role 1). There is no web route that does this, on purpose.
 *
 * HOW TO RUN (from the backend folder, on a machine that can reach the database):
 *   1. Put the details in environment variables YOURSELF, in your own shell. Do not type the password into a command line (it would be
 *      kept in the shell history) and do not put it in a file:
 *        PowerShell:   $env:FIRST_ADMIN_EMAIL = "you@example.com"
 *                      $env:FIRST_ADMIN_NAME  = "Your Name"            (optional; default "Administrator")
 *                      $p = Read-Host "Password" -AsSecureString
 *                      $env:FIRST_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))
 *        bash:         export FIRST_ADMIN_EMAIL="you@example.com"; export FIRST_ADMIN_NAME="Your Name"
 *                      read -rs FIRST_ADMIN_PASSWORD; export FIRST_ADMIN_PASSWORD
 *   2. node scripts/create-first-admin.js
 *   3. Remove the password from your shell at once:  PowerShell: Remove-Item Env:FIRST_ADMIN_PASSWORD   bash: unset FIRST_ADMIN_PASSWORD
 * The database address (MONGODB_URI) is read from the environment or from backend/.env, after the details have been checked.
 *
 * It checks the details first and refuses (exit code 2, nothing changed) when: a variable is missing; the email is not an email; the
 * password is weak (under 12 characters, over 72 bytes (the limit of the hashing, anything longer would be silently cut), fewer than
 * three kinds of character, fewer than 6 different characters, a common password inside it, or the name of the email inside it); or an
 * account with that email OR that name already exists (the sign-up refuses a duplicate name too). The password is hashed with bcrypt,
 * 10 rounds, exactly as the sign-up does, so the account signs in through the normal login.
 * It prints one line on success (the email, never the password) and never prints the password, a hash, the database address or the text of an
 * error: a failure shows only its type or code.
 * Exit codes: 0 created, 1 could not be created, 2 refused.
 */

const path = require('path');

const EMAIL_VARIABLE = 'FIRST_ADMIN_EMAIL';
const PASSWORD_VARIABLE = 'FIRST_ADMIN_PASSWORD';
const NAME_VARIABLE = 'FIRST_ADMIN_NAME';
const DEFAULT_NAME = 'Administrator';
const BCRYPT_ROUNDS = 10; // the same as the sign-up (services/userService.js)
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt reads no more than 72 bytes
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
// Words a password must not contain, whatever else is in it (compared in lower case).
const COMMON_WORDS = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'administrator', 'iloveyou', '123456', 'abcdef', 'wiser', 'consulting'];

const USAGE = `Set ${EMAIL_VARIABLE} and ${PASSWORD_VARIABLE} (and optionally ${NAME_VARIABLE}) in your own shell, then run: node scripts/create-first-admin.js
See the comment at the top of this file for how to set them without leaving the password in your shell history.`;

/** Why a password is not accepted, as fixed phrases (the password itself is never part of one). An empty list means it is fine. */
function passwordProblems(password, email) {
  const problems = [];
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) problems.push(`it must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (typeof password !== 'string') return problems;
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) problems.push(`it must be at most ${MAX_PASSWORD_BYTES} bytes long (the hashing ignores anything beyond that)`);
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (kinds < 3) problems.push('it must mix at least three of: lower case letters, upper case letters, digits and symbols');
  if (new Set(password).size < 6) problems.push('it must use at least 6 different characters');
  const lower = password.toLowerCase();
  if (COMMON_WORDS.some((word) => lower.includes(word))) problems.push('it must not contain a common password or word');
  const local = typeof email === 'string' ? email.split('@')[0].toLowerCase() : '';
  if (local.length >= 4 && lower.includes(local)) problems.push('it must not contain the name part of the email');
  return problems;
}

/** The email as the sign-up would store it (trimmed, lower case), or null when it is not an email. */
function cleanEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  const { z } = require('zod');
  return z.string().email().safeParse(email).success ? email : null;
}

/**
 * The tool itself, with everything it touches passed in so it can be tested without the real database.
 * `users` has findByEmailOrName(email, name) and create(data); `connect` and `disconnect` open and close the database; `hash(password)`
 * gives the bcrypt hash. Returns the exit code.
 */
async function run({ env, out, err, loadEnv = () => {}, connect, disconnect, users, hash }) {
  const rawEmail = env[EMAIL_VARIABLE];
  const password = env[PASSWORD_VARIABLE];
  const rawName = env[NAME_VARIABLE];

  if (typeof rawEmail !== 'string' || rawEmail.trim() === '' || typeof password !== 'string' || password === '') {
    err(`Refusing to run: ${EMAIL_VARIABLE} and ${PASSWORD_VARIABLE} must both be set.\n\n${USAGE}`);
    return 2;
  }
  const email = cleanEmail(rawEmail);
  if (!email) {
    err(`Refusing to run: ${EMAIL_VARIABLE} is not a valid email address.`);
    return 2;
  }
  const name = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : DEFAULT_NAME;
  if (name.length > MAX_NAME_LENGTH) {
    err(`Refusing to run: ${NAME_VARIABLE} is longer than ${MAX_NAME_LENGTH} characters.`);
    return 2;
  }
  const problems = passwordProblems(password, email);
  if (problems.length > 0) {
    err(`Refusing to run: ${PASSWORD_VARIABLE} is too weak:\n  - ${problems.join('\n  - ')}`);
    return 2;
  }

  // The settings file is read only now: a refused run never touches it.
  loadEnv();
  try {
    await connect();
  } catch (error) {
    err(`Could not connect to the database (${(error && (error.code || error.name)) || 'error'}).`);
    return 1;
  }

  try {
    if (await users.findByEmailOrName(email, name)) {
      err(`Refusing to run: an account with that email or that name already exists. Nothing was changed. (Use ${NAME_VARIABLE} for another name.)`);
      return 2;
    }
    const passwordHash = await hash(password);
    await users.create({ name, email, password: passwordHash, role: 1 });
    out(`Administrator account created for ${email}. Remove ${PASSWORD_VARIABLE} from your shell now.`);
    return 0;
  } catch (error) {
    if (error && error.code === 11000) {
      err('Refusing to run: an account with that email already exists. Nothing was changed.');
      return 2;
    }
    err(`The administrator could not be created (${(error && (error.code || error.name)) || 'error'}).`);
    return 1;
  } finally {
    try {
      await disconnect();
    } catch {
      // nothing to do
    }
  }
}

module.exports = { run, passwordProblems, cleanEmail, BCRYPT_ROUNDS, EMAIL_VARIABLE, PASSWORD_VARIABLE, NAME_VARIABLE, DEFAULT_NAME };

if (require.main === module) {
  const bcrypt = require('bcrypt');
  const mongoose = require('mongoose');
  const env = process.env;
  run({
    env,
    out: (text) => console.log(text),
    err: (text) => console.error(text),
    loadEnv: () => require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true }),
    connect: () => {
      if (typeof env.MONGODB_URI !== 'string' || env.MONGODB_URI.trim() === '') throw Object.assign(new Error('missing'), { code: 'MONGODB_URI_NOT_SET' });
      return mongoose.connect(env.MONGODB_URI);
    },
    disconnect: () => mongoose.disconnect(),
    users: require('../repositories/userRepository'),
    hash: (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
  }).then((code) => {
    delete env[PASSWORD_VARIABLE];
    process.exit(code);
  });
}
