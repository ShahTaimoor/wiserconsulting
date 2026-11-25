/**
 * Contact chat service: the business rules of the two-way chat between a signed-in visitor and staff.
 *
 *  - ONE conversation per user. The client side never takes a conversation id: it is always found by the signed-in user.
 *  - Message bodies and the phone number are stored encrypted (the app's field cipher); the text never appears in a log or an email.
 *  - Text is cleaned (line breaks made plain, control and direction-changing characters removed), trimmed and length checked. It is plain
 *    text everywhere: nothing renders it as HTML.
 *  - A new client message sets the conversation to Open; a staff reply sets it to Answered; staff can Close or re-open it. A conversation with
 *    no message for 30 days is Closed (status only, nothing is deleted): worked out lazily, see closeStale below.
 *  - Unread counts are kept per side by the repository's atomic updates; this layer only asks for them.
 *  - Email is sent after the message is stored, never carries the text, is throttled, and can never make a send fail.
 */

const mongoose = require('mongoose');
const repositoryDefault = require('../repositories/contactChatRepository');
const fieldCipher = require('../repositories/fieldCipher');
const { getFieldEncryptionKey } = require('../config/fieldEncryption');
const { AppError } = require('../middleware/errorHandler');
const { CHAT, STATUSES } = require('../config/contactChat');
const { evaluateHours } = require('../config/contactChatHours');
const { ContactChatMail } = require('./contactChatMailService');
const logger = require('../utils/logger');

const { ObjectId } = mongoose.Types;
const isId = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
const chatError = (message, status, code) => new AppError(message, status, code);

// Control characters (except line feed and tab), the characters that reverse the direction of text, zero-width characters and line/paragraph separators.
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
const length = (text) => Array.from(text).length;

