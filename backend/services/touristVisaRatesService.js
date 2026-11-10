/**
 * Tourist Visa exchange rates for the currency helper: "units of a currency per 1 GBP".
 *
 *  - Two providers, tried in order (config/touristVisaRates.js). An answer is accepted only if it is for GBP, has a date, has
 *    PKR, and every rate it gives for an allowlisted currency is a finite number greater than 0. Anything else makes that
 *    provider's answer a failed one and the next provider is tried.
 *  - A call has a timeout, a size cap and no redirect to another host, and its URL is a constant: nothing about the request
 *    or the applicant reaches a provider, and nothing a provider says (its body, its error text) reaches the applicant or a log.
 *  - The answer is kept for 12 hours. If a refresh fails, the last good answer is served marked stale for up to 7 days after
 *    it was fetched; after that the helper answers 503 RATES_UNAVAILABLE. After a failure the providers are not asked again
 *    for a few minutes.
 *
 * The clock and the fetch are passed in, so the tests never touch the network.
 */

const config = require('../config/touristVisaRates');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
const failure = (reason) => Object.assign(new Error('rates provider failed'), { reason });

/** The date of an answer as YYYY-MM-DD, or null when it has none that makes sense. */
function dateFrom(kind, json) {
  if (kind === 'frankfurter') return typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : null;
  const seconds = json.time_last_update_unix;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Is the answer a good one for GBP? Returns { asOf, rates } or throws a failure. */
function readAnswer(provider, json, allowed = config.ALLOWED_CURRENCIES, required = config.REQUIRED_CURRENCY) {
  if (!isPlainObject(json)) throw failure('not an object');
  if (provider.kind === 'exchangerate-api') {
    if (json.result !== 'success') throw failure('not a success');
    if (json.base_code !== 'GBP') throw failure('not GBP');
  } else if (json.base !== 'GBP') {
    throw failure('not GBP');
  }
  const asOf = dateFrom(provider.kind, json);
  if (!asOf) throw failure('no date');
  if (!isPlainObject(json.rates)) throw failure('no rates');

  const rates = {};
  for (const code of allowed) {
    if (!Object.prototype.hasOwnProperty.call(json.rates, code)) continue;
    const value = json.rates[code];
    // A bad number for a currency we would show makes the whole answer untrustworthy.
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw failure('bad rate');
    rates[code] = value;
  }
  if (!(required in rates)) throw failure('no required currency');
  return { asOf, rates };
}

class TouristVisaRatesService {
  constructor({ fetchImpl, now = () => Date.now(), providers = config.PROVIDERS, limits = config.LIMITS, cache = config.CACHE } = {}) {
    // Looked up on each call, so a test (or the browser check's wrapper, outside the repository) can put a fake in place.
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.providers = providers;
    this.limits = limits;
    this.cache = cache;
    this.current = null; // { data, fetchedAt }
    this.retryAt = 0;
    this.inFlight = null;
  }

  /** The rates, as the route sends them: { base, asOf, rates, stale, attribution }. Throws 503 RATES_UNAVAILABLE when there are none to give. */
  async get() {
    const now = this.now();
    if (this.current && now - this.current.fetchedAt < this.cache.ttlMs) return this.present(false);

    if (now >= this.retryAt) {
      if (!this.inFlight) {
        this.inFlight = this.refresh().finally(() => {
          this.inFlight = null;
        });
      }
      await this.inFlight;
    }

    if (this.current) {
      const age = this.now() - this.current.fetchedAt;
      if (age < this.cache.ttlMs) return this.present(false);
      if (age <= this.cache.maxStaleMs) return this.present(true);
    }
    throw new AppError('Exchange rates are not available right now.', 503, 'RATES_UNAVAILABLE');
  }

  present(stale) {
    const { data } = this.current;
    return { base: 'GBP', asOf: data.asOf, rates: { ...data.rates }, stale, attribution: data.attribution ? { ...data.attribution } : null };
  }

  /** Asks the providers in order and keeps the first good answer. Never throws. */
  async refresh() {
    for (const provider of this.providers) {
      try {
        const json = await this.fetchJson(provider);
        const { asOf, rates } = readAnswer(provider, json);
        this.current = { fetchedAt: this.now(), data: { asOf, rates, attribution: provider.attribution } };
        this.retryAt = 0;
        return;
      } catch {
        // Only the provider's name is logged: never its body, its status text or the error it raised.
        logger.warn('Tourist Visa rates provider failed', { provider: provider.id });
      }
    }
    this.retryAt = this.now() + this.cache.failureBackoffMs;
    logger.error('Tourist Visa rates are unavailable from every provider');
  }

  /** One call to one provider's fixed URL, with a timeout, a size cap and no redirect to another host. Returns the parsed JSON. */
  async fetchJson(provider) {
    const doFetch = this.fetchImpl || ((...args) => globalThis.fetch(...args));
    const { timeoutMs, maxBodyBytes, maxRedirects } = this.limits;
    const home = new URL(provider.url);
    const controller = new AbortController();
    let timer;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(failure('timeout'));
      }, timeoutMs);
    });

    const run = async () => {
      let url = provider.url;
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        const response = await doFetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers && response.headers.get('location');
          const next = location ? new URL(location, url) : null;
          if (!next || next.origin !== home.origin) throw failure('redirect to another host');
          url = next.toString();
          continue;
        }
        if (response.status !== 200) throw failure('status');
        const declared = Number(response.headers && response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > maxBodyBytes) throw failure('too large');
        return JSON.parse(await this.readCapped(response, maxBodyBytes));
      }
      throw failure('too many redirects');
    };

    try {
      return await Promise.race([run(), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The body as text, read in pieces and refused as soon as it passes the cap. */
  async readCapped(response, maxBytes) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      const text = await response.text();
      if (Buffer.byteLength(text) > maxBytes) throw failure('too large');
      return text;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw failure('too large');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}

module.exports = new TouristVisaRatesService();
module.exports.TouristVisaRatesService = TouristVisaRatesService;
module.exports.readAnswer = readAnswer;
