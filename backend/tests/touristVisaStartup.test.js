'use strict';

// Step 8j-3, A11: the Tourist Visa feature refuses to start half-configured, and the AI data-terms guard cannot be skipped by a missing or
// misspelled NODE_ENV. Two layers: the rules (a function of an environment object, no process involved) and the REAL index.js started in a child
// process (exit code, message, and that no value is ever printed). Made-up values only; the real settings file is never read.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { inspectTouristVisaStartup, checkTouristVisaStartup, startupMessage } = require('../config/touristVisaStartup');
const { readAiSettings, aiUnavailableCode, isProductionEnvironment } = require('../config/ai');
const { startIndex, waitUntilUp, rawRequest } = require('./helpers/childApp');

const GOOD_KEY = crypto.randomBytes(32).toString('base64');
const GOOD_HEX_KEY = crypto.randomBytes(32).toString('hex');
const SECRET_MARK = 'SENTINEL-VALUE-MUST-NEVER-BE-PRINTED-4711';

/** A complete, valid environment for the feature (AI off). */
const complete = (extra = {}) => ({ TOURIST_VISA_ENABLED: 'true', FIELD_ENCRYPTION_KEY: GOOD_KEY, JWT_SECRET: 'made-up-jwt-secret-for-tests', NODE_ENV: 'test', ...extra });
const variables = (env) => inspectTouristVisaStartup(env).problems.map((p) => p.variable);

// ---------------------------------------------------------------------------------------------- the rules

test('a complete environment has no problem and no warning; a hex key is as good as a base64 one', () => {
  assert.deepEqual(inspectTouristVisaStartup(complete()), { enabled: true, problems: [], warnings: [] });
  assert.deepEqual(variables(complete({ FIELD_ENCRYPTION_KEY: GOOD_HEX_KEY })), []);
  assert.deepEqual(variables(complete({ FIELD_ENCRYPTION_KEY: `  ${GOOD_KEY}  ` })), [], 'surrounding spaces are tolerated, as the key reader does');
});

test('FIELD_ENCRYPTION_KEY: missing, empty, blank, too short, too long, not base64 and not hex are each a problem that names the variable', () => {
  const bad = {
    missing: undefined,
    empty: '',
    blank: '   ',
    'too short': crypto.randomBytes(16).toString('base64'),
    'too long': crypto.randomBytes(48).toString('base64'),
    'not base64': 'this key has spaces and !!! in it, not a key',
    'hex of the wrong length': 'ab'.repeat(20),
  };
  for (const [label, value] of Object.entries(bad)) {
    const env = complete();
    if (value === undefined) delete env.FIELD_ENCRYPTION_KEY;
    else env.FIELD_ENCRYPTION_KEY = value;
    assert.deepEqual(variables(env), ['FIELD_ENCRYPTION_KEY'], label);
  }
});

test('JWT_SECRET: missing, empty and blank are each a problem; any other text is accepted', () => {
  for (const value of [undefined, '', '   ']) {
    const env = complete();
    if (value === undefined) delete env.JWT_SECRET;
    else env.JWT_SECRET = value;
    assert.deepEqual(variables(env), ['JWT_SECRET'], JSON.stringify(value));
  }
  assert.deepEqual(variables(complete({ JWT_SECRET: 'x' })), [], 'no length rule is invented');
});

test('AI on: the provider must be groq and the key must be set; each missing piece is its own problem', () => {
  const ai = (extra) => complete({ AI_ENABLED: 'true', ...extra });
  assert.deepEqual(variables(ai({})), ['AI_PROVIDER', 'GROQ_API_KEY']);
  assert.deepEqual(variables(ai({ AI_PROVIDER: 'groq' })), ['GROQ_API_KEY']);
  assert.deepEqual(variables(ai({ AI_PROVIDER: 'groq', GROQ_API_KEY: '   ' })), ['GROQ_API_KEY']);
  assert.deepEqual(variables(ai({ AI_PROVIDER: 'openai', GROQ_API_KEY: 'made-up-key' })), ['AI_PROVIDER']);
  assert.deepEqual(variables(ai({ AI_PROVIDER: ' Groq ', GROQ_API_KEY: 'made-up-key' })), [], 'the provider is read as the AI adapter reads it (trimmed, lower case)');
  assert.deepEqual(variables(ai({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'made-up-key' })), []);
});

test('AI off, or anything but exactly "true": no AI problem is raised, whatever else is (or is not) set', () => {
  for (const value of [undefined, '', 'false', 'TRUE', ' true', '1', 'yes']) {
    const env = complete();
    if (value !== undefined) env.AI_ENABLED = value;
    assert.deepEqual(variables(env), [], `AI_ENABLED=${JSON.stringify(value)}`);
  }
});