/** Plain text, line breaks made "\n", unsafe characters removed, trailing spaces and long runs of blank lines trimmed. */
function cleanText(raw) {
  return String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(UNSAFE_TEXT, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normaliseBody(raw, max) {
  const text = cleanText(raw);
  if (text === '') throw chatError('Please write a message.', 400, 'MESSAGE_EMPTY');
  if (length(text) > max) throw chatError(`Messages can be at most ${max} characters.`, 400, 'MESSAGE_TOO_LONG');
  return text;
}

function normaliseSubject(raw) {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).replace(UNSAFE_TEXT, ' ').replace(/\s+/g, ' ').trim();
  if (text === '') return undefined;
  if (length(text) > CHAT.MAX_SUBJECT) throw chatError(`The topic can be at most ${CHAT.MAX_SUBJECT} characters.`, 400, 'SUBJECT_TOO_LONG');
  return text;
}

function normalisePhone(raw) {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (text === '') return undefined;
  const digits = text.replace(/\D/g, '');
  if (text.length > CHAT.MAX_PHONE || !/^[+()\d][\d ()+-]*$/.test(text) || digits.length < 5 || digits.length > 15) {
    throw chatError('Please enter a valid phone number, or leave it empty.', 400, 'INVALID_PHONE');
  }
  return text;
}

class ContactChatService {
  constructor({ repository = repositoryDefault, mail = null, now = () => new Date(), env = process.env, newId = () => new ObjectId() } = {}) {
    this.repository = repository;
    this.mail = mail || new ContactChatMail({ repository, now });
    this.now = now;
    this.env = env;
    this.newId = newId;
    this.inFlight = new Map(); // "user:retryId" -> the send in progress (a double click makes one message)
    this.lastSweep = 0;
  }

  // ---------------------------------------------------------------- switch, key, hours

  isEnabled() {
    return this.env.CHAT_ENABLED === 'true';
  }

  keyOrThrow() {
    try {
      return getFieldEncryptionKey();
    } catch {
      throw chatError('Chat is not available right now.', 503, 'CHAT_UNAVAILABLE');
    }
  }

  isEncryptionReady() {
    try {
      getFieldEncryptionKey();
      return true;
    } catch {
      return false;
    }
  }

  /** What the public status endpoint says: is chat on (and able to store messages), and the hours. */
  status() {
    const enabled = this.isEnabled() && this.isEncryptionReady();
    return enabled ? { enabled: true, hours: evaluateHours(this.now()) } : { enabled: false };
  }

  // ---------------------------------------------------------------- encryption (the user and the message are part of what is signed)

  aad(userId, what) {
    return `chat:${String(userId)}:${String(what)}`;
  }

  encryptBody(userId, messageId, text) {
    return fieldCipher.encrypt(this.keyOrThrow(), text, this.aad(userId, messageId));
  }

  decryptBody(userId, message) {
    try {
      return fieldCipher.decrypt(this.keyOrThrow(), message.bodyEnc, this.aad(userId, message._id));
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Chat message could not be decrypted', { name: error && error.name });
      return null;
    }
  }

  decryptPhone(conversation) {
    if (!conversation.phoneEnc) return null;
    try {
      return fieldCipher.decrypt(this.keyOrThrow(), conversation.phoneEnc, this.aad(conversation.user, 'phone'));
    } catch (error) {
      if (error instanceof AppError) throw error;
      return null;
    }
  }

  // ---------------------------------------------------------------- views (what leaves the server)

  clientMessageView(conversation, message) {
    return { id: String(message._id), sender: message.sender, text: this.decryptBody(conversation.user, message), createdAt: message.createdAt, seq: message.seq };
  }

  staffMessageView(conversation, message, staffNames) {
    const view = this.clientMessageView(conversation, message);
    if (message.sender === 'staff') view.staff = message.staffUser ? { id: String(message.staffUser), name: staffNames.get(String(message.staffUser)) || 'Staff' } : null;
    return view;
  }

  clientConversationView(conversation) {
    if (!conversation) return null;
    return {
      status: conversation.status,
      subject: conversation.subject || null,
      unreadForClient: conversation.unreadForClient || 0,
      lastMessageAt: conversation.lastMessageAt || null,
      messageCount: conversation.messageCount || 0,
    };
  }

  // ---------------------------------------------------------------- stale conversations (30 days)

  /**
   * A conversation with no message for 30 days becomes Closed. Done LAZILY, when somebody looks: a person's own conversation is checked
   * whenever they read or send (one indexed update by user id); the whole inbox is swept when staff load it, at most every 5 minutes per
   * process (one indexed update over open and answered conversations). Why this way: no timer or scheduled job to run, deploy or forget,
   * it works on any host (including a serverless one), it only changes `status`, it can be repeated safely, and a message arriving later
   * simply re-opens the conversation. The 30-day cutoff is applied by the same rule everywhere.
   */
  cutoff() {
    return new Date(this.now().getTime() - CHAT.AUTO_CLOSE_AFTER_MS);
  }

  async closeStaleForUser(userId) {
    await this.repository.closeStaleForUser(userId, this.cutoff(), this.now());
  }

  async sweepStale() {
    const t = this.now().getTime();
    if (t - this.lastSweep < CHAT.AUTO_CLOSE_SWEEP_EVERY_MS) return 0;
    this.lastSweep = t;
    return this.repository.closeStaleAll(this.cutoff(), this.now());
  }

  // ---------------------------------------------------------------- the client's side

  async clientConversation(userId, { after, before, limit }) {
    this.keyOrThrow();
    await this.closeStaleForUser(userId);
    const conversation = await this.repository.findByUser(userId);
    if (!conversation) return { conversation: null, messages: [], hasMore: false };
    const { messages, hasMore } = await this.repository.listMessages(conversation._id, { after, before, limit: limit || CHAT.PAGE_SIZE });
    return { conversation: this.clientConversationView(conversation), messages: messages.map((m) => this.clientMessageView(conversation, m)), hasMore };
  }

  async clientUnread(userId) {
    await this.closeStaleForUser(userId);
    const conversation = await this.repository.findByUser(userId);
    return { unread: conversation ? conversation.unreadForClient || 0 : 0, status: conversation ? conversation.status : null };
  }

  async clientRead(userId, upToSeq) {
    const conversation = await this.repository.findByUser(userId);
    if (!conversation) return { unreadForClient: 0 };
    const updated = await this.repository.markReadByClient(conversation._id, upToSeq);
    return { unreadForClient: updated ? updated.unreadForClient || 0 : 0 };
  }

  /**
   * A message from the signed-in user. `user` is the account (only _id, name, email, phone are read).
   * Returns { status: 201 | 200, message, conversation }; 200 means "this retry id was already stored" (or the same text was just sent).
   */
  async sendClientMessage(user, input) {
    const key = `${String(user._id)}:${input.clientMessageId}`;
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const work = this.#sendClientMessage(user, input).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  async #sendClientMessage(user, input) {
    this.keyOrThrow();
    const text = normaliseBody(input.body, CHAT.MAX_CLIENT_MESSAGE);
    const subject = normaliseSubject(input.subject);
    const phone = normalisePhone(input.phone);
    const clientMessageId = String(input.clientMessageId).toLowerCase();

    await this.closeStaleForUser(user._id);
    const existing = await this.repository.findByUser(user._id);
    if (existing) {
      // The same send again (a retry after a lost answer): the first message is the answer.
      const earlier = await this.repository.findMessageByClientId(existing._id, clientMessageId);
      if (earlier) return { status: 200, message: this.clientMessageView(existing, earlier), conversation: this.clientConversationView(existing) };
      if (subject !== undefined || phone !== undefined) {
        if ((existing.clientMsgCount || 0) > 0) throw chatError('The topic and phone number can only be sent with the first message.', 400, 'FIRST_MESSAGE_ONLY');
      }
      if ((existing.messageCount || 0) >= CHAT.MAX_MESSAGES_PER_CONVERSATION) {
        throw chatError('This conversation is full. Please contact us by phone.', 409, 'CONVERSATION_FULL');
      }
      // The same text again within a minute is the same message (a double click), not a new one.
      if (existing.lastMessageBy === 'client' && existing.lastMessageAt && this.now().getTime() - new Date(existing.lastMessageAt).getTime() < CHAT.DUPLICATE_WINDOW_MS) {
        const [last] = await this.repository.findMessagesByIds([existing.lastMessageId]);
        if (last && this.decryptBody(existing.user, last) === text) return { status: 200, message: this.clientMessageView(existing, last), conversation: this.clientConversationView(existing) };
      }
    }

    const messageId = this.newId();
    const now = this.now();
    const bodyEnc = this.encryptBody(user._id, messageId, text);
    const phoneEnc = phone !== undefined ? fieldCipher.encrypt(this.keyOrThrow(), phone, this.aad(user._id, 'phone')) : undefined;

    let saved;
    try {
      saved = await this.repository.appendClientMessage({ userId: user._id, messageId, now, subject, phoneEnc, bodyEnc, clientMessageId });
    } catch (error) {
      if (error && error.code === 11000) {
        // Another request stored this retry id first: answer with that message.
        const conversation = await this.repository.findByUser(user._id);
        const earlier = conversation && (await this.repository.findMessageByClientId(conversation._id, clientMessageId));
        if (earlier) return { status: 200, message: this.clientMessageView(conversation, earlier), conversation: this.clientConversationView(conversation) };
      }
      throw error;
    }

    // The email comes after the message is safe, waits at most a few seconds, never changes the answer, and never carries the text.
    await this.mail.notifyStaff({ conversation: saved.conversation, user });
    return { status: 201, message: this.clientMessageView(saved.conversation, saved.message), conversation: this.clientConversationView(saved.conversation) };
  }

  // ---------------------------------------------------------------- staff's side

  assertId(id) {
    if (!isId(String(id))) throw chatError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
  }

  async loadConversation(id) {
    this.assertId(id);
    const conversation = await this.repository.findById(id);
    if (!conversation) throw chatError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    return conversation;
  }

  async userView(userId) {
    const [user] = await this.repository.findUsersByIds([userId]);
    return user ? { id: String(user._id), name: user.name, email: user.email, phone: user.phone || null } : { id: String(userId), name: 'Deleted user', email: null, phone: null };
  }

  async staffNames(messages) {
    const ids = [...new Set(messages.filter((m) => m.staffUser).map((m) => String(m.staffUser)))];
    const users = await this.repository.findUsersByIds(ids);
    return new Map(users.map((u) => [String(u._id), u.name]));
  }

  async adminUnread() {
    await this.sweepStale();
    return this.repository.unreadTotals();
  }

  async listInbox({ status, unread, q, page, limit }) {
    this.keyOrThrow();
    await this.sweepStale();
    const pageNumber = page || 1;
    const pageSize = limit || CHAT.INBOX_PAGE_SIZE;
    const search = typeof q === 'string' ? cleanText(q).slice(0, CHAT.SEARCH_MAX) : '';
    const { items, total } = await this.repository.listInbox({
      status: status && status !== 'all' ? status : undefined,
      unreadOnly: Boolean(unread),
      search: search || undefined,
      skip: (pageNumber - 1) * pageSize,
      limit: pageSize,
    });
    const users = new Map((await this.repository.findUsersByIds(items.map((c) => c.user))).map((u) => [String(u._id), u]));
    const lastMessages = new Map((await this.repository.findMessagesByIds(items.map((c) => c.lastMessageId).filter(Boolean))).map((m) => [String(m._id), m]));
    const rows = items.map((c) => {
      const u = users.get(String(c.user));
      const last = lastMessages.get(String(c.lastMessageId));
      const text = last ? this.decryptBody(c.user, last) : null;
      return {
        id: String(c._id),
        user: u ? { id: String(u._id), name: u.name, email: u.email } : { id: String(c.user), name: 'Deleted user', email: null },
        topic: c.subject || null,
        status: c.status,
        unreadForStaff: c.unreadForStaff || 0,
        lastMessageAt: c.lastMessageAt || null,
        lastMessageBy: c.lastMessageBy || null,
        preview: text === null ? null : Array.from(text.replace(/\s+/g, ' ')).slice(0, CHAT.PREVIEW_LENGTH).join(''),
      };
    });
    return { items: rows, page: pageNumber, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async adminConversation(id, { after, before, limit }) {
    this.keyOrThrow();
    await this.sweepStale();
    const conversation = await this.loadConversation(id);
    const { messages, hasMore } = await this.repository.listMessages(conversation._id, { after, before, limit: limit || CHAT.PAGE_SIZE });
    const names = await this.staffNames(messages);
    return {
      conversation: {
        id: String(conversation._id),
        status: conversation.status,
        topic: conversation.subject || null,
        phone: this.decryptPhone(conversation),
        unreadForStaff: conversation.unreadForStaff || 0,
        messageCount: conversation.messageCount || 0,
        lastMessageAt: conversation.lastMessageAt || null,
        lastMessageBy: conversation.lastMessageBy || null,
        createdAt: conversation.createdAt || null,
      },
      user: await this.userView(conversation.user),
      messages: messages.map((m) => this.staffMessageView(conversation, m, names)),
      hasMore,
    };
  }

  async sendStaffMessage(admin, id, input) {
    const key = `staff:${String(admin._id)}:${id}:${input.clientMessageId}`;
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const work = this.#sendStaffMessage(admin, id, input).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  async #sendStaffMessage(admin, id, input) {
    this.keyOrThrow();
    const text = normaliseBody(input.body, CHAT.MAX_STAFF_MESSAGE);
    const conversation = await this.loadConversation(id);
    const clientMessageId = String(input.clientMessageId).toLowerCase();
    const earlier = await this.repository.findMessageByClientId(conversation._id, clientMessageId);
    if (earlier) {
      const names = await this.staffNames([earlier]);
      return { status: 200, message: this.staffMessageView(conversation, earlier, names), conversation: { id: String(conversation._id), status: conversation.status } };
    }
    if ((conversation.messageCount || 0) >= CHAT.MAX_MESSAGES_PER_CONVERSATION) throw chatError('This conversation is full.', 409, 'CONVERSATION_FULL');

    const messageId = this.newId();
    const now = this.now();
    const bodyEnc = this.encryptBody(conversation.user, messageId, text);
    let saved;
    try {
      saved = await this.repository.appendStaffMessage({ conversationId: conversation._id, staffUserId: admin._id, messageId, now, bodyEnc, clientMessageId });
    } catch (error) {
      if (error && error.code === 11000) {
        const found = await this.repository.findMessageByClientId(conversation._id, clientMessageId);
        if (found) return { status: 200, message: this.staffMessageView(conversation, found, await this.staffNames([found])), conversation: { id: String(conversation._id), status: conversation.status } };
      }
      throw error;
    }
    if (!saved) throw chatError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');

    const [user] = await this.repository.findUsersByIds([conversation.user]);
    await this.mail.notifyClient({ conversation: saved.conversation, user });
    const names = new Map([[String(admin._id), admin.name]]);
    return { status: 201, message: this.staffMessageView(saved.conversation, saved.message, names), conversation: { id: String(saved.conversation._id), status: saved.conversation.status } };
  }

  async staffRead(id, upToSeq) {
    const conversation = await this.loadConversation(id);
    const updated = await this.repository.markReadByStaff(conversation._id, upToSeq);
    return { unreadForStaff: updated ? updated.unreadForStaff || 0 : 0 };
  }

  async setStatus(id, status) {
    if (!STATUSES.includes(status) || status === 'answered') throw chatError('That status cannot be set directly.', 400, 'INVALID_STATUS');
    const conversation = await this.loadConversation(id);
    const updated = await this.repository.setStatus(conversation._id, status, this.now());
    if (!updated) throw chatError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    return { id: String(updated._id), status: updated.status };
  }

  /** Permanent delete of a conversation and its messages. `audit` is called FIRST (the security log), so a deletion is never unrecorded. */
  async deleteConversation(id, audit) {
    const conversation = await this.loadConversation(id);
    if (typeof audit === 'function') audit({ messages: conversation.messageCount || 0 });
    const removed = await this.repository.deleteConversation(conversation._id);
    if (!removed) throw chatError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    return removed;
  }
}

module.exports = new ContactChatService();
module.exports.ContactChatService = ContactChatService;
module.exports.cleanText = cleanText;
module.exports.normaliseBody = normaliseBody;
module.exports.normaliseSubject = normaliseSubject;
module.exports.normalisePhone = normalisePhone;
