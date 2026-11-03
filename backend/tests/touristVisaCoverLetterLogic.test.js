'use strict';

// Step 8g tests that need no database: the checks on a letter written by the AI (no invented figures, placeholders), the
// template letter, the AI adapter (timeout, retry, circuit breaker, production guard; a fake fetch and a fake clock, no
// network), the single prompt file, and every fallback of the cover letter service. Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const engine = require('../shared/tourist-visa/engine');
const factsModule = require('../shared/tourist-visa/coverLetterFacts');
const checks = require('../utils/touristVisaCoverLetterChecks');
const { buildTemplate } = require('../utils/touristVisaCoverLetterTemplate');
const { AiService, AiError } = require('../services/aiService');
const { TouristVisaCoverLetterService } = require('../services/touristVisaCoverLetterService');
const { SYSTEM_PROMPT, buildUserPrompt } = require('../config/touristVisaCoverLetterPrompt');
const { GROQ_URL, DEFAULT_GROQ_MODEL, LIMITS, readAiSettings, aiUnavailableCode } = require('../config/ai');
const { FALLBACK_REASONS } = require('../models/TouristVisaCoverLetter');
const logger = require('../utils/logger');

const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const answers = () => ({
  q1_1: 'tourism', q1_2: false, q1_3: true, q1_4: 'holiday', q1_5: 'A holiday with family and some sightseeing.',
  q1_6: '2027-03-01', q1_7: '2027-03-15', companions: [{ q1_3b: 'Companion' }, { q1_3b: 'Companion' }],
  q2_1: 'Zainab', q2_2: 'Qureshi', q2_13: 'married', q2_14: 'PK', q2_24: { line1: 'Somewhere 1', town: 'Karachi', country: 'PK' },
  q4_7: true, dependants: [{}, {}, {}],
  q5_1: 'employed', q5_2: '2019-03', q5_3: 'Acme Secret Ltd', q5_6: 'Senior accountant', q5_7: { amount: 475000, currency: 'PKR' },
  q6_1: 'savings', q6_2: { amount: 2500, currency: 'GBP' }, q6_3: { amount: 1500, currency: 'GBP' }, q6_5: false,
  q6_7: false, q6_7x: 'paid_stay', q6_7y: 'London',
  q7_4: true, q7_5: 2, ukVisits: [{ q7_5b: '2023-05', q7_5c: { weeks: 2 } }, { q7_5b: '2021-08', q7_5c: { days: 5 } }],
});
const facts = () => factsModule.buildFacts(engine.config, answers(), { submittedAt: SUBMITTED });

// A good letter, as the model would write it from those facts: placeholders, figures straight from the facts.
const FILLER = 'I am a careful and responsible traveller and I have organised this visit well in advance so that everything is clear and in order. ';
const goodLetter = () => [
  'Dear Sir or Madam,',
  `I am writing to support my application for a UK Standard Visitor visa. I plan to travel to the United Kingdom on 1 March 2027 and to return on 15 March 2027, a stay of 14 nights. ${FILLER}${FILLER}`,
  `I am a national of Pakistan and I live in Pakistan. I work as a senior accountant for [EMPLOYER], where I have worked since March 2019, and I earn 475,000 PKR each month after tax. ${FILLER}${FILLER}`,
  `I have savings of £2,500 and I plan to spend £1,500 on my visit. I will be travelling with 2 other people and 3 people rely on me financially. I have visited the United Kingdom 2 times before. ${FILLER}${FILLER}`,
  'Yours faithfully,\n\n[NAME]',
].join('\n\n');

// ---------------------------------------------------------------------------
// The checks on a letter written by the AI
// ---------------------------------------------------------------------------

test('checks: a letter from the facts passes, with the placeholders still in', () => {
  const result = checks.checkLetter(goodLetter(), facts());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.text, /\[NAME\]/);
  assert.ok(checks.wordCount(result.text) >= checks.MIN_WORDS);
});

