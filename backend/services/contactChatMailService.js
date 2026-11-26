/**
 * The two chat emails. NEITHER CARRIES A MESSAGE TEXT: mailboxes are not encrypted and a chat can hold personal details, so an email only
 * says that something is waiting and where to read it.
 *
 *   new client message  -> ADMIN_EMAIL (or the sending account): "New chat message from <name>" with the topic and a link to the inbox
 *   staff reply         -> the client's account email: "We have replied to your message", with a link to the site
 *
 * Both are throttled (config/contactChat.js: one per conversation per direction per 3 hours, and a global cap on staff emails), and
 * a failed or skipped email never reaches the chat: nothing here throws, and the log holds reason codes only (config/mail.js).
 * Local development has no mail settings: every call then returns { sent: false, reason: 'not_configured' } and does nothing else.
 */

const mailConfig = require('../config/mail');
const escapeHtml = require('../utils/escapeHtml');
const { CHAT } = require('../config/contactChat');

/** A short single-line piece of text for an email subject or heading: no line breaks, no control characters, bounded length. */
function oneLine(value, max = 80) {
  return Array.from(String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
}

/** A rolling count for the staff-email cap (per process). */
class HourlyCap {
  constructor(max, now = () => Date.now()) {
    this.max = max;
    this.now = now;
    this.stamps = [];
  }

  take() {
    const cutoff = this.now() - 60 * 60 * 1000;
    this.stamps = this.stamps.filter((t) => t > cutoff);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(this.now());
    return true;
  }
}

/** The staff notice. Returns { subject, html, text }. */
function buildStaffNotice({ name, topic, inboxUrl }) {
  const who = oneLine(name, 80) || 'a visitor';
  const about = oneLine(topic, 80);
  const text = `New chat message from ${who}${about ? ` (${about})` : ''}.\nRead and answer it in the admin inbox: ${inboxUrl}\n(The message itself is not in this email.)`;
  const html = `
    <h2>New chat message</h2>
    <p><strong>From:</strong> ${escapeHtml(who)}</p>
    ${about ? `<p><strong>Topic:</strong> ${escapeHtml(about)}</p>` : ''}
    <p><a href="${escapeHtml(inboxUrl)}">Open the admin inbox</a></p>
    <p style="color:#6b7280">The message itself is not in this email.</p>`;
  return { subject: `New chat message - ${who}`, html, text };
}

/** The client notice. Returns { subject, html, text }. */
function buildClientNotice({ name, siteUrl }) {
  const who = oneLine(name, 80);
  const link = siteUrl ? `${siteUrl}/contact?chat=open` : '';
  const text = `${who ? `Dear ${who},\n\n` : ''}We have replied to your message. Please open our website and sign in to read it${link ? `: ${link}` : '.'}\n\nPlease do not reply to this email; it is not read.\n\nWiser Consulting Team`;
  const html = `
    <h2>We have replied to your message</h2>
    ${who ? `<p>Dear ${escapeHtml(who)},</p>` : ''}
    <p>Please open our website and sign in to read the reply.</p>
    ${link ? `<p><a href="${escapeHtml(link)}">Open the chat</a></p>` : ''}
    <p style="color:#6b7280">Please do not reply to this email; it is not read.</p>
    <p>Wiser Consulting Team</p>`;
  return { subject: 'We have replied to your message - Wiser Consulting', html, text };
}

class ContactChatMail {
  constructor({ mailer = null, settings = () => mailConfig.getSettings(), cap = new HourlyCap(CHAT.ADMIN_EMAIL_CAP_PER_HOUR), repository, now = () => new Date() } = {}) {
    // A mailer of its own with the short chat timeout; it looks nodemailer up at send time like the shared one.
    this.mailer = mailer || mailConfig.createMailer({ timeoutMs: CHAT.EMAIL_TIMEOUT_MS });
    this.settings = settings;
    this.cap = cap;
    this.repository = repository;
    this.now = now;
  }

  isConfigured() {
    return this.mailer.isConfigured();
  }

  /** A client message arrived. Never throws. Resolves { sent, reason? }. */
  async notifyStaff({ conversation, user }) {
    return this.#send({
      conversation,
      field: 'lastAdminEmailAt',
      capped: true,
      build: (settings) => ({
        to: settings.adminTo,
        ...buildStaffNotice({ name: user && user.name, topic: conversation.subject, inboxUrl: `${settings.adminPanelUrl || 'http://localhost:3000'}/admin/contacts/${conversation._id}` }),
        label: 'chat_staff_notice',
      }),
    });
  }

  /** Staff replied. Never throws. Resolves { sent, reason? }. */
  async notifyClient({ conversation, user }) {
    if (!user || typeof user.email !== 'string' || user.email.trim() === '') return { sent: false, reason: 'no_recipient' };
    return this.#send({
      conversation,
      field: 'lastClientEmailAt',
      capped: false,
      build: (settings) => ({ to: user.email, ...buildClientNotice({ name: user.name, siteUrl: settings.siteUrl }), label: 'chat_client_notice' }),
    });
  }

  async #send({ conversation, field, capped, build }) {
    try {
      if (!this.mailer.isConfigured()) return { sent: false, reason: 'not_configured' };
      // The slot is taken first (one atomic update), so two messages at the same moment make one email; it is given back when nothing was sent.
      const now = this.now();
      const claim = await this.repository.claimEmailSlot(conversation._id, field, now, CHAT.EMAIL_THROTTLE_MS);
      if (!claim) return { sent: false, reason: 'throttled' };
      if (capped && !this.cap.take()) {
        await this.repository.releaseEmailSlot(conversation._id, field, claim.previous, now);
        return { sent: false, reason: 'capped' };
      }
      const result = await this.mailer.sendMail(build(this.settings()));
      if (!result.sent) await this.repository.releaseEmailSlot(conversation._id, field, claim.previous, now);
      return result.sent ? { sent: true } : { sent: false, reason: result.reason };
    } catch {
      return { sent: false, reason: 'error' };
    }
  }
}

module.exports = { ContactChatMail, HourlyCap, buildStaffNotice, buildClientNotice, oneLine };
