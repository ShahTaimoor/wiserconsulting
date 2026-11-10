'use strict';

// The currency helper's rates (GET /api/tourist-visa/rates): the two providers and the failover between them, what makes an
// answer acceptable, the limits on a provider call, the 12-hour cache and the 7-day stale window, the attribution rule, and
// the route's sign-in, rate limiting and feature gate. A fake fetch and a fake clock are injected: no network is used.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.TOURIST_VISA_ENABLED = 'true';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const config = require('../config/touristVisaRates');
const touristVisaRatesService = require('../services/touristVisaRatesService');
const { TouristVisaRatesService } = touristVisaRatesService;
const touristVisaRoutes = require('../routes/touristVisaRoutes');
const touristVisaBodyParser = require('../middleware/touristVisaBodyParser');
const touristVisaFeatureGate = require('../middleware/touristVisaFeatureGate');
const { apiLimiter } = require('../middleware/rateLimiter');
const { errorHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const SECRET = 'SECRET-PROVIDER-TEXT-4711';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Helpers: provider answers, a fake fetch and a fake clock
// ---------------------------------------------------------------------------

const ALL = Object.fromEntries(config.ALLOWED_CURRENCIES.map((code, i) => [code, 1.5 + i]));
const frankfurterAnswer = (rates = ALL, extra = {}) => ({ amount: 1, base: 'GBP', date: '2026-11-02', rates, ...extra });
const erAnswer = (rates = ALL, extra = {}) => ({ result: 'success', provider: 'x', base_code: 'GBP', time_last_update_unix: Date.UTC(2026, 10, 3) / 1000, rates, ...extra });
const without = (rates, ...codes) => Object.fromEntries(Object.entries(rates).filter(([code]) => !codes.includes(code)));
const json = (body, init = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

/** A fake fetch that answers each provider URL from a script, and remembers every call. */
function rig({ frankfurter, er, now = 1_000_000_000_000 } = {}) {
  const state = { now, calls: [] };
  const script = { frankfurter, er };
  const fetchImpl = async (url, init) => {
    state.calls.push({ url: String(url), init });
    const which = String(url).startsWith('https://api.frankfurter.dev') ? 'frankfurter' : String(url).startsWith('https://open.er-api.com') ? 'er' : 'other';
    let answer = script[which];
    if (typeof answer === 'function') answer = await answer(init, String(url));
    if (answer instanceof Error) throw answer;
    return answer instanceof Response ? answer : json(answer ?? {});
  };
  const service = new TouristVisaRatesService({ fetchImpl, now: () => state.now });
  return { service, state, script, advance: (ms) => { state.now += ms; }, urls: () => state.calls.map((c) => c.url) };
}
const rejectsWith = async (promise, code, status = 503) => {
  await assert.rejects(promise, (e) => { assert.equal(e.code, code); assert.equal(e.statusCode, status); return true; });
};

function capture() {
  const lines = [];
  const spies = ['info', 'warn', 'error', 'debug'].filter((m) => typeof logger[m] === 'function').map((m) => mock.method(logger, m, (...a) => { lines.push([m, ...a]); }));
  const consoleSpies = ['log', 'info', 'warn', 'error'].map((m) => mock.method(console, m, (...a) => { lines.push([m, ...a]); }));
  return { lines, restore: () => [...spies, ...consoleSpies].forEach((s) => s.mock.restore()) };
}

// ---------------------------------------------------------------------------
// The constants
// ---------------------------------------------------------------------------

test('the allowlist is exactly the 29 agreed currencies, PKR is the required one, and the provider URLs are fixed constants', () => {
  assert.deepEqual([...config.ALLOWED_CURRENCIES], ['PKR', 'USD', 'EUR', 'AED', 'SAR', 'INR', 'CAD', 'AUD', 'CNY', 'JPY', 'TRY', 'QAR', 'KWD', 'OMR', 'BHD', 'BDT', 'LKR', 'NPR', 'MYR', 'SGD', 'CHF', 'NOK', 'SEK', 'DKK', 'ZAR', 'NZD', 'EGP', 'KES', 'NGN']);
  assert.equal(new Set(config.ALLOWED_CURRENCIES).size, 29);
  assert.equal(config.REQUIRED_CURRENCY, 'PKR');
  assert.deepEqual(config.PROVIDERS.map((p) => p.id), ['frankfurter', 'exchangerate-api'], 'tried in this order');
  assert.ok(config.PROVIDERS[0].url.startsWith('https://api.frankfurter.dev/v1/latest?base=GBP&symbols=PKR,USD,'));
  assert.equal(config.PROVIDERS[1].url, 'https://open.er-api.com/v6/latest/GBP');
  assert.equal(config.PROVIDERS[0].attribution, null);
  assert.deepEqual(config.PROVIDERS[1].attribution, { text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' });
  assert.deepEqual([config.LIMITS.timeoutMs, config.LIMITS.maxBodyBytes, config.CACHE.ttlMs, config.CACHE.maxStaleMs], [5000, 65536, 12 * HOUR, 7 * DAY]);
  assert.throws(() => { config.ALLOWED_CURRENCIES.push('XXX'); }, TypeError, 'the allowlist cannot be changed at run time');
});

// ---------------------------------------------------------------------------
// The providers and the failover
// ---------------------------------------------------------------------------

test('the primary provider answers: its rates are used, only allowlisted codes are kept, and there is no attribution', async () => {
  const { service, urls } = rig({ frankfurter: frankfurterAnswer({ ...ALL, XXX: 9, HKD: 7.8, EUR: 1.2 }) });
  const result = await service.get();
  assert.deepEqual(Object.keys(result).sort(), ['asOf', 'attribution', 'base', 'rates', 'stale']);
  assert.equal(result.base, 'GBP');
  assert.equal(result.asOf, '2026-11-02');
  assert.equal(result.stale, false);
  assert.equal(result.attribution, null);
  assert.deepEqual(Object.keys(result.rates).sort(), [...config.ALLOWED_CURRENCIES].sort(), 'exactly the allowlist: XXX and HKD are not in it');
  assert.equal(result.rates.EUR, 1.2);
  assert.equal(urls().length, 1, 'the second provider was not asked');
});

test('only the codes a provider actually returns are included', async () => {
  const some = { PKR: 370.9, USD: 1.34, EUR: 1.19 };
  const { service } = rig({ frankfurter: frankfurterAnswer(some) });
  assert.deepEqual((await service.get()).rates, some);
});

test('a primary answer without PKR is a failed answer: the second provider is asked, and its attribution is returned', async () => {
  const { service, urls } = rig({ frankfurter: frankfurterAnswer(without(ALL, 'PKR')), er: erAnswer() });
  const result = await service.get();
  assert.deepEqual(urls(), [config.PROVIDERS[0].url, config.PROVIDERS[1].url]);
  assert.equal(result.rates.PKR, ALL.PKR);
  assert.deepEqual(result.attribution, { text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' });
  assert.equal(result.asOf, '2026-11-03', 'the date comes from the provider that answered');
  assert.equal(result.stale, false);
});

test('a failing primary (a network error, a 500, a 404, an empty body, not JSON) falls back to the second provider', async () => {
  for (const bad of [new TypeError('fetch failed'), json({}, { status: 500 }), json({}, { status: 404 }), new Response(null, { status: 204 }), json(''), json('<html>not json</html>'), json(`${SECRET}`)]) {
    const { service, urls } = rig({ frankfurter: bad, er: erAnswer() });
    const result = await service.get();
    assert.equal(result.attribution.text, 'Rates By Exchange Rate API');
    assert.equal(urls().length, 2);
  }
});

test('PKR missing from both providers: nothing is served, 503 RATES_UNAVAILABLE', async () => {
  const { service } = rig({ frankfurter: frankfurterAnswer(without(ALL, 'PKR')), er: erAnswer(without(ALL, 'PKR')) });
  await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
});

test('an answer is refused for a bad number in any allowlisted rate: zero, negative, null, text, not a number, infinite', async () => {
  const badValues = [0, -1, null, '370', 'abc', [], {}, true, 1e999];
  for (const value of badValues) {
    const raw = JSON.stringify(frankfurterAnswer({ ...ALL, USD: 1 })).replace('"USD":1', `"USD":${value === 1e999 ? '1e999' : JSON.stringify(value)}`);
    const { service, urls } = rig({ frankfurter: json(raw), er: erAnswer() });
    const result = await service.get();
    assert.equal(result.attribution.text, 'Rates By Exchange Rate API', `a bad ${JSON.stringify(value)} in the primary answer made it fail`);
    assert.equal(urls().length, 2);
  }
  // a bad PKR itself, from both
  const { service } = rig({ frankfurter: frankfurterAnswer({ ...ALL, PKR: 0 }), er: erAnswer({ ...ALL, PKR: -5 }) });
  await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
  // a bad number for a currency that is NOT allowlisted is simply not looked at
  const fine = rig({ frankfurter: frankfurterAnswer({ ...ALL, HKD: -3, XXX: 'oops' }) });
  assert.equal((await fine.service.get()).attribution, null);
});

test('an answer for another base, with no date, no rates, or not a success is refused', async () => {
  const cases = [
    [frankfurterAnswer(ALL, { base: 'EUR' }), 'frankfurter'], [frankfurterAnswer(ALL, { date: undefined }), 'frankfurter'], [frankfurterAnswer(ALL, { date: '02/11/2026' }), 'frankfurter'],
    [{ amount: 1, base: 'GBP', date: '2026-11-02' }, 'frankfurter'], [{ ...frankfurterAnswer(), rates: [1, 2] }, 'frankfurter'], [[], 'frankfurter'], [null, 'frankfurter'], ['x', 'frankfurter'],
  ];
  for (const [answer] of cases) {
    const { service } = rig({ frankfurter: json(JSON.stringify(answer ?? null)), er: new TypeError('down') });
    await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
  }
  for (const answer of [erAnswer(ALL, { result: 'error' }), erAnswer(ALL, { base_code: 'USD' }), erAnswer(ALL, { time_last_update_unix: 'x' }), erAnswer(ALL, { time_last_update_unix: 0 }), erAnswer(ALL, { time_last_update_unix: undefined })]) {
    const { service } = rig({ frankfurter: new TypeError('down'), er: answer });
    await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
  }
});

test('the date of the second provider is written as YYYY-MM-DD from its timestamp', async () => {
  const { service } = rig({ frankfurter: new TypeError('down'), er: erAnswer(ALL, { time_last_update_unix: Date.UTC(2027, 0, 5, 23, 59, 59) / 1000 }) });
  assert.equal((await service.get()).asOf, '2027-01-05');
});

// ---------------------------------------------------------------------------
// What limits a call to a provider
// ---------------------------------------------------------------------------

test('an oversized answer is refused, whether it declares its size or just keeps coming', async () => {
  const big = JSON.stringify({ ...frankfurterAnswer(), pad: 'x'.repeat(config.LIMITS.maxBodyBytes + 10) });
  const declared = new Response(big, { status: 200, headers: { 'content-length': String(big.length) } });
  const undeclared = new Response(new ReadableStream({ start(c) { const chunk = new TextEncoder().encode(big); for (let i = 0; i < chunk.length; i += 8000) c.enqueue(chunk.slice(i, i + 8000)); c.close(); } }), { status: 200 });
  for (const answer of [declared, undeclared]) {
    const { service, urls } = rig({ frankfurter: answer, er: erAnswer() });
    assert.equal((await service.get()).attribution.text, 'Rates By Exchange Rate API');
    assert.equal(urls().length, 2);
  }
  // a normal answer well under the cap is fine
  assert.ok(JSON.stringify(frankfurterAnswer()).length < 1000);
});

test('a provider that never answers is given up on after the timeout, and the call is cancelled', async () => {
  let signal;
  const hang = (init) => { signal = init.signal; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))); };
  const state = { calls: 0 };
  const service = new TouristVisaRatesService({
    fetchImpl: async (url, init) => { state.calls += 1; return state.calls === 1 ? hang(init) : json(erAnswer()); },
    limits: { ...config.LIMITS, timeoutMs: 40 },
  });
  const started = Date.now();
  const result = await service.get();
  assert.ok(Date.now() - started < 3000, 'it did not wait for ever');
  assert.equal(result.attribution.text, 'Rates By Exchange Rate API');
  assert.equal(signal.aborted, true);
});

test('a provider that ignores the cancellation still cannot hold the request up', async () => {
  const service = new TouristVisaRatesService({ fetchImpl: () => new Promise(() => {}), limits: { ...config.LIMITS, timeoutMs: 30 } });
  await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
});

test('redirects: a redirect to another host is refused; one inside the same host is followed, a few at most', async () => {
  const redirect = (location, status = 302) => new Response(null, { status, headers: location === undefined ? {} : { location } });
  for (const bad of [redirect('https://evil.example.com/rates'), redirect('http://api.frankfurter.dev/v1/latest'), redirect('https://api.frankfurter.dev.evil.com/x'), redirect(undefined), redirect('//evil.example.com/x'), redirect('https://api.frankfurter.dev:8443/x')]) {
    const { service, urls } = rig({ frankfurter: bad, er: erAnswer() });
    await service.get();
    assert.ok(urls().every((u) => /^https:\/\/(api\.frankfurter\.dev|open\.er-api\.com)\//.test(u)), 'nothing but the two providers was ever asked: ' + urls().join(' '));
    assert.equal(urls().length, 2, 'the redirect was not followed; the second provider answered');
  }
  let hops = 0;
  const rig2 = rig({ frankfurter: () => (hops++ === 0 ? redirect('/v1/latest?base=GBP') : json(frankfurterAnswer())) });
  assert.equal((await rig2.service.get()).attribution, null);
  assert.equal(rig2.urls().length, 2);
  assert.ok(rig2.urls().every((u) => u.startsWith('https://api.frankfurter.dev/')));
  const loop = rig({ frankfurter: () => redirect('/v1/latest'), er: erAnswer() });
  assert.equal((await loop.service.get()).attribution.text, 'Rates By Exchange Rate API');
});

test('every call is a plain GET of a fixed URL: no body, no cookie, no token, no header but Accept, redirects handled by us', async () => {
  const { service, state } = rig({ frankfurter: frankfurterAnswer(without(ALL, 'PKR')), er: erAnswer() });
  await service.get();
  for (const call of state.calls) {
    assert.deepEqual(Object.keys(call.init).sort(), ['headers', 'method', 'redirect', 'signal']);
    assert.equal(call.init.method, 'GET');
    assert.equal(call.init.redirect, 'manual');
    assert.deepEqual(call.init.headers, { Accept: 'application/json' });
    assert.ok(config.PROVIDERS.some((p) => p.url === call.url), call.url);
  }
});

// ---------------------------------------------------------------------------
// The cache, the stale window, the back-off
// ---------------------------------------------------------------------------

test('cache: the rates are fetched once and kept for 12 hours, then fetched again', async () => {
  const { service, urls, advance, script } = rig({ frankfurter: frankfurterAnswer({ ...ALL, EUR: 1.1 }) });
  assert.equal((await service.get()).rates.EUR, 1.1);
  advance(12 * HOUR - 1000);
  assert.equal((await service.get()).rates.EUR, 1.1);
  assert.equal((await service.get()).stale, false);
  assert.equal(urls().length, 1, 'served from memory');
  script.frankfurter = frankfurterAnswer({ ...ALL, EUR: 1.3 });
  advance(1000);
  assert.equal((await service.get()).rates.EUR, 1.3, 'after 12 hours it asks again');
  assert.equal(urls().length, 2);
});

test('stale: if a refresh fails the last good rates are served marked stale, with their own date and attribution, for up to 7 days', async () => {
  const { service, advance, script } = rig({ frankfurter: new TypeError('down'), er: erAnswer() });
  const first = await service.get();
  assert.equal(first.stale, false);
  script.er = json(`${SECRET}`, { status: 500 });
  advance(13 * HOUR);
  const stale = await service.get();
  assert.equal(stale.stale, true);
  assert.equal(stale.asOf, first.asOf, 'the date of the data, not of today');
  assert.deepEqual(stale.rates, first.rates);
  assert.equal(stale.attribution.text, 'Rates By Exchange Rate API');
  advance(6 * DAY);
  assert.equal((await service.get()).stale, true, 'still within 7 days of when it was fetched');
  advance(DAY);
  await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
});

test('stale: when a provider recovers the next refresh replaces the old rates and clears the flag', async () => {
  const { service, advance, script } = rig({ frankfurter: new TypeError('down'), er: erAnswer({ ...ALL, USD: 1.2 }) });
  await service.get();
  script.er = new TypeError('down');
  advance(13 * HOUR);
  assert.equal((await service.get()).stale, true);
  script.er = erAnswer({ ...ALL, USD: 1.4 });
  advance(config.CACHE.failureBackoffMs);
  const recovered = await service.get();
  assert.equal(recovered.stale, false);
  assert.equal(recovered.rates.USD, 1.4);
});

test('back-off: after a failure the providers are not asked again for five minutes, so a broken provider is not hammered', async () => {
  const { service, urls, advance, script } = rig({ frankfurter: new TypeError('down'), er: new TypeError('down') });
  await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
  assert.equal(urls().length, 2);
  for (let i = 0; i < 5; i += 1) await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
  assert.equal(urls().length, 2, 'no further asks while backing off');
  advance(config.CACHE.failureBackoffMs);
  script.er = erAnswer();
  assert.equal((await service.get()).rates.PKR, ALL.PKR);
  assert.equal(urls().length, 4);
});

test('requests at the same moment share one refresh', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service, urls } = rig({ frankfurter: async () => { await gate; return json(frankfurterAnswer()); } });
  const asks = [service.get(), service.get(), service.get(), service.get()];
  release();
  const results = await Promise.all(asks);
  assert.equal(urls().length, 1);
  assert.ok(results.every((r) => r.rates.PKR === ALL.PKR));
});

test('what is returned is a copy: changing it cannot change the cached rates', async () => {
  const { service } = rig({ frankfurter: frankfurterAnswer() });
  const first = await service.get();
  first.rates.PKR = 1;
  first.asOf = 'x';
  const second = await service.get();
  assert.equal(second.rates.PKR, ALL.PKR);
  assert.equal(second.asOf, '2026-11-02');
});

// ---------------------------------------------------------------------------
// Errors and logs
// ---------------------------------------------------------------------------

test('a provider failure leaves only a short fixed line with the provider name: never its body, status text or error', async () => {
  const log = capture();
  try {
    const { service } = rig({ frankfurter: json(`{"message":"${SECRET}"}`, { status: 502, statusText: SECRET }), er: Object.assign(new TypeError(`connect ECONNREFUSED ${SECRET}`), { cause: SECRET }) });
    await rejectsWith(service.get(), 'RATES_UNAVAILABLE');
  } finally { log.restore(); }
  const text = JSON.stringify(log.lines);
  assert.equal(text.includes(SECRET), false);
  assert.match(text, /Tourist Visa rates provider failed/);
  assert.match(text, /frankfurter/);
  assert.match(text, /exchangerate-api/);
  assert.equal(log.lines.some((l) => l.length > 3), false, 'a message and at most a small object');
});

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

let mongod;
const servers = [];
let userCounter = 0;
before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, { timeout: 120000 });
after(async () => {
  for (const s of servers) await new Promise((resolve) => s.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

async function listen(app) {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
/** The app wired the way index.js wires it: the gate that allows the status, the parsers, the real general rate limiter, the router. */
function indexLikeApp() {
  const app = express();
  app.use('/api/tourist-visa', touristVisaFeatureGate.allowingStatus);
  app.use('/api/tourist-visa', touristVisaBodyParser);
  app.use(express.json());
  app.use('/api', apiLimiter);
  app.use('/api/tourist-visa', touristVisaRoutes);
  app.use(errorHandler);
  return app;
}
async function makeUser(role = 0, name = 'Rates Test Person') {
  userCounter += 1;
  const user = await User.create({ name: `${name} ${userCounter}`, email: `test.rates.${userCounter}@example.com`, password: 'not-a-real-password', role });
  return { user, token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}
const getRates = async (base, { token, path = '/rates', headers = {} } = {}) => {
  const res = await fetch(`${base}/api/tourist-visa${path}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body, text, headers: res.headers };
};
/** Puts a fake into the shared service for one test, and puts everything back. */
function useFake(fake) {
  const s = touristVisaRatesService;
  const saved = { fetchImpl: s.fetchImpl, now: s.now, current: s.current, retryAt: s.retryAt, inFlight: s.inFlight };
  s.fetchImpl = fake.fetchImpl; s.now = fake.now; s.current = null; s.retryAt = 0; s.inFlight = null;
  return () => Object.assign(s, saved);
}

test('route: it needs a signed-in user (401 without or with a bad token), then returns the rates to an applicant and to an administrator', async () => {
  const rigged = rig({ frankfurter: frankfurterAnswer(without(ALL, 'PKR')), er: erAnswer() });
  const restore = useFake(rigged.service);
  try {
    const base = await listen(indexLikeApp());
    assert.equal((await getRates(base)).status, 401);
    assert.equal((await getRates(base, { token: 'not-a-token' })).status, 401);
    assert.equal(rigged.urls().length, 0, 'nobody who is not signed in can make the server ask a provider');
    for (const person of [await makeUser(0), await makeUser(1)]) {
      const res = await getRates(base, { token: person.token });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.body.success, true);
      assert.deepEqual(Object.keys(res.body.data).sort(), ['asOf', 'attribution', 'base', 'rates', 'stale']);
      assert.equal(res.body.data.base, 'GBP');
      assert.equal(res.body.data.rates.PKR, ALL.PKR);
      assert.equal(res.body.data.attribution.url, 'https://www.exchangerate-api.com');
      assert.equal(res.headers.get('cache-control'), 'private, max-age=300');
    }
  } finally { restore(); }
});


test('route: while the feature is closed it answers 404 FEATURE_CLOSED before sign-in, for everyone, and asks no provider', async () => {
  const rigged = rig({ frankfurter: frankfurterAnswer() });
  const restore = useFake(rigged.service);
  const was = process.env.TOURIST_VISA_ENABLED;
  try {
    const base = await listen(indexLikeApp());
    const { token } = await makeUser(1);
    for (const value of [undefined, '', 'false', 'TRUE']) {
      if (value === undefined) delete process.env.TOURIST_VISA_ENABLED; else process.env.TOURIST_VISA_ENABLED = value;
      for (const t of [undefined, token, 'bad']) {
        const res = await getRates(base, { token: t });
        assert.deepEqual([res.status, res.body && res.body.code], [404, 'FEATURE_CLOSED']);
      }
    }
    assert.equal(rigged.urls().length, 0);
  } finally { process.env.TOURIST_VISA_ENABLED = was; restore(); }
});

test('route: when there are no rates to give the answer is a plain 503 RATES_UNAVAILABLE, with nothing from a provider in it or in the log', async () => {
  const rigged = rig({ frankfurter: json(`{"error":"${SECRET}"}`, { status: 500, statusText: SECRET }), er: new TypeError(`boom ${SECRET}`) });
  const restore = useFake(rigged.service);
  const log = capture();
  let res;
  try {
    const base = await listen(indexLikeApp());
    const { token } = await makeUser();
    res = await getRates(base, { token });
  } finally { log.restore(); restore(); }
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'RATES_UNAVAILABLE');
  assert.equal(res.text.includes(SECRET), false);
  assert.equal(JSON.stringify(log.lines).includes(SECRET), false);
});

test('route: stale data is served marked stale', async () => {
  const rigged = rig({ frankfurter: new TypeError('down'), er: erAnswer() });
  const restore = useFake(rigged.service);
  try {
    const base = await listen(indexLikeApp());
    const { token } = await makeUser();
    assert.equal((await getRates(base, { token })).body.data.stale, false);
    rigged.script.er = new TypeError('down');
    rigged.advance(13 * HOUR);
    const stale = await getRates(base, { token });
    assert.equal(stale.status, 200);
    assert.equal(stale.body.data.stale, true);
    assert.equal(stale.body.data.asOf, '2026-11-03');
  } finally { restore(); }
});

test('route: nothing about the user or the request reaches a provider: query, headers, cookies, token, name and email are ignored', async () => {
  const rigged = rig({ frankfurter: frankfurterAnswer(without(ALL, 'PKR')), er: erAnswer() });
  const restore = useFake(rigged.service);
  try {
    const base = await listen(indexLikeApp());
    const { token, user } = await makeUser(0, 'Distinctive Applicant Name');
    const res = await getRates(base, { token, path: `/rates?currency=EVIL&url=http://evil.example.com&base=USD&q=${user.email}`, headers: { Cookie: `session=${token}`, 'X-Forwarded-For': '203.0.113.9', 'X-Probe': user.email } });
    assert.equal(res.status, 200);
    const sent = JSON.stringify(rigged.state.calls.map((c) => ({ url: c.url, init: { ...c.init, signal: undefined } })));
    for (const needle of [token, user.email, 'Distinctive', 'EVIL', 'evil.example', '203.0.113', String(user._id), 'session=']) assert.equal(sent.includes(needle), false, `${needle} was sent to a provider`);
    assert.deepEqual(rigged.urls(), [config.PROVIDERS[0].url, config.PROVIDERS[1].url]);
  } finally { restore(); }
});

test('route: it is a GET only; nothing else is accepted on that path', async () => {
  const restore = useFake(rig({ frankfurter: frankfurterAnswer() }).service);
  try {
    const base = await listen(indexLikeApp());
    const { token } = await makeUser();
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await fetch(`${base}/api/tourist-visa/rates`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(res.status, 404, method);
    }
    assert.equal((await getRates(base, { token, path: '/rates/extra' })).status, 404);
  } finally { restore(); }
});

// Last on purpose: it uses up the general rate limiter that the tests above share (one process, one address).
test('route: the general rate limiter applies (its headers are there, and the limit is enforced)', async () => {
  const rigged = rig({ frankfurter: frankfurterAnswer() });
  const restore = useFake(rigged.service);
  try {
    const base = await listen(indexLikeApp());
    const { token } = await makeUser();
    const first = await getRates(base, { token });
    assert.ok(first.headers.get('ratelimit-limit') || first.headers.get('x-ratelimit-limit'));
    let blocked = null;
    for (let i = 0; i < 110 && !blocked; i += 1) {
      const res = await getRates(base, { token });
      if (res.status === 429) blocked = res;
    }
    assert.ok(blocked, 'a flood is turned away with 429');
    assert.equal(rigged.urls().length, 1, 'and the providers were asked once for the whole flood');
  } finally { restore(); }
});
