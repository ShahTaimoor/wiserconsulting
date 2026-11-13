/**
 * Settings for the AI adapter (used first by the Tourist Visa cover letter, later by the itinerary).
 *
 * Everything the adapter needs to know lives here: the provider's fixed address, the default model, the limits and
 * how the environment names map to settings. Nothing in a request can change an address or a limit.
 *
 * Environment (names only; values never appear in the repository or in a log):
 *   AI_ENABLED               exactly "true" to switch the AI on; anything else keeps it off
 *   AI_PROVIDER              "groq" (the only provider built)
 *   GROQ_API_KEY             the provider's key
 *   GROQ_MODEL               optional; DEFAULT_GROQ_MODEL below is used when it is not set
 *   AI_DAILY_LIMIT           optional; how many AI letters in total per day (UTC), default 200
 *   AI_ADMIN_HOURLY_LIMIT    optional; how many AI letters one administrator can ask for per hour, default 15
 *   AI_DATA_TERMS_CONFIRMED  exactly "true" in production: someone has confirmed Zero Data Retention on the provider
 *                            account and read its terms on training with customer data (see the handover)
 *   NODE_ENV                 "development" or "test" (exactly) means NOT production. Anything else, including unset, "prod",
 *                            "Production" and " production", counts as production (step 8j-3), so a forgotten or misspelled value can
 *                            never switch the data-terms guard off.
 */

/** Groq's OpenAI-compatible chat endpoint. A constant: no request, header or setting can change it. */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * The model used when GROQ_MODEL is not set. Chosen from Groq's model documentation (console.groq.com/docs/models) on
 * 2026-11-03: a production (not preview) model, not on a deprecation notice, strong at following instructions and
 * writing short formal English. Change it here, in this one place.
 */
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

const LIMITS = Object.freeze({
  /** One request to the provider. */
  timeoutMs: 20000,
  /** A 429 is retried once only if the provider asks for a wait of at most this long. */
  retryAfterMaxMs: 5000,
  /** The wait before the retry when the provider does not say how long (a 429 without Retry-After, or a 5xx). */
  retryDelayMs: 1000,
  /** After this many failed generations in a row the AI is skipped for breakerPauseMs. */
  breakerFailures: 3,
  breakerPauseMs: 5 * 60 * 1000,
  /** The most the answer may weigh. */
  maxResponseBytes: 256 * 1024,
  /** Room for a letter of about 450 words and for a reasoning model's thinking. */
  maxOutputTokens: 4000,
  temperature: 0.3,
});

const DEFAULTS = Object.freeze({ dailyLimit: 200, adminHourlyLimit: 15 });

/**
 * Production unless NODE_ENV is explicitly "development" or "test" (compared exactly, no trimming and no case folding: a doubtful value
 * is production). The safe direction: an unset or misspelled NODE_ENV keeps the AI data-terms guard on.
 */
function isProductionEnvironment(env = process.env) {
  return env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test';
}

const positiveInteger = (value, fallback) => {
  const n = Number(String(value === undefined ? '' : value).trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** The settings as the environment gives them now. The key is a property of the result: never log the object. */
function readAiSettings(env = process.env) {
  const model = typeof env.GROQ_MODEL === 'string' ? env.GROQ_MODEL.trim() : '';
  return {
    enabled: env.AI_ENABLED === 'true',
    provider: typeof env.AI_PROVIDER === 'string' ? env.AI_PROVIDER.trim().toLowerCase() : '',
    apiKey: typeof env.GROQ_API_KEY === 'string' ? env.GROQ_API_KEY.trim() : '',
    model: model || DEFAULT_GROQ_MODEL,
    dailyLimit: positiveInteger(env.AI_DAILY_LIMIT, DEFAULTS.dailyLimit),
    adminHourlyLimit: positiveInteger(env.AI_ADMIN_HOURLY_LIMIT, DEFAULTS.adminHourlyLimit),
    production: isProductionEnvironment(env),
    termsConfirmed: env.AI_DATA_TERMS_CONFIRMED === 'true',
  };
}

/**
 * Why the AI cannot be used right now, as a fixed code, or null when it can.
 * AI_DISABLED: switched off. AI_NOT_CONFIGURED: no provider or no key. AI_TERMS_NOT_CONFIRMED: production without the
 * data-terms confirmation (the letter sends real trip, employment and money details).
 */
function aiUnavailableCode(settings) {
  if (!settings.enabled) return 'AI_DISABLED';
  if (settings.provider !== 'groq' || !settings.apiKey) return 'AI_NOT_CONFIGURED';
  if (settings.production && !settings.termsConfirmed) return 'AI_TERMS_NOT_CONFIRMED';
  return null;
}

module.exports = { GROQ_URL, DEFAULT_GROQ_MODEL, LIMITS, DEFAULTS, readAiSettings, aiUnavailableCode, isProductionEnvironment };
