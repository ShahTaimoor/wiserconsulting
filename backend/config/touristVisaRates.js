/**
 * Tourist Visa exchange rates (the currency helper): every constant in one place.
 *
 * The provider URLs are fixed here. No request, header, query or answer ever becomes part of a URL, and nothing about the
 * applicant is sent to a provider: the calls carry no cookie, no token and no body.
 */

const HOUR = 60 * 60 * 1000;

/** The only currencies the helper offers. A code a provider returns that is not here is ignored. */
const ALLOWED_CURRENCIES = Object.freeze([
  'PKR', 'USD', 'EUR', 'AED', 'SAR', 'INR', 'CAD', 'AUD', 'CNY', 'JPY', 'TRY', 'QAR', 'KWD', 'OMR', 'BHD', 'BDT',
  'LKR', 'NPR', 'MYR', 'SGD', 'CHF', 'NOK', 'SEK', 'DKK', 'ZAR', 'NZD', 'EGP', 'KES', 'NGN',
]);

/** An answer without this currency is treated as a failed answer, and the next provider is tried. */
const REQUIRED_CURRENCY = 'PKR';

/**
 * In the order they are tried. `kind` says how the answer is read (see services/touristVisaRatesService.js).
 * The second provider's terms require a visible link "Rates By Exchange Rate API" to exchangerate-api.com wherever its
 * rates are shown, so its answers carry that as `attribution`; the first provider's carry null.
 */
const PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'frankfurter',
    kind: 'frankfurter',
    url: `https://api.frankfurter.dev/v1/latest?base=GBP&symbols=${ALLOWED_CURRENCIES.join(',')}`,
    attribution: null,
  }),
  Object.freeze({
    id: 'exchangerate-api',
    kind: 'exchangerate-api',
    url: 'https://open.er-api.com/v6/latest/GBP',
    attribution: Object.freeze({ text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' }),
  }),
]);

/** How a call to a provider is limited. */
const LIMITS = Object.freeze({
  /** Give up on a provider after this long. */
  timeoutMs: 5000,
  /** The largest answer read (the real ones are a few hundred bytes to about 3 KB). */
  maxBodyBytes: 64 * 1024,
  /** A provider may redirect inside its own host only, and at most this many times. */
  maxRedirects: 2,
});

/** How long the rates are kept and used. */
const CACHE = Object.freeze({
  /** After this the rates are fetched again. */
  ttlMs: 12 * HOUR,
  /** If the refresh fails, the last good rates are still served, marked stale, for up to this long after they were fetched. */
  maxStaleMs: 7 * 24 * HOUR,
  /** After a failed refresh, wait this long before asking the providers again, so a broken provider is not hammered. */
  failureBackoffMs: 5 * 60 * 1000,
});

module.exports = { ALLOWED_CURRENCIES, REQUIRED_CURRENCY, PROVIDERS, LIMITS, CACHE };