test('several problems are all reported together, in a fixed order, with the variable names only', () => {
  const env = { TOURIST_VISA_ENABLED: 'true', AI_ENABLED: 'true', GROQ_API_KEY: SECRET_MARK, FIELD_ENCRYPTION_KEY: SECRET_MARK };
  assert.deepEqual(variables(env), ['FIELD_ENCRYPTION_KEY', 'JWT_SECRET', 'AI_PROVIDER']);
  const message = startupMessage(inspectTouristVisaStartup(env).problems);
  for (const name of ['FIELD_ENCRYPTION_KEY', 'JWT_SECRET', 'AI_PROVIDER', 'TOURIST_VISA_ENABLED']) assert.ok(message.includes(name), name);
  assert.equal(message.includes(SECRET_MARK), false, 'no value in the message');
});

test('the feature switched off (unset, empty, "false", "TRUE", " true", "1"): nothing is checked, nothing is reported, even with every variable missing', () => {
  for (const value of [undefined, '', 'false', 'TRUE', ' true', '1', 'yes']) {
    const env = { AI_ENABLED: 'true' }; // nothing else, so every check would fail if it ran
    if (value !== undefined) env.TOURIST_VISA_ENABLED = value;
    assert.deepEqual(inspectTouristVisaStartup(env), { enabled: false, problems: [], warnings: [] }, JSON.stringify(value));
    const reported = [];
    assert.equal(checkTouristVisaStartup({ env, report: (line) => reported.push(line) }), true);
    assert.deepEqual(reported, []);
  }
});

test('checkTouristVisaStartup: true and silent for a good environment, false with one message for a bad one, and it never reports a value', () => {
  const quiet = [];
  assert.equal(checkTouristVisaStartup({ env: complete(), report: (line) => quiet.push(line) }), true);
  assert.deepEqual(quiet, []);
  const lines = [];
  assert.equal(checkTouristVisaStartup({ env: complete({ FIELD_ENCRYPTION_KEY: SECRET_MARK, JWT_SECRET: '' }), report: (line) => lines.push(line) }), false);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /FIELD_ENCRYPTION_KEY/);
  assert.match(lines[0], /JWT_SECRET/);
  assert.equal(lines.join('\n').includes(SECRET_MARK), false);
});

// ---------------------------------------------------------------------------------------------- the AI data-terms guard and NODE_ENV

test('production is everything except NODE_ENV exactly "development" or "test": unset, empty, "prod", "Production", " production", "Development", "TEST" and "dev" are production', () => {
  for (const value of [undefined, '', 'production', 'prod', 'Production', 'PRODUCTION', ' production', 'production ', 'Development', 'DEVELOPMENT', 'TEST', 'dev', 'staging', 'development ', ' test', 'testing']) {
    assert.equal(isProductionEnvironment(value === undefined ? {} : { NODE_ENV: value }), true, JSON.stringify(value));
  }
  assert.equal(isProductionEnvironment({ NODE_ENV: 'development' }), false);
  assert.equal(isProductionEnvironment({ NODE_ENV: 'test' }), false);
});

test('the AI terms guard holds whatever NODE_ENV is: unconfirmed terms keep the AI off (AI_TERMS_NOT_CONFIRMED) in every environment except development and test', () => {
  const base = { AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'made-up-key' };
  for (const nodeEnv of [undefined, '', 'production', 'prod', 'Production', ' production', 'staging']) {
    const env = { ...base, ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }) };
    assert.equal(aiUnavailableCode(readAiSettings(env)), 'AI_TERMS_NOT_CONFIRMED', JSON.stringify(nodeEnv));
    assert.equal(aiUnavailableCode(readAiSettings({ ...env, AI_DATA_TERMS_CONFIRMED: 'true' })), null, `confirmed, ${JSON.stringify(nodeEnv)}`);
    for (const wrong of ['TRUE', 'yes', '1', ' true', 'false', '']) assert.equal(aiUnavailableCode(readAiSettings({ ...env, AI_DATA_TERMS_CONFIRMED: wrong })), 'AI_TERMS_NOT_CONFIRMED', `terms=${JSON.stringify(wrong)}`);
  }
  for (const nodeEnv of ['development', 'test']) assert.equal(aiUnavailableCode(readAiSettings({ ...base, NODE_ENV: nodeEnv })), null, nodeEnv);
});

