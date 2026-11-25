/**
 * The one place that builds the mail transporter and sends mail.
 *
 * Settings come from these variable NAMES (never printed, never logged):
 *   EMAIL_SERVICE     the mail service, default "gmail"
 *   EMAIL_USER        the sending account (also the "from" address)
 *   EMAIL_PASSWORD    its password; EMAIL_PASS is read when EMAIL_PASSWORD is empty (the comment emails used that older name)
 *   ADMIN_EMAIL       the staff mailbox that gets "new message" notices; falls back to EMAIL_USER
 *   FRONTEND_URL      the public address of the site, for links in emails; ADMIN_PANEL_URL is read when it is empty (older name)
 *   ADMIN_PANEL_URL   (optional) the address used for the link to the admin area in staff emails; FRONTEND_URL when it is empty
 *
 * What a caller can rely on:
 *   - `sendMail()` NEVER throws. It returns { sent: true } or { sent: false, reason, code? }.
 *   - With no mail settings (local development) it sends nothing and returns { sent: false, reason: 'not_configured' }, after one quiet
 *     log line that names the missing variables (names only).
 *   - A failure is logged as a fixed label, a reason and an error CODE only: never the error message (which can carry an address, a
 *     server answer or a credential), never a recipient, a subject or any content.
 *   - It waits at most `timeoutMs` (default 15 seconds); a slower send returns reason 'timeout' and finishes in the background.
 *
 * The transporter is built when the first mail is sent (not when the file loads), from the settings of that moment, and rebuilt if they change.
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const DEFAULT_SERVICE = 'gmail';
const DEFAULT_TIMEOUT_MS = 15000;

/** Text of a variable, trimmed; '' when it is not set or not text. */
const read = (env, name) => (typeof env[name] === 'string' ? env[name].trim() : '');
/** The first of these variables that has a value. */
const firstOf = (env, names) => {
  for (const name of names) {
    const value = read(env, name);
    if (value !== '') return value;
  }
  return '';
};

/**
 * The mail settings of an environment. The password is NOT part of the answer (only whether there is one), so a caller can log or return
 * this object without a secret in it.
 */
function getMailSettings(env = process.env) {
  const user = read(env, 'EMAIL_USER');
  const hasPassword = firstOf(env, ['EMAIL_PASSWORD', 'EMAIL_PASS']) !== '';
  const missing = [];
  if (user === '') missing.push('EMAIL_USER');
  if (!hasPassword) missing.push('EMAIL_PASSWORD');
  return {
    configured: missing.length === 0,
    missing,
    service: read(env, 'EMAIL_SERVICE') || DEFAULT_SERVICE,
    user,
    adminTo: read(env, 'ADMIN_EMAIL') || user,
    siteUrl: firstOf(env, ['FRONTEND_URL', 'ADMIN_PANEL_URL']).replace(/\/+$/, ''),
    // The link to the admin area in a staff email: ADMIN_PANEL_URL first, as the contact emails always did.
    adminPanelUrl: firstOf(env, ['ADMIN_PANEL_URL', 'FRONTEND_URL']).replace(/\/+$/, ''),
  };
}

/** A short, fixed word for why a send failed, from nodemailer's error code. Never the message. */
function reasonOf(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  const responseCode = error && Number.isInteger(error.responseCode) ? error.responseCode : 0;
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) return 'auth_failed';
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'timeout';
  if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EDNS', 'ESOCKET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return 'connection';
  if (code === 'EENVELOPE' || code === 'EMESSAGE' || (responseCode >= 500 && responseCode < 600)) return 'rejected';
  return 'error';
}

/** The error code if it looks like one (CAPITALS, digits, underscore), else null. */
const codeOf = (error) => (error && typeof error.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code) ? error.code : null);

/** A label for the log line: lower-case words, digits and underscores only, so nothing else can be put in a log through it. */
const labelOf = (label) => (typeof label === 'string' && /^[a-z0-9_]{1,40}$/.test(label) ? label : 'mail');

/**
 * Makes a mailer. The default one (exported below) uses the real nodemailer and process.env; tests pass a fake `createTransport`,
 * their own `env` and a `log`.
 */
function createMailer({ env = null, createTransport = null, log = logger, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let cached = null;
  let cachedKey = '';
  let cachedBuilder = null;
  let warned = false;

  const envNow = () => env || process.env;

  function transporterFor(settings, password) {
    const key = `${settings.service}|${settings.user}|${password}`;
    // Looked up when needed (not captured at load), so a test that replaces nodemailer.createTransport is honoured.
    const build = createTransport || nodemailer.createTransport;
    if (cached && cachedKey === key && cachedBuilder === build) return cached;
    cached = build.call(nodemailer, { service: settings.service, auth: { user: settings.user, pass: password } });
    cachedKey = key;
    cachedBuilder = build;
    return cached;
  }

  /**
   * Sends one mail from the configured account.
   * @param {object} mail
   * @param {string|string[]} mail.to
   * @param {string} mail.subject
   * @param {string} [mail.html]
   * @param {string} [mail.text]
   * @param {string} [mail.from]    defaults to EMAIL_USER
   * @param {string} [mail.replyTo]
   * @param {string} [mail.label]   a fixed name for the log ("contact_confirmation"), never user text
   * @returns {Promise<{sent:true}|{sent:false, reason:string, code?:string}>}
   */
  async function sendMail({ label, from, ...mail } = {}) {
    const name = labelOf(label);
    const settings = getMailSettings(envNow());
    if (!settings.configured) {
      if (!warned) {
        warned = true;
        log.warn(`Mail is not configured, so emails are skipped (missing: ${settings.missing.join(', ')}).`);
      }
      return { sent: false, reason: 'not_configured' };
    }
    try {
      const password = firstOf(envNow(), ['EMAIL_PASSWORD', 'EMAIL_PASS']);
      const transporter = transporterFor(settings, password);
      const pending = Promise.resolve(transporter.sendMail({ from: from || settings.user, ...mail }));
      let timer;
      const timedOut = new Promise((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
        if (timer.unref) timer.unref();
      });
      const first = await Promise.race([pending.then(() => 'sent'), timedOut]);
      clearTimeout(timer);
      if (first === 'timeout') {
        pending.catch(() => {}); // it may still fail later; nobody is waiting for it
        log.error(`Mail not sent (${name}): timeout`);
        return { sent: false, reason: 'timeout' };
      }
      return { sent: true };
    } catch (error) {
      const reason = reasonOf(error);
      const code = codeOf(error);
      log.error(`Mail not sent (${name}): ${reason}${code ? ` ${code}` : ''}`);
      return code ? { sent: false, reason, code } : { sent: false, reason };
    }
  }

  return { sendMail, getSettings: () => getMailSettings(envNow()), isConfigured: () => getMailSettings(envNow()).configured };
}

const mailer = createMailer();

module.exports = {
  sendMail: mailer.sendMail,
  getSettings: mailer.getSettings,
  isConfigured: mailer.isConfigured,
  getMailSettings,
  createMailer,
  DEFAULT_SERVICE,
  DEFAULT_TIMEOUT_MS,
};