test('checks: a number, an amount or a date that is not in the facts is rejected, with a fixed code and none of the text', () => {
  const f = facts();
  const wrong = (from, to) => checks.checkLetter(goodLetter().replace(from, to), f);
  assert.deepEqual(wrong('14 nights', '21 nights'), { ok: false, code: 'LETTER_NUMBER_NOT_IN_FACTS' });
  assert.deepEqual(wrong('£1,500', '£9,999'), { ok: false, code: 'LETTER_NUMBER_NOT_IN_FACTS' });
  assert.deepEqual(wrong('475,000 PKR', '475,001 PKR'), { ok: false, code: 'LETTER_NUMBER_NOT_IN_FACTS' });
  assert.deepEqual(wrong('1 March 2027', '2 March 2027'), { ok: false, code: 'LETTER_DATE_NOT_IN_FACTS' });
  assert.deepEqual(wrong('15 March 2027', '15 April 2027'), { ok: false, code: 'LETTER_DATE_NOT_IN_FACTS' });
  assert.deepEqual(wrong('since March 2019', 'since March 2018'), { ok: false, code: 'LETTER_DATE_NOT_IN_FACTS' });
  assert.deepEqual(wrong('1 March 2027', '11 March 2027'), { ok: false, code: 'LETTER_DATE_NOT_IN_FACTS' });
  // A day and a month without the year is fine if the facts have that day and month.
  assert.equal(wrong('15 March 2027', '15 March').ok, true);
  // A number written out in words is a number too.
  assert.deepEqual(wrong('2 times', 'nine times'), { ok: false, code: 'LETTER_NUMBER_NOT_IN_FACTS' });
  assert.equal(wrong('2 times', 'two times').ok, true, 'two is in the facts');
  // The same amount written another way is the same amount.
  assert.equal(wrong('£2,500', '£2500.00').ok, true);
  // A numbered list marker is not a figure.
  assert.equal(wrong('Dear Sir or Madam,', 'Dear Sir or Madam,\n9. ').ok, true);
  // Nothing of the text is ever in the answer.
  assert.equal(JSON.stringify(wrong('14 nights', '21 nights')).includes('nights'), false);
});

test('checks: placeholders. Only the known ones, only if the facts supplied them, and [NAME] must be there', () => {
  const f = facts();
  assert.deepEqual(checks.checkLetter(goodLetter().replace('[EMPLOYER]', '[ADDRESS]'), f), { ok: false, code: 'LETTER_UNKNOWN_TOKEN' });
  assert.deepEqual(checks.checkLetter(goodLetter().replace('[EMPLOYER]', '[SCHOOL]'), f), { ok: false, code: 'LETTER_UNKNOWN_TOKEN' }, 'no school was supplied');
  assert.deepEqual(checks.checkLetter(goodLetter().replace('[EMPLOYER]', '[your employer]'), f), { ok: false, code: 'LETTER_UNKNOWN_TOKEN' });
  assert.deepEqual(checks.checkLetter(goodLetter().replace('[NAME]', 'Zainab'), f), { ok: false, code: 'LETTER_MISSING_TOKEN' });
  // No name in the answers: no [NAME] is asked for, and one in the letter is unknown.
  const nameless = factsModule.buildFacts(engine.config, { ...answers(), q2_1: undefined, q2_2: undefined }, { submittedAt: SUBMITTED });
  assert.deepEqual(checks.checkLetter(goodLetter(), nameless), { ok: false, code: 'LETTER_UNKNOWN_TOKEN' });
});