test('AI on in production without the terms is a WARNING, not a refusal (the AI stays off and the template is used); it names the variable and nothing else', () => {
  const env = complete({ NODE_ENV: undefined, AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: SECRET_MARK });
  delete env.NODE_ENV;
  const result = inspectTouristVisaStartup(env);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.warnings.map((w) => w.variable), ['AI_DATA_TERMS_CONFIRMED']);
  const lines = [];
  assert.equal(checkTouristVisaStartup({ env, report: (line) => lines.push(line) }), true, 'a warning does not stop the start');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /AI_DATA_TERMS_CONFIRMED/);
  assert.equal(lines[0].includes(SECRET_MARK), false);
  // Confirmed, or not production, or AI off: no warning.
  assert.deepEqual(inspectTouristVisaStartup({ ...env, AI_DATA_TERMS_CONFIRMED: 'true' }).warnings, []);
  assert.deepEqual(inspectTouristVisaStartup({ ...env, NODE_ENV: 'development' }).warnings, []);
  assert.deepEqual(inspectTouristVisaStartup({ ...env, AI_ENABLED: 'false' }).warnings, []);
});

// ---------------------------------------------------------------------------------------------- the real index.js

/**
 * Starts index.js with `env`, expects a refusal, and returns { code, output }. A working database address is given on purpose: without one the
 * server would stop anyway for lack of a database, and a refusal that did not really happen could not be told from one.
 */
async function refused(env, mongoUri) {
  const app = await startIndex({ MONGODB_URI: mongoUri, ...env });
  try {
    const code = await app.exit();
    return { code, output: app.output() };
  } finally {
    await app.stop();
  }
}

test('the real server refuses to start, exit code 1, naming the variable and never its value, for each missing or invalid setting', async () => {
  const cases = [
    ['FIELD_ENCRYPTION_KEY missing', { ...complete(), FIELD_ENCRYPTION_KEY: undefined }, ['FIELD_ENCRYPTION_KEY']],
    ['FIELD_ENCRYPTION_KEY invalid', complete({ FIELD_ENCRYPTION_KEY: SECRET_MARK }), ['FIELD_ENCRYPTION_KEY']],
    ['JWT_SECRET missing', { ...complete(), JWT_SECRET: undefined }, ['JWT_SECRET']],
    ['AI on, no provider', complete({ AI_ENABLED: 'true', GROQ_API_KEY: SECRET_MARK }), ['AI_PROVIDER']],
    ['AI on, no key', complete({ AI_ENABLED: 'true', AI_PROVIDER: 'groq' }), ['GROQ_API_KEY']],
    ['several at once', { TOURIST_VISA_ENABLED: 'true', AI_ENABLED: 'true' }, ['FIELD_ENCRYPTION_KEY', 'JWT_SECRET', 'AI_PROVIDER', 'GROQ_API_KEY']],
  ];
  const mongod = await MongoMemoryServer.create();
  try {
  for (const [label, env, names] of cases) {
    const clean = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
    const { code, output } = await refused(clean, mongod.getUri());
    assert.equal(code, 1, `${label}: exit code (output: ${output})`);
    for (const name of names) assert.ok(output.includes(name), `${label}: the message names ${name}`);
    assert.match(output, /Tourist Visa feature cannot start/, label);
    assert.equal(output.includes(SECRET_MARK), false, `${label}: no value in the output`);
    assert.equal(output.includes(GOOD_KEY), false, `${label}: the good key is not printed either`);
    assert.equal(/Server running/.test(output), false, label);
  }
  } finally {
    await mongod.stop();
  }
});

test('with the feature switched off the server starts with nothing set, says nothing about the Tourist Visa, and the status answer is open:false', async () => {
  const mongod = await MongoMemoryServer.create();
  const app = await startIndex({ MONGODB_URI: mongod.getUri(), NODE_ENV: 'test', AI_ENABLED: 'true' }); // no key, no secret, AI half set: all ignored
  try {
    await waitUntilUp(app);
    const status = await rawRequest(app.port, { path: '/api/tourist-visa/status' });
    assert.equal(status.status, 200);
    assert.deepEqual(status.json, { open: false });
    assert.equal(/Tourist Visa|FIELD_ENCRYPTION_KEY|JWT_SECRET|AI_PROVIDER|GROQ_API_KEY/.test(app.output()), false, `output: ${app.output()}`);
  } finally {
    await app.stop();
    await mongod.stop();
  }
});

test('with every setting present the server starts; AI on in an unset NODE_ENV without the terms starts too, and says (by name) that the AI stays off', async () => {
  const mongod = await MongoMemoryServer.create();
  const env = { MONGODB_URI: mongod.getUri(), ...complete(), AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: SECRET_MARK };
  delete env.NODE_ENV; // unset: production
  const app = await startIndex(env);
  try {
    await waitUntilUp(app);
    const status = await rawRequest(app.port, { path: '/api/tourist-visa/status' });
    assert.deepEqual(status.json, { open: true });
    assert.match(app.output(), /AI_DATA_TERMS_CONFIRMED/);
    assert.equal(/cannot start/.test(app.output()), false);
    assert.equal(app.output().includes(SECRET_MARK), false, 'the key is never printed');
  } finally {
    await app.stop();
    await mongod.stop();
  }
});
