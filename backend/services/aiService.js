/**
 * The AI adapter: one generic way to ask a language model for text, used first by the Tourist Visa cover letter and
 * later by the itinerary. It knows nothing about visas. It is given a prompt ({ system, user }) and returns
 * { text, model, provider } or throws an AiError that carries ONE FIXED CODE and nothing else.
 *
 *  - It is off unless AI_ENABLED is exactly "true", and in production it refuses to run without
 *    AI_DATA_TERMS_CONFIRMED (config/ai.js).
 *  - One request is given 20 seconds. A 429 is retried once if the provider asks for 5 seconds or less (Retry-After),
 *    and a 5xx is retried once; nothing else is retried. The address is a constant and a redirect is an error.
 *  - A simple circuit breaker: after 3 failed generations in a row the AI is skipped for 5 minutes.
 *  - Nothing from a prompt, an answer, an error body or the key is ever logged or put in an error: the log lines are a
 *    provider name and a fixed code.
 *
 * `fetchImpl` and `sleep` are assignable so that tests (and a check run from outside the repository) can supply fakes
 * and no network is touched. Production never assigns them.
 */

const groq = require('./aiProviders/groq');
const { LIMITS, readAiSettings, aiUnavailableCode } = require('../config/ai');
const { readCappedText } = require('../utils/cappedBody');
const logger = require('../utils/logger');

/** A failure with a fixed code. `attempted` is false when the provider was never contacted. */
class AiError extends Error {
  constructor(code, { attempted = true } = {}) {
    super(code);
    this.name = 'AiError';
    this.code = code;
    this.attempted = attempted;
  }
}

class AiService {
  constructor({ env = () => process.env, providers = { groq }, limits = LIMITS, now = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    this.limits = limits;
    this.env = env;
    this.providers = providers;
    this.now = now;
    this.sleep = sleep;
    this.fetchImpl = (...args) => globalThis.fetch(...args);
    this.failures = 0;
    this.pausedUntil = 0;
  }

  settings() {
    return readAiSettings(this.env());
  }

  /** Why the AI cannot be used right now (a fixed code), or null. Does not contact the provider. */
  unavailable() {
    const code = aiUnavailableCode(this.settings());
    if (code) return code;
    return this.now() < this.pausedUntil ? 'AI_CIRCUIT_OPEN' : null;
  }

  /** Asks the model. Resolves { text, model, provider }; rejects with an AiError. */
  async generate(prompt) {
    const settings = this.settings();
    const code = aiUnavailableCode(settings);
    if (code) throw new AiError(code, { attempted: false });
    if (this.now() < this.pausedUntil) throw new AiError('AI_CIRCUIT_OPEN', { attempted: false });
    const provider = this.providers[settings.provider];
    if (!provider) throw new AiError('AI_NOT_CONFIGURED', { attempted: false });

    try {
      const result = await this.askWithRetry(provider, settings, prompt);
      this.failures = 0;
      return { text: result.text, model: settings.model, provider: provider.id };
    } catch (error) {
      const failure = error instanceof AiError ? error : new AiError('AI_PROVIDER_ERROR');
      this.failures += 1;
      logger.warn('AI request failed', { provider: provider.id, code: failure.code });
      if (this.failures >= this.limits.breakerFailures) {
        this.pausedUntil = this.now() + this.limits.breakerPauseMs;
        this.failures = 0;
        logger.warn('AI paused after repeated failures', { provider: provider.id });
      }
      throw failure;
    }
  }

  async askWithRetry(provider, settings, prompt) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const outcome = await this.askOnce(provider, settings, prompt);
      if (outcome.ok) return outcome;
      if (attempt === 0 && outcome.retryDelay !== undefined) {
        await this.sleep(outcome.retryDelay);
        continue;
      }
      throw new AiError(outcome.code);
    }
    throw new AiError('AI_PROVIDER_ERROR');
  }

  /** One request. { ok: true, text } or { ok: false, code, retryDelay? } (retryDelay only when a retry is allowed). */
  async askOnce(provider, settings, prompt) {
    const request = provider.build(settings, prompt);
    const controller = new AbortController();
    let timer;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AiError('AI_TIMEOUT'));
      }, this.limits.timeoutMs);
    });
    try {
      const response = await Promise.race([
        this.fetchImpl(request.url, { method: 'POST', headers: request.headers, body: request.body, redirect: 'error', signal: controller.signal }),
        timedOut,
      ]);
      if (response.status === 429) {
        const header = response.headers && response.headers.get ? response.headers.get('retry-after') : null;
        const seconds = header !== null && header !== undefined && String(header).trim() !== '' ? Number(header) : NaN;
        const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : this.limits.retryDelayMs;
        return delay > this.limits.retryAfterMaxMs ? { ok: false, code: 'AI_RATE_LIMITED' } : { ok: false, code: 'AI_RATE_LIMITED', retryDelay: delay };
      }
      if (response.status >= 500) return { ok: false, code: 'AI_PROVIDER_ERROR', retryDelay: this.limits.retryDelayMs };
      if (response.status < 200 || response.status >= 300) return { ok: false, code: 'AI_PROVIDER_REJECTED' };

      const raw = await Promise.race([readCappedText(response, this.limits.maxResponseBytes), timedOut]);
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        return { ok: false, code: 'AI_BAD_RESPONSE' };
      }
      const answer = provider.parse(json);
      if (!answer || answer.text.trim() === '') return { ok: false, code: 'AI_BAD_RESPONSE' };
      if (answer.finish === 'length') return { ok: false, code: 'AI_TRUNCATED' };
      return { ok: true, text: answer.text };
    } catch (error) {
      // Deliberately nothing of the error is kept: only whether it was the timeout.
      if (error instanceof AiError) return { ok: false, code: error.code };
      return { ok: false, code: error && error.message === 'too large' ? 'AI_BAD_RESPONSE' : 'AI_NETWORK' };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = new AiService();
module.exports.AiService = AiService;
module.exports.AiError = AiError;