test('checks: length, links, markup and an empty answer', () => {
  const f = facts();
  assert.deepEqual(checks.checkLetter('   ', f), { ok: false, code: 'LETTER_EMPTY' });
  assert.deepEqual(checks.checkLetter('Dear Sir or Madam, Yours faithfully, [NAME]', f), { ok: false, code: 'LETTER_LENGTH' });
  assert.deepEqual(checks.checkLetter(`${goodLetter()} ${'word '.repeat(800)}`, f), { ok: false, code: 'LETTER_LENGTH' });
  assert.deepEqual(checks.checkLetter(`${goodLetter()} See https://example.invalid/x`, f), { ok: false, code: 'LETTER_LINK' });
  assert.deepEqual(checks.checkLetter(`${goodLetter()} Write to someone@example.invalid`, f), { ok: false, code: 'LETTER_LINK' });
  assert.deepEqual(checks.checkLetter(`${goodLetter()} <script>x</script>`, f), { ok: false, code: 'LETTER_LINK' });
  // Markdown that a model adds is tidied, not rejected.
  const tidy = checks.checkLetter(`\`\`\`\n## Cover letter\n**${goodLetter()}**\n\`\`\``, f);
  assert.equal(tidy.ok, true);
  assert.equal(/[*#`]/.test(tidy.text), false);
});

test('checks: the real values go in after the checks, as plain text', () => {
  assert.equal(checks.substitute('Dear [EMPLOYER], from [NAME] and [SCHOOL].', { NAME: 'Zainab $& Qureshi', EMPLOYER: 'Acme $1 Ltd' }), 'Dear Acme $1 Ltd, from Zainab $& Qureshi and [SCHOOL].');
  assert.equal(checks.substitute('[NAME] [NAME]', { NAME: 'A B' }), 'A B A B');
});

// ---------------------------------------------------------------------------
// The template letter
// ---------------------------------------------------------------------------

test('template: built only from the facts, the same facts give the same letter, and every figure is in the facts', () => {
  const f = facts();
  const letter = buildTemplate(f);
  assert.equal(buildTemplate(facts()), letter);
  assert.equal(checks.figuresCode(letter, f), null, 'no figure that is not in the facts');
  assert.match(letter, /^Dear Sir or Madam,/);
  assert.match(letter, /1 March 2027 and to leave on 15 March 2027, a stay of 14 nights/);
  assert.match(letter, /I am a national of Pakistan and I live in Pakistan/);
  assert.match(letter, /I work for \[EMPLOYER\] since March 2019/);
  assert.match(letter, /My income from work is 475,000 PKR each month after tax/);
  assert.match(letter, /I will be travelling with 2 other people/);
  assert.match(letter, /Yours faithfully,\n\n\[NAME\]$/);
  assert.equal(letter.includes('Zainab'), false, 'names are still placeholders until the server puts them in');
  assert.equal(/\[not provided/.test(letter), false, 'nothing essential is missing here');
});

test('template: a missing essential fact is a visible gap, never a guess; a missing optional fact is simply left out', () => {
  const sparse = factsModule.buildFacts(engine.config, { q2_1: 'Zainab', q2_2: 'Qureshi', q6_3: { amount: 1500, currency: 'GBP' } }, { submittedAt: SUBMITTED });
  const letter = buildTemplate(sparse);
  assert.match(letter, /\[not provided: planned arrival date\]/);
  assert.match(letter, /\[not provided: planned departure date\]/);
  assert.match(letter, /\[not provided: main reason for the visit\]/);
  assert.match(letter, /\[not provided: nationality\]/);
  assert.match(letter, /I plan to spend £1,500 on my visit/);
  assert.equal(/employer|savings|dependants|visited/i.test(letter.replace('Yours faithfully', '')), false, 'sentences about missing facts are not written');
  const nobody = buildTemplate(factsModule.buildFacts(engine.config, {}, {}));
  assert.match(nobody, /\[not provided: applicant's name\]/);
});

test('template: after the real values are put in, the name and employer are in the letter', () => {
  const f = facts();
  const letter = checks.substitute(buildTemplate(f), f.tokens);
  assert.match(letter, /I work for Acme Secret Ltd since March 2019/);
  assert.match(letter, /Yours faithfully,\n\nZainab Qureshi$/);
});

// ---------------------------------------------------------------------------
// Settings and the production guard
// ---------------------------------------------------------------------------

test('settings: off unless AI_ENABLED is exactly "true"; the model default lives in one place; limits default and parse', () => {
  const base = { AI_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_test_key_value' };
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true', 'yes']) {
    assert.equal(aiUnavailableCode(readAiSettings({ ...base, AI_ENABLED: value })), 'AI_DISABLED', String(value));
  }
  assert.equal(aiUnavailableCode(readAiSettings({ ...base, AI_ENABLED: 'true' })), null);
  const s = readAiSettings({ ...base, AI_ENABLED: 'true' });
  assert.equal(s.model, DEFAULT_GROQ_MODEL);
  assert.equal(DEFAULT_GROQ_MODEL, 'openai/gpt-oss-120b');
  assert.equal(s.dailyLimit, 200);
  assert.equal(readAiSettings({ ...base, AI_ENABLED: 'true', GROQ_MODEL: ' some/model ' }).model, 'some/model');
  assert.equal(readAiSettings({ AI_DAILY_LIMIT: '50' }).dailyLimit, 50);
  assert.equal(readAiSettings({ AI_DAILY_LIMIT: '-3' }).dailyLimit, 200);
  assert.equal(readAiSettings({ AI_DAILY_LIMIT: 'lots' }).dailyLimit, 200);
  assert.equal(aiUnavailableCode(readAiSettings({ AI_ENABLED: 'true', AI_PROVIDER: 'groq' })), 'AI_NOT_CONFIGURED', 'no key');
  assert.equal(aiUnavailableCode(readAiSettings({ AI_ENABLED: 'true', AI_PROVIDER: 'other', GROQ_API_KEY: 'k' })), 'AI_NOT_CONFIGURED', 'unknown provider');
  // The model name and the address are written in the config file only.
  const others = ['services/aiService.js', 'services/aiProviders/groq.js', 'services/touristVisaCoverLetterService.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  assert.equal(others.includes('gpt-oss'), false);
  assert.equal(others.includes('api.groq.com'), false);
});

test('production guard: in production the AI refuses to run without AI_DATA_TERMS_CONFIRMED exactly "true"', () => {
  const env = { AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'k' };
  assert.equal(aiUnavailableCode(readAiSettings({ ...env, NODE_ENV: 'production' })), 'AI_TERMS_NOT_CONFIRMED');
  for (const value of ['', 'false', 'TRUE', '1', ' true', 'yes']) assert.equal(aiUnavailableCode(readAiSettings({ ...env, NODE_ENV: 'production', AI_DATA_TERMS_CONFIRMED: value })), 'AI_TERMS_NOT_CONFIRMED', value);
  assert.equal(aiUnavailableCode(readAiSettings({ ...env, NODE_ENV: 'production', AI_DATA_TERMS_CONFIRMED: 'true' })), null);
  assert.equal(aiUnavailableCode(readAiSettings({ ...env, NODE_ENV: 'development' })), null, 'locally with dummy data it is fine without it');
  assert.equal(aiUnavailableCode(readAiSettings({ ...env })), null);
});

// ---------------------------------------------------------------------------
// The adapter (fake fetch, fake clock, no network)
// ---------------------------------------------------------------------------

const KEY = 'gsk_TESTONLY_KEY_0123456789';
const ENV = { AI_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: KEY, NODE_ENV: 'test' };
const chat = (content, extra = {}) => new Response(JSON.stringify({ model: 'x/y', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', ...extra }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const status = (code, headers = {}, body = 'ERROR-BODY-SECRET-TEXT') => new Response(body, { status: code, headers });

function rig({ env = ENV, script = [], limits = {} } = {}) {
  const calls = [];
  const sleeps = [];
  const clock = { now: 1000000 };
  const service = new AiService({ env: () => env, limits: { ...LIMITS, ...limits }, now: () => clock.now, sleep: async (ms) => { sleeps.push(ms); } });
  service.fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    return typeof next === 'function' ? next(url, init) : next;
  };
  return { service, calls, sleeps, clock };
}
const ask = (service) => service.generate({ system: 'SYSTEM-PROMPT-SECRET', user: 'USER-PROMPT-SECRET' });
const codeOf = async (promise) => { try { await promise; return 'NO_ERROR'; } catch (e) { assert.ok(e instanceof AiError, String(e)); return e.code; } };

test('adapter: success. One POST to the fixed address with the key in the Authorization header only, and the model from the settings', async () => {
  const { service, calls } = rig({ script: [chat('A letter.')] });
  const result = await ask(service);
  assert.deepEqual(result, { text: 'A letter.', model: DEFAULT_GROQ_MODEL, provider: 'groq' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, GROQ_URL);
  assert.equal(GROQ_URL, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error', 'a redirect is a failure');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, DEFAULT_GROQ_MODEL);
  assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
  assert.equal(body.stream, false);
  assert.equal(calls[0].init.body.includes(KEY), false, 'the key is not in the body');
  assert.equal(Object.keys(calls[0].init.headers).some((h) => /cookie/i.test(h)), false);
  // A model set in the environment is used.
  const other = rig({ env: { ...ENV, GROQ_MODEL: 'some/other-model' }, script: [chat('x')] });
  assert.equal((await ask(other.service)).model, 'some/other-model');
  assert.equal(JSON.parse(other.calls[0].init.body).model, 'some/other-model');
});

test('adapter: off, not configured or (in production) without the data-terms confirmation: the provider is never contacted', async () => {
  for (const [env, code] of [
    [{ ...ENV, AI_ENABLED: 'false' }, 'AI_DISABLED'],
    [{ ...ENV, GROQ_API_KEY: '' }, 'AI_NOT_CONFIGURED'],
    [{ ...ENV, NODE_ENV: 'production' }, 'AI_TERMS_NOT_CONFIRMED'],
  ]) {
    const { service, calls } = rig({ env, script: [chat('x')] });
    try { await ask(service); assert.fail('should refuse'); } catch (e) { assert.equal(e.code, code); assert.equal(e.attempted, false); }
    assert.equal(calls.length, 0);
    assert.equal(service.unavailable(), code);
  }
  const ok = rig({ env: { ...ENV, NODE_ENV: 'production', AI_DATA_TERMS_CONFIRMED: 'true' }, script: [chat('fine')] });
  assert.equal((await ask(ok.service)).text, 'fine');
});

test('adapter: a 429 is retried once, after the wait the provider asks for if it is 5 seconds or less', async () => {
  const waits = rig({ script: [status(429, { 'retry-after': '2' }), chat('ok')] });
  assert.equal((await ask(waits.service)).text, 'ok');
  assert.deepEqual(waits.sleeps, [2000]);
  assert.equal(waits.calls.length, 2);

  const five = rig({ script: [status(429, { 'retry-after': '5' }), chat('ok')] });
  await ask(five.service);
  assert.deepEqual(five.sleeps, [5000]);

  const unknown = rig({ script: [status(429), chat('ok')] });
  await ask(unknown.service);
  assert.deepEqual(unknown.sleeps, [LIMITS.retryDelayMs], 'no Retry-After: the default wait');

  const tooLong = rig({ script: [status(429, { 'retry-after': '30' }), chat('ok')] });
  assert.equal(await codeOf(ask(tooLong.service)), 'AI_RATE_LIMITED');
  assert.equal(tooLong.calls.length, 1, 'asked to wait more than 5 seconds: no retry');
  assert.deepEqual(tooLong.sleeps, []);

  const twice = rig({ script: [status(429, { 'retry-after': '1' }), status(429, { 'retry-after': '1' }), chat('ok')] });
  assert.equal(await codeOf(ask(twice.service)), 'AI_RATE_LIMITED');
  assert.equal(twice.calls.length, 2, 'only one retry');
});

test('adapter: a 5xx is retried once; other failures are not retried', async () => {
  const recovers = rig({ script: [status(503), chat('ok')] });
  assert.equal((await ask(recovers.service)).text, 'ok');
  assert.equal(recovers.calls.length, 2);

  const stays = rig({ script: [status(500), status(502), chat('ok')] });
  assert.equal(await codeOf(ask(stays.service)), 'AI_PROVIDER_ERROR');
  assert.equal(stays.calls.length, 2);

  for (const code of [400, 401, 403, 404]) {
    const r = rig({ script: [status(code), chat('ok')] });
    assert.equal(await codeOf(ask(r.service)), 'AI_PROVIDER_REJECTED', String(code));
    assert.equal(r.calls.length, 1, `${code} is not retried`);
  }
  const network = rig({ script: [() => { throw new TypeError('socket hang up SECRET-NETWORK-TEXT'); }, chat('ok')] });
  assert.equal(await codeOf(ask(network.service)), 'AI_NETWORK');
  assert.equal(network.calls.length, 1, 'a network error is not retried');
});

test('adapter: timeout. A request that does not answer in time fails with AI_TIMEOUT (and is aborted)', async () => {
  let aborted = false;
  const { service } = rig({ limits: { timeoutMs: 30 }, script: [(url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }); })] });
  assert.equal(await codeOf(ask(service)), 'AI_TIMEOUT');
  assert.equal(aborted, true);
  assert.equal(LIMITS.timeoutMs, 20000, 'the real limit is 20 seconds');
  // A body that never finishes counts too.
  const slowBody = rig({ limits: { timeoutMs: 30 }, script: [() => new Response(new ReadableStream({ start() { /* never ends */ } }), { status: 200 })] });
  assert.equal(await codeOf(ask(slowBody.service)), 'AI_TIMEOUT');
});

test('adapter: answers that are not a letter: bad JSON, an odd shape, empty text, cut off, too large', async () => {
  const cases = [
    [new Response('not json', { status: 200 }), 'AI_BAD_RESPONSE'],
    [new Response(JSON.stringify({ choices: [] }), { status: 200 }), 'AI_BAD_RESPONSE'],
    [new Response(JSON.stringify({ choices: [{ message: { content: 42 } }] }), { status: 200 }), 'AI_BAD_RESPONSE'],
    [chat('   '), 'AI_BAD_RESPONSE'],
    [chat('half a letter', { finish_reason: 'length' }), 'AI_TRUNCATED'],
    [new Response('x'.repeat(300 * 1024), { status: 200 }), 'AI_BAD_RESPONSE'],
    [new Response('{}', { status: 200, headers: { 'content-length': String(10 * 1024 * 1024) } }), 'AI_BAD_RESPONSE'],
  ];
  for (const [response, code] of cases) {
    const { service, calls } = rig({ script: [response] });
    assert.equal(await codeOf(ask(service)), code);
    assert.equal(calls.length, 1, 'a bad answer is not retried');
  }
});

test('adapter: the circuit breaker. After 3 failures in a row the AI is skipped for 5 minutes, then tried again; a success resets the count', async () => {
  const { service, calls, clock } = rig({ script: [status(401)] });
  for (let i = 0; i < 3; i += 1) assert.equal(await codeOf(ask(service)), 'AI_PROVIDER_REJECTED');
  assert.equal(calls.length, 3);
  assert.equal(service.unavailable(), 'AI_CIRCUIT_OPEN');
  try { await ask(service); assert.fail(); } catch (e) { assert.equal(e.code, 'AI_CIRCUIT_OPEN'); assert.equal(e.attempted, false); }
  assert.equal(calls.length, 3, 'skipped: the provider was not asked');
  clock.now += 5 * 60 * 1000 - 1;
  assert.equal(await codeOf(ask(service)), 'AI_CIRCUIT_OPEN');
  clock.now += 2;
  assert.equal(service.unavailable(), null);
  assert.equal(await codeOf(ask(service)), 'AI_PROVIDER_REJECTED', 'asked again after 5 minutes');
  assert.equal(calls.length, 4);

  // Two failures then a success: the count starts again.
  const mixed = rig({ script: [status(401), status(401), chat('ok'), status(401), status(401), chat('ok')] });
  await codeOf(ask(mixed.service)); await codeOf(ask(mixed.service));
  assert.equal((await ask(mixed.service)).text, 'ok');
  await codeOf(ask(mixed.service)); await codeOf(ask(mixed.service));
  assert.equal(mixed.service.unavailable(), null, 'two in a row after a success is not three');
  assert.equal((await ask(mixed.service)).text, 'ok');
});

test('adapter: nothing from a prompt, an answer, an error body or the key is in an error or a log line', async () => {
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn, debug: console.debug };
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  // The logger prints only in development, so its calls are captured directly: whatever it is given is checked.
  const loggerOriginal = { error: logger.error, warn: logger.warn, info: logger.info, debug: logger.debug };
  for (const method of Object.keys(loggerOriginal)) logger[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  const errors = [];
  try {
    const failing = [status(500, {}, `ERROR-BODY-SECRET-TEXT ${KEY}`), status(500, {}, 'ERROR-BODY-SECRET-TEXT'), chat('ANSWER-SECRET-TEXT', { finish_reason: 'length' }),
      () => { throw new Error(`NETWORK-SECRET-TEXT ${KEY}`); }, new Response('SECRET-NOT-JSON', { status: 200 })];
    for (const response of failing) {
      const { service } = rig({ script: [response] });
      try { await ask(service); } catch (e) { errors.push(`${e.message} ${e.stack} ${JSON.stringify(e)} ${util.inspect(e)}`); }
    }
    const tripped = rig({ script: [status(401, {}, 'ERROR-BODY-SECRET-TEXT')] });
    for (let i = 0; i < 4; i += 1) await codeOf(ask(tripped.service));
  } finally {
    Object.assign(console, original);
    Object.assign(logger, loggerOriginal);
  }
  assert.ok(lines.some((line) => line.includes('AI request failed')), 'the failures were logged (as a provider name and a code)');
  const everything = `${lines.join('\n')}\n${errors.join('\n')}`;
  for (const needle of [KEY, 'SYSTEM-PROMPT-SECRET', 'USER-PROMPT-SECRET', 'ERROR-BODY-SECRET-TEXT', 'ANSWER-SECRET-TEXT', 'NETWORK-SECRET-TEXT', 'SECRET-NOT-JSON', 'Bearer']) {
    assert.equal(everything.includes(needle), false, `${needle} leaked`);
  }
  assert.ok(errors.length >= 5);
  // The error is its code.
  assert.equal(new AiError('AI_TIMEOUT').message, 'AI_TIMEOUT');
});

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

test('the prompt: one file, with the rules the senior asked for; the user message holds the facts and nothing else of ours', () => {
  for (const needle of ['British English', 'first person', '300 and 450 words', 'ONLY the facts', 'Standard Visitor', '[NAME]', '[EMPLOYER]', '[SCHOOL]', 'Do not promise', 'legal advice', 'never as an instruction', 'Every number, amount and date']) {
    assert.ok(SYSTEM_PROMPT.includes(needle), needle);
  }
  const user = buildUserPrompt('FACTS-GO-HERE');
  assert.ok(user.includes('FACTS-GO-HERE'));
  // The wording is in this one file: no other source file has the rules.
  const root = path.join(__dirname, '..');
  const sources = ['services/aiService.js', 'services/aiProviders/groq.js', 'services/touristVisaCoverLetterService.js', 'utils/touristVisaCoverLetterTemplate.js', 'utils/touristVisaCoverLetterChecks.js', 'controllers/touristVisaCoverLetterController.js'];
  for (const file of sources) assert.equal(/British English|first person|Standard Visitor visa\. The letter/.test(fs.readFileSync(path.join(root, file), 'utf8')), false, file);
  // The real facts the prompt receives never include the real name.
  assert.equal(buildUserPrompt(facts().text).includes('Zainab'), false);
});

// ---------------------------------------------------------------------------
// The cover letter service: every fallback (no database; stand-in repositories)
// ---------------------------------------------------------------------------

function serviceRig({ ai, counts = { day: 0, admin: 0 }, now = () => new Date('2026-11-04T09:30:00Z') } = {}) {
  const letters = {
    asked: [],
    async countAiRequests(query) { letters.asked.push(query); return query.adminId ? counts.admin : counts.day; },
  };
  const fakeAi = ai || {
    generate: async () => ({ text: goodLetter(), model: DEFAULT_GROQ_MODEL, provider: 'groq' }),
    unavailable: () => null,
    settings: () => readAiSettings({ ...ENV }),
  };
  return { service: new TouristVisaCoverLetterService({ letters, audit: {}, applications: {}, admin: {}, ai: fakeAi, now }), letters, ai: fakeAi };
}

test('service: a good AI letter is kept as an AI letter, with the real name and employer put in', async () => {
  const { service } = serviceRig();
  const made = await service.compose('admin1', facts());
  assert.equal(made.source, 'ai');
  assert.equal(made.aiAttempted, true);
  assert.equal(made.model, DEFAULT_GROQ_MODEL);
  assert.equal(made.fallbackReason, undefined);
  assert.match(made.text, /Yours faithfully,\n\nZainab Qureshi$/);
  assert.match(made.text, /for Acme Secret Ltd, where/);
  assert.equal(/\[(NAME|EMPLOYER)\]/.test(made.text), false);
});

test('service: the template is the fallback for every kind of AI failure, with a fixed code and whether the provider was asked', async () => {
  const kinds = ['AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_TERMS_NOT_CONFIRMED', 'AI_CIRCUIT_OPEN', 'AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_NETWORK', 'AI_PROVIDER_REJECTED', 'AI_PROVIDER_ERROR', 'AI_BAD_RESPONSE', 'AI_TRUNCATED'];
  for (const code of kinds) {
    for (const attempted of [true, false]) {
      const { service } = serviceRig({ ai: { unavailable: () => null, settings: () => readAiSettings(ENV), generate: async () => { throw new AiError(code, { attempted }); } } });
      const made = await service.compose('admin1', facts());
      assert.equal(made.source, 'template', code);
      assert.equal(made.fallbackReason, code);
      assert.equal(made.aiAttempted, attempted);
      assert.match(made.text, /^Dear Sir or Madam,/);
      assert.match(made.text, /Zainab Qureshi$/);
      assert.ok(FALLBACK_REASONS.includes(made.fallbackReason));
    }
  }
  // An error that is not an AiError is a provider error, and its text is not kept.
  const odd = serviceRig({ ai: { unavailable: () => null, settings: () => readAiSettings(ENV), generate: async () => { throw new Error('SECRET-RAW-ERROR'); } } });
  const made = await odd.service.compose('admin1', facts());
  assert.equal(made.fallbackReason, 'AI_PROVIDER_ERROR');
  assert.equal(JSON.stringify(made).includes('SECRET-RAW-ERROR'), false);
  // Unavailable before any call: the provider is not asked.
  let asked = false;
  const off = serviceRig({ ai: { unavailable: () => 'AI_DISABLED', settings: () => readAiSettings(ENV), generate: async () => { asked = true; return { text: 'x' }; } } });
  const offMade = await off.service.compose('admin1', facts());
  assert.equal(asked, false);
  assert.equal(offMade.fallbackReason, 'AI_DISABLED');
  assert.equal(offMade.aiAttempted, false);
});

test('service: an AI letter that fails the checks is replaced by the template, with the code of the check and the provider counted as asked', async () => {
  const cases = [
    [goodLetter().replace('14 nights', '40 nights'), 'LETTER_NUMBER_NOT_IN_FACTS'],
    [goodLetter().replace('1 March 2027', '9 March 2027'), 'LETTER_DATE_NOT_IN_FACTS'],
    [goodLetter().replace('[NAME]', 'Zainab Qureshi'), 'LETTER_MISSING_TOKEN'],
    [goodLetter().replace('[EMPLOYER]', '[BOSS]'), 'LETTER_UNKNOWN_TOKEN'],
    ['Too short.', 'LETTER_LENGTH'],
    ['', 'LETTER_EMPTY'],
  ];
  for (const [text, code] of cases) {
    const { service } = serviceRig({ ai: { unavailable: () => null, settings: () => readAiSettings(ENV), generate: async () => ({ text, model: DEFAULT_GROQ_MODEL }) } });
    const made = await service.compose('admin1', facts());
    assert.equal(made.source, 'template', code);
    assert.equal(made.fallbackReason, code);
    assert.equal(made.aiAttempted, true);
    assert.equal(JSON.stringify(made).includes('40 nights'), false, 'the rejected letter is not kept');
  }
});

test('service: the daily limit (in total) and the per-administrator limit send the request to the template without asking the provider', async () => {
  let asked = 0;
  const ai = { unavailable: () => null, settings: () => readAiSettings({ ...ENV, AI_DAILY_LIMIT: '200', AI_ADMIN_HOURLY_LIMIT: '15' }), generate: async () => { asked += 1; return { text: goodLetter(), model: 'm' }; } };

  const day = serviceRig({ ai, counts: { day: 200, admin: 0 } });
  let made = await day.service.compose('admin1', facts());
  assert.equal(made.fallbackReason, 'AI_DAILY_LIMIT');
  assert.equal(made.source, 'template');
  assert.equal(made.aiAttempted, false);
  assert.deepEqual(day.letters.asked[0], { since: new Date('2026-11-04T00:00:00Z') }, 'counted since the start of the UTC day');

  const admin = serviceRig({ ai, counts: { day: 5, admin: 15 } });
  made = await admin.service.compose('admin1', facts());
  assert.equal(made.fallbackReason, 'AI_ADMIN_LIMIT');
  assert.equal(admin.letters.asked[1].adminId, 'admin1');
  assert.deepEqual(admin.letters.asked[1].since, new Date('2026-11-04T08:30:00Z'), 'the last hour');
  assert.equal(asked, 0);

  const under = serviceRig({ ai, counts: { day: 199, admin: 14 } });
  made = await under.service.compose('admin1', facts());
  assert.equal(made.source, 'ai');
  assert.equal(asked, 1);
});
