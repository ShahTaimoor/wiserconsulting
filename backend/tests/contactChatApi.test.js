'use strict';

// The Contact chat API (/api/chat): who may call what, one conversation per user, encryption, unread counts, the inbox, delete, the
// emails (with a fake transport), the 30-day close, and the limits. In-memory MongoDB, made-up users and made-up messages only.

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.CHAT_ENABLED = 'true';
process.env.SECURITY_LOG = 'on';
const crypto = require('node:crypto');
process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
Object.assign(process.env, {
  EMAIL_USER: 'sender.test@example.invalid',
  EMAIL_PASSWORD: 'dummy-password-for-tests',
  ADMIN_EMAIL: 'staff.inbox@example.invalid',
  ADMIN_PANEL_URL: 'https://admin.example.invalid',
  FRONTEND_URL: 'https://site.example.invalid',
});

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const ContactConversation = require('../models/ContactConversation');
const ContactMessage = require('../models/ContactMessage');
const chatRoutes = require('../routes/contactChatRoutes');
const chatService = require('../services/contactChatService');
const { ContactChatService } = chatService;
const { errorHandler } = require('../middleware/errorHandler');

let mongod;
let server;
let baseUrl;
let counter = 0;
const realCreateTransport = nodemailer.createTransport;

// A stand-in for the mail server: remembers every mail, and can be told to fail.
const mailbox = { sent: [], fail: false };
nodemailer.createTransport = () => ({
  sendMail: async (mail) => {
    if (mailbox.fail) throw Object.assign(new Error(`refused ${mail.to} ${mail.subject}`), { code: 'EAUTH' });
    mailbox.sent.push(mail);
    return {};
  },
});

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await ContactConversation.init();
  await ContactMessage.init();
  await User.init();
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 120000 });

after(async () => {
  nodemailer.createTransport = realCreateTransport;
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(() => {
  mailbox.sent.length = 0;
  mailbox.fail = false;
  process.env.CHAT_ENABLED = 'true';
  chatService.mail.cap.stamps = []; // the staff-email cap is per process; every test starts with a full allowance
});

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}/api/chat${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no body */ }
  return { status: res.status, json, text, headers: res.headers, data: json && json.data };
}

async function makeUser({ role = 0, name, email, phone } = {}) {
  counter += 1;
  const user = await User.create({ name: name || `Chat Tester ${counter}`, email: email || `chat.tester.${counter}@example.invalid`, password: 'not-a-real-password', role, phone });
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, id: String(user._id) };
}
const makeAdmin = (options) => makeUser({ ...options, role: 1 });

const say = (token, text, extra = {}) => api('POST', '/messages', { token, body: { body: text, clientMessageId: crypto.randomUUID(), ...extra } });
const reply = (token, id, text, extra = {}) => api('POST', `/admin/conversations/${id}/messages`, { token, body: { body: text, clientMessageId: crypto.randomUUID(), ...extra } });
const conversationOf = async (userId) => ContactConversation.collection.findOne({ user: new mongoose.Types.ObjectId(userId) });
const messagesOf = async (conversationId) => ContactMessage.collection.find({ conversation: conversationId }).sort({ seq: 1 }).toArray();

/** Captures everything written to the console and to the process output while `fn` runs. */
async function capturing(fn) {
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn, out: process.stdout.write, err: process.stderr.write };
  for (const method of ['error', 'log', 'info', 'warn']) console[method] = (...args) => lines.push(args.map(String).join(' '));
  process.stdout.write = (chunk) => { lines.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    Object.assign(console, { error: original.error, log: original.log, info: original.info, warn: original.warn });
    process.stdout.write = original.out;
    process.stderr.write = original.err;
  }
  return lines.join('\n');
}

const CLIENT_ROUTES = [['GET', '/conversation'], ['GET', '/unread'], ['POST', '/messages'], ['POST', '/read']];
const ADMIN_ROUTES = (id = '0123456789abcdef01234567') => [
  ['GET', '/admin/unread'], ['GET', '/admin/conversations'], ['GET', `/admin/conversations/${id}`],
  ['POST', `/admin/conversations/${id}/messages`], ['POST', `/admin/conversations/${id}/read`], ['PATCH', `/admin/conversations/${id}`], ['DELETE', `/admin/conversations/${id}`],
];

// ---------------------------------------------------------------------------
// The switch, the status and who may call what
// ---------------------------------------------------------------------------

test('CHAT_ENABLED off (unset, empty, false, TRUE, 1, " true"): every route is a fixed 404 FEATURE_CLOSED, even for an admin with a valid token; only /status answers', async () => {
  const admin = await makeAdmin();
  const user = await makeUser();
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true', 'yes']) {
    if (value === undefined) delete process.env.CHAT_ENABLED;
    else process.env.CHAT_ENABLED = value;
    for (const [method, path] of [...CLIENT_ROUTES, ...ADMIN_ROUTES(), ['GET', '/conversation/older'], ['GET', '/status/'], ['GET', '/statusx'], ['POST', '/status']]) {
      for (const token of [undefined, user.token, admin.token]) {
        const res = await api(method, path, { token, body: method === 'GET' ? undefined : {} });
        assert.deepEqual([res.status, res.json && res.json.code], [404, 'FEATURE_CLOSED'], `${value}: ${method} ${path}`);
        assert.equal(res.headers.get('cache-control'), 'no-store');
      }
    }
    const status = await api('GET', '/status');
    assert.deepEqual([status.status, status.data], [200, { enabled: false }], `status with ${JSON.stringify(value)}`);
  }
  assert.equal(await ContactConversation.countDocuments({}), 0, 'nothing was written');
});

test('/status when on: enabled, with the hours (inside or outside, the text, the zone); no sign-in needed; short public caching', async () => {
  const res = await api('GET', '/status');
  assert.equal(res.status, 200);
  assert.equal(res.data.enabled, true);
  assert.deepEqual(Object.keys(res.data.hours).sort(), ['backText', 'closesAt', 'from', 'nextOpenAt', 'openNow', 'text', 'timezone', 'to']);
  assert.equal(res.data.hours.timezone, 'Asia/Karachi');
  assert.equal(res.data.hours.text, 'We usually reply between 12 PM and 9 PM (Pakistan time)');
  assert.equal(typeof res.data.hours.openNow, 'boolean');
  assert.match(res.headers.get('cache-control'), /public, max-age=30/);
  // The limits the server enforces are in the answer too (so the widget and the inbox never guess them).
  assert.deepEqual(Object.keys(res.data).sort(), ['enabled', 'hours', 'limits']);
  assert.deepEqual(res.data.limits, { clientMessage: 2000, staffMessage: 4000, subject: 80, phone: 25 });
});

test('/status limits ARE the limits the server enforces: at the number it is accepted, one over it is refused (message, staff reply, topic, phone)', async () => {
  const { CHAT } = require('../config/contactChat');
  const { limits } = (await api('GET', '/status')).data;
  assert.deepEqual(limits, { clientMessage: CHAT.MAX_CLIENT_MESSAGE, staffMessage: CHAT.MAX_STAFF_MESSAGE, subject: CHAT.MAX_SUBJECT, phone: CHAT.MAX_PHONE }, 'the answer is built from the one config file');
  for (const value of Object.values(limits)) assert.ok(Number.isInteger(value) && value > 0);

  // A visitor's message: exactly the limit is stored, one more is MESSAGE_TOO_LONG. (Each case has its own user: refused requests count against the sending budget.)
  let person = await makeUser();
  assert.equal((await say(person.token, 'a'.repeat(limits.clientMessage))).status, 201);
  person = await makeUser();
  const tooLong = await say(person.token, 'a'.repeat(limits.clientMessage + 1));
  assert.deepEqual([tooLong.status, tooLong.json.code], [400, 'MESSAGE_TOO_LONG']);

  // The topic.
  person = await makeUser();
  assert.equal((await say(person.token, 'Hello', { subject: 'T'.repeat(limits.subject) })).status, 201);
  person = await makeUser();
  const longTopic = await say(person.token, 'Hello', { subject: 'T'.repeat(limits.subject + 1) });
  assert.deepEqual([longTopic.status, longTopic.json.code], [400, 'SUBJECT_TOO_LONG']);

  // The phone number: 25 characters (12 digits) is accepted, 26 is not.
  const phoneOf = (length) => `+(92)(300)(0000000)${'-'.repeat(length - 19)}`;
  assert.equal(phoneOf(limits.phone).length, limits.phone);
  person = await makeUser();
  assert.equal((await say(person.token, 'Hello', { phone: phoneOf(limits.phone) })).status, 201);
  person = await makeUser();
  const longPhone = await say(person.token, 'Hello', { phone: phoneOf(limits.phone + 1) });
  assert.deepEqual([longPhone.status, longPhone.json.code], [400, 'INVALID_PHONE']);

  // A staff reply: exactly its limit is stored, one more is refused.
  const admin = await makeAdmin();
  person = await makeUser();
  assert.equal((await say(person.token, 'Hello')).status, 201);
  const id = String((await conversationOf(person.id))._id);
  assert.equal((await reply(admin.token, id, 'b'.repeat(limits.staffMessage))).status, 201);
  const tooLongReply = await reply(admin.token, id, 'b'.repeat(limits.staffMessage + 1));
  assert.deepEqual([tooLongReply.status, tooLongReply.json.code], [400, 'MESSAGE_TOO_LONG']);
});

test('/status says chat is off when it cannot store messages (no encryption key), and every other route answers 503 CHAT_UNAVAILABLE', async () => {
  const user = await makeUser();
  const key = process.env.FIELD_ENCRYPTION_KEY;
  delete process.env.FIELD_ENCRYPTION_KEY;
  try {
    assert.deepEqual((await api('GET', '/status')).data, { enabled: false });
    for (const res of [await api('GET', '/conversation', { token: user.token }), await say(user.token, 'Hello')]) {
      assert.deepEqual([res.status, res.json.code], [503, 'CHAT_UNAVAILABLE']);
    }
    assert.equal(await ContactMessage.countDocuments({}) >= 0, true);
  } finally {
    process.env.FIELD_ENCRYPTION_KEY = key;
  }
});

test('logged out: 401 on every private route; an ordinary user gets 403 on every admin route; a demoted admin loses access at once', async () => {
  const user = await makeUser();
  for (const [method, path] of [...CLIENT_ROUTES, ...ADMIN_ROUTES()]) {
    const res = await api(method, path, { body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
  for (const [method, path] of ADMIN_ROUTES()) {
    const res = await api(method, path, { token: user.token, body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  const admin = await makeAdmin();
  assert.equal((await api('GET', '/admin/unread', { token: admin.token })).status, 200);
  await User.updateOne({ _id: admin.user._id }, { $set: { role: 0 } });
  assert.equal((await api('GET', '/admin/unread', { token: admin.token })).status, 403, 'role is read from the database every time');
  assert.equal((await api('GET', '/admin/conversations', { token: admin.token })).status, 403);
});

test('a malformed token or a deleted account is 401; private answers are never cached', async () => {
  const user = await makeUser();
  assert.equal((await api('GET', '/conversation', { token: 'not-a-token' })).status, 401);
  const res = await api('GET', '/conversation', { token: user.token });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  await User.updateOne({ _id: user.user._id }, { $set: { isDeleted: true } });
  assert.equal((await api('GET', '/conversation', { token: user.token })).status, 401);
});

// ---------------------------------------------------------------------------
// Sending, one conversation per user, validation
// ---------------------------------------------------------------------------

test('the first message creates the conversation (Open) with an optional topic and phone; no name or email is sent or stored', async () => {
  const person = await makeUser({ name: 'Made Up Person', email: 'made.up.person@example.invalid' });
  const res = await say(person.token, '  Hello, I have a question about visas.  ', { subject: 'Tourist visa question', phone: '+92 300 1234567' });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(Object.keys(res.data).sort(), ['conversation', 'message']);
  assert.equal(res.data.message.sender, 'client');
  assert.equal(res.data.message.text, 'Hello, I have a question about visas.', 'trimmed');
  assert.equal(res.data.message.seq, 1);
  assert.deepEqual(res.data.conversation.status, 'open');
  assert.equal(res.data.conversation.subject, 'Tourist visa question');
  assert.equal(JSON.stringify(res.json).includes('+92 300'), false, 'the phone number is never sent back to the client');
  assert.equal(JSON.stringify(res.json).includes('Made Up Person'), false);

  const stored = await conversationOf(person.id);
  assert.equal(String(stored.user), person.id);
  assert.equal(stored.status, 'open');
  assert.equal(stored.unreadForStaff, 1);
  assert.equal(stored.unreadForClient, 0);
  assert.deepEqual([stored.messageCount, stored.clientMsgCount, stored.staffMsgCount], [1, 1, 0]);
  assert.ok(!('name' in stored) && !('email' in stored), 'name and email are read from the account, never copied');
});

test('bodies and the phone are encrypted at rest: the database holds no readable text, and the text never reaches a log or an email', async () => {
  const person = await makeUser({ email: 'private.person@example.invalid' });
  const MARKER = 'MARKER-CHAT-SECRET-TEXT-4242';
  const PHONE = '+92 311 7654321';
  let first;
  const logs = await capturing(async () => {
    first = await say(person.token, `Please call me about ${MARKER}`, { subject: 'Topic only', phone: PHONE });
    assert.equal(first.status, 201);
    const admin = await makeAdmin();
    const convo = await conversationOf(person.id);
    assert.equal((await reply(admin.token, String(convo._id), `Reply with ${MARKER}`)).status, 201);
    await api('GET', `/admin/conversations/${convo._id}`, { token: admin.token });
    await api('GET', '/admin/conversations', { token: admin.token });
    await api('GET', '/conversation', { token: person.token });
    await api('DELETE', `/admin/conversations/${convo._id}`, { token: admin.token });
  });
  assert.equal(logs.includes(MARKER), false, 'the text is not in any log line');
  assert.equal(logs.includes(PHONE), false);
  assert.equal(JSON.stringify(mailbox.sent).includes(MARKER), false, 'the text is not in any email');
  assert.equal(JSON.stringify(mailbox.sent).includes(PHONE), false);

  // A second conversation, kept, so the stored form can be looked at.
  const keep = await makeUser();
  await say(keep.token, `Stored text ${MARKER}`, { phone: PHONE, subject: 'Plain topic' });
  const raw = JSON.stringify([await ContactConversation.collection.find({}).toArray(), await ContactMessage.collection.find({}).toArray()]);
  assert.equal(raw.includes(MARKER), false, 'nothing in the two collections is readable text');
  assert.equal(raw.includes(PHONE), false);
  assert.ok(raw.includes('enc:v1:'), 'the body is in the encrypted form');
  assert.ok(raw.includes('Plain topic'), 'the topic is plain (so staff can search it)');
});

test('a stored message cannot be moved: copied to another message or another user, it does not decrypt', async () => {
  const a = await makeUser();
  const b = await makeUser();
  await say(a.token, 'Message of A');
  await say(b.token, 'Message of B');
  const [ma] = await messagesOf((await conversationOf(a.id))._id);
  const [mb] = await messagesOf((await conversationOf(b.id))._id);
  assert.equal(chatService.decryptBody(a.id, ma), 'Message of A');
  assert.equal(chatService.decryptBody(b.id, ma), null, 'A\'s text under B\'s user does not decrypt');
  assert.equal(chatService.decryptBody(a.id, { _id: mb._id, bodyEnc: ma.bodyEnc }), null, 'under another message id it does not decrypt');
});

test('validation: empty, blank, too long, not text, unknown keys, bad retry id, bad phone, long topic; each with its code and nothing stored', async () => {
  const id = () => crypto.randomUUID();
  const cases = [
    [{ body: '', clientMessageId: id() }, 'MESSAGE_EMPTY'],
    [{ body: '   \n\t  ', clientMessageId: id() }, 'MESSAGE_EMPTY'],
    [{ body: '\u0000\u200b\u202e', clientMessageId: id() }, 'MESSAGE_EMPTY'],
    [{ body: 'x'.repeat(2001), clientMessageId: id() }, 'MESSAGE_TOO_LONG'],
    [{ body: 'x'.repeat(20001), clientMessageId: id() }, 'MESSAGE_TOO_LONG'],
    [{ body: 12345, clientMessageId: id() }, 'INVALID_REQUEST'],
    [{ body: { text: 'x' }, clientMessageId: id() }, 'INVALID_REQUEST'],
    [{ clientMessageId: id() }, 'INVALID_REQUEST'],
    [{ body: 'Hello' }, 'INVALID_REQUEST'],
    [{ body: 'Hello', clientMessageId: 'not-a-uuid' }, 'INVALID_REQUEST'],
    [{ body: 'Hello', clientMessageId: id(), user: 'someone-else' }, 'INVALID_REQUEST'],
    [{ body: 'Hello', clientMessageId: id(), conversation: '0123456789abcdef01234567' }, 'INVALID_REQUEST'],
    [{ body: 'Hello', clientMessageId: id(), sender: 'staff' }, 'INVALID_REQUEST'],
    [{ body: 'Hello', clientMessageId: id(), status: 'closed' }, 'INVALID_REQUEST'],
    [{ body: 'Hello', clientMessageId: id(), phone: 'call me maybe' }, 'INVALID_PHONE'],
    [{ body: 'Hello', clientMessageId: id(), phone: '12' }, 'INVALID_PHONE'],
    [{ body: 'Hello', clientMessageId: id(), subject: 'T'.repeat(81) }, 'SUBJECT_TOO_LONG'],
  ];
  // A request that is refused still counts against the sending budget (8 a minute), so each case has its own user.
  for (const [body, code] of cases) {
    const person = await makeUser();
    const res = await api('POST', '/messages', { token: person.token, body });
    assert.equal(res.status, 400, JSON.stringify(Object.keys(body)) + code);
    assert.equal(res.json.code, code, `${res.text}`);
    assert.equal(await conversationOf(person.id), null, `nothing was created for ${code}`);
  }
  const person = await makeUser();
  assert.equal((await api('POST', '/messages', { token: person.token })).status, 400, 'no body at all');
  // The longest allowed message goes through, counted in characters.
  assert.equal((await api('POST', '/messages', { token: person.token, body: { body: '\u00e9'.repeat(2000), clientMessageId: id() } })).status, 201);
});

test('text is plain: line breaks made "\\n", control and direction characters removed, HTML kept as text (never interpreted)', async () => {
  const person = await makeUser();
  const res = await say(person.token, 'Line one\r\nLine two\u202e reversed\u0007\n\n\n\n\n\nEnd <b>bold</b> & <script>alert(1)</script>');
  assert.equal(res.status, 201);
  assert.equal(res.data.message.text, 'Line one\nLine two reversed\n\n\nEnd <b>bold</b> & <script>alert(1)</script>');
  const list = await api('GET', '/conversation', { token: person.token });
  assert.equal(list.data.messages[0].text, res.data.message.text, 'what is read back is exactly what was stored: no sanitizer, no HTML');
});

test('the topic and the phone only go with the first message; a second message with them is refused', async () => {
  const person = await makeUser();
  assert.equal((await say(person.token, 'First', { subject: 'Topic' })).status, 201);
  for (const extra of [{ subject: 'Another topic' }, { phone: '+92 300 0000000' }]) {
    const res = await say(person.token, 'Second', extra);
    assert.deepEqual([res.status, res.json.code], [400, 'FIRST_MESSAGE_ONLY']);
  }
  assert.equal((await conversationOf(person.id)).messageCount, 1);
  assert.equal((await say(person.token, 'Second, no extras')).status, 201);
});

test('ONE conversation per user, many messages: two first messages at the same moment make one conversation', async () => {
  const person = await makeUser();
  const results = await Promise.all([say(person.token, 'First at once'), say(person.token, 'Second at once')]);
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
  assert.equal(await ContactConversation.countDocuments({ user: person.user._id }), 1);
  const convo = await conversationOf(person.id);
  assert.equal(convo.messageCount, 2);
  assert.deepEqual((await messagesOf(convo._id)).map((m) => m.seq), [1, 2]);
});

test('the retry id: sending the same message again returns the first one (200) and stores nothing new, however often', async () => {
  const person = await makeUser();
  const clientMessageId = crypto.randomUUID();
  const first = await api('POST', '/messages', { token: person.token, body: { body: 'Only once', clientMessageId } });
  assert.equal(first.status, 201);
  for (let i = 0; i < 3; i += 1) {
    const again = await api('POST', '/messages', { token: person.token, body: { body: 'Only once', clientMessageId } });
    assert.equal(again.status, 200);
    assert.equal(again.data.message.id, first.data.message.id);
    assert.equal(again.data.message.seq, 1);
  }
  // Even with other text under the same id, it is the same message.
  const changed = await api('POST', '/messages', { token: person.token, body: { body: 'Different text', clientMessageId } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.message.text, 'Only once');
  assert.equal((await conversationOf(person.id)).messageCount, 1);
  // The same id sent at the same moment twice makes one message.
  const id2 = crypto.randomUUID();
  const both = await Promise.all([1, 2].map(() => api('POST', '/messages', { token: person.token, body: { body: 'Double click', clientMessageId: id2 } })));
  assert.deepEqual(both.map((r) => r.data.message.id).filter((v, i, a) => a.indexOf(v) === i).length, 1);
  assert.equal((await conversationOf(person.id)).messageCount, 2);
  // Another user using the same id is a different message (ids are per conversation).
  const other = await makeUser();
  assert.equal((await api('POST', '/messages', { token: other.token, body: { body: 'Mine', clientMessageId } })).status, 201);
});

test('the same text again within a minute (a double click with a new id) is the same message', async () => {
  const person = await makeUser();
  const first = await say(person.token, 'Same words');
  const second = await say(person.token, 'Same words');
  assert.equal(second.status, 200);
  assert.equal(second.data.message.id, first.data.message.id);
  assert.equal((await say(person.token, 'Different words')).status, 201);
});

test('unread for staff is exact under concurrent sends (8 at once through the API, 30 at once through the service)', async () => {
  const person = await makeUser();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => say(person.token, `Concurrent message ${i}`)));
  assert.deepEqual(results.map((r) => r.status), Array(8).fill(201));
  const convo = await conversationOf(person.id);
  assert.deepEqual([convo.messageCount, convo.clientMsgCount, convo.unreadForStaff], [8, 8, 8]);
  const stored = await messagesOf(convo._id);
  assert.deepEqual(stored.map((m) => m.seq), [1, 2, 3, 4, 5, 6, 7, 8], 'numbers are handed out once each');
  assert.deepEqual(stored.map((m) => m.senderSeq), [1, 2, 3, 4, 5, 6, 7, 8]);

  const quiet = new ContactChatService({ mail: { notifyStaff: async () => ({}), notifyClient: async () => ({}) } });
  const second = await makeUser();
  await Promise.all(Array.from({ length: 30 }, (_, i) => quiet.sendClientMessage(second.user, { body: `Message number ${i}`, clientMessageId: crypto.randomUUID() })));
  const c2 = await conversationOf(second.id);
  assert.deepEqual([c2.messageCount, c2.clientMsgCount, c2.unreadForStaff], [30, 30, 30]);
  assert.equal(new Set((await messagesOf(c2._id)).map((m) => m.seq)).size, 30);
});

test('a message arriving while staff read is never lost: reading marks only what was seen, and the mark never moves back', async () => {
  const admin = await makeAdmin();
  const person = await makeUser();
  for (let i = 1; i <= 5; i += 1) await say(person.token, `Message ${i}`);
  const convo = await conversationOf(person.id);
  const id = String(convo._id);
  const read3 = await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: 3 } });
  assert.equal(read3.data.unreadForStaff, 2);
  await say(person.token, 'Message 6, arrived while staff were reading');
  assert.equal((await conversationOf(person.id)).unreadForStaff, 3);
  assert.equal((await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: 3 } })).data.unreadForStaff, 3, 'marking the old number again does not hide the new message');
  assert.equal((await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: 1 } })).data.unreadForStaff, 3, 'the mark never goes back');
  assert.equal((await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: 6 } })).data.unreadForStaff, 0);
  assert.equal((await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: 999 } })).data.unreadForStaff, 0, 'a number beyond the end is just "all"');
  assert.equal((await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: -1 } })).status, 400);
  assert.equal((await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: 'x' } })).status, 400);
  assert.equal((await api('POST', `/admin/conversations/${id}/read`, { token: admin.token, body: { upToSeq: 2, extra: 1 } })).status, 400);
});

test('staff messages are numbered in the same line; reading by sender: a staff message in the middle does not confuse the client count', async () => {
  const admin = await makeAdmin();
  const person = await makeUser();
  await say(person.token, 'c1');
  const id = String((await conversationOf(person.id))._id);
  await reply(admin.token, id, 's1');
  await say(person.token, 'c2');
  await reply(admin.token, id, 's2');
  const convo = await conversationOf(person.id);
  assert.deepEqual([convo.messageCount, convo.clientMsgCount, convo.staffMsgCount, convo.unreadForStaff, convo.unreadForClient], [4, 2, 2, 2, 2]);
  const seen = await api('POST', '/read', { token: person.token, body: { upToSeq: 2 } }); // seq 2 is s1
  assert.equal(seen.data.unreadForClient, 1);
  assert.equal((await api('POST', '/read', { token: person.token, body: { upToSeq: 4 } })).data.unreadForClient, 0);
  assert.equal((await api('GET', '/unread', { token: person.token })).data.unread, 0);
});

// ---------------------------------------------------------------------------
// Status: reopen, answered, close and reopen by staff
// ---------------------------------------------------------------------------

test('status: a staff reply makes it Answered, staff can Close and re-open, a new client message re-opens a closed one, Answered is not settable', async () => {
  const admin = await makeAdmin();
  const person = await makeUser();
  await say(person.token, 'Hello');
  const id = String((await conversationOf(person.id))._id);
  assert.equal((await conversationOf(person.id)).status, 'open');
  const answered = await reply(admin.token, id, 'Hello, how can we help?');
  assert.equal(answered.status, 201);
  assert.equal(answered.data.conversation.status, 'answered');

  const closed = await api('PATCH', `/admin/conversations/${id}`, { token: admin.token, body: { status: 'closed' } });
  assert.deepEqual([closed.status, closed.data.status], [200, 'closed']);
  assert.equal((await api('GET', '/conversation', { token: person.token })).data.conversation.status, 'closed');

  const again = await say(person.token, 'One more thing');
  assert.equal(again.data.conversation.status, 'open', 'a new client message re-opens it');

  assert.equal((await api('PATCH', `/admin/conversations/${id}`, { token: admin.token, body: { status: 'closed' } })).status, 200);
  const reopened = await api('PATCH', `/admin/conversations/${id}`, { token: admin.token, body: { status: 'open' } });
  assert.deepEqual([reopened.status, reopened.data.status], [200, 'open'], 'staff can re-open');
  assert.equal((await reply(admin.token, id, 'Back again')).data.conversation.status, 'answered', 'a reply to a closed conversation answers it');

  for (const status of ['answered', 'archived', '', 5, null]) {
    const res = await api('PATCH', `/admin/conversations/${id}`, { token: admin.token, body: { status } });
    assert.equal(res.status, 400, JSON.stringify(status));
    assert.equal(res.json.success, false);
  }
  assert.equal((await api('PATCH', `/admin/conversations/${id}`, { token: admin.token, body: { status: 'closed', extra: true } })).status, 400);
  assert.equal((await api('PATCH', `/admin/conversations/${id}`, { token: admin.token, body: {} })).status, 400);
});

// ---------------------------------------------------------------------------
// Nobody reads or writes another user's conversation
// ---------------------------------------------------------------------------

test('user A can never read or write user B\'s conversation: the client routes take no id, and nothing in a request can point at another', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const SECRET_B = 'B-only-private-words-91827';
  await say(b.token, SECRET_B);
  const convoB = await conversationOf(b.id);
  const idB = String(convoB._id);
  const admin = await makeAdmin();
  await reply(admin.token, idB, 'Staff reply to B only');

  // A has no conversation yet: A sees nothing of B.
  const seenByA = await api('GET', '/conversation', { token: a.token });
  assert.equal(seenByA.data.conversation, null);
  assert.deepEqual(seenByA.data.messages, []);
  assert.equal((await api('GET', '/unread', { token: a.token })).data.unread, 0);
  assert.equal(JSON.stringify(seenByA.json).includes(SECRET_B), false);

  // A writes: it lands in A's own conversation, whatever the request claims; claims are refused.
  for (const claim of [{ conversation: idB }, { conversationId: idB }, { user: b.id }, { userId: b.id }]) {
    const res = await say(a.token, 'Trying to write into B', claim);
    assert.equal(res.status, 400, JSON.stringify(claim));
  }
  assert.equal((await say(a.token, 'My own message')).status, 201);
  assert.equal((await messagesOf(convoB._id)).length, 2, 'B\'s conversation is unchanged (B\'s message and the staff reply)');

  // Paths with B's id are not client routes at all, and are admin-only.
  for (const [method, path] of [['GET', `/conversation/${idB}`], ['POST', `/conversation/${idB}/messages`], ['GET', `/messages/${idB}`], ['POST', `/read/${idB}`]]) {
    const res = await api(method, path, { token: a.token, body: method === 'GET' ? undefined : { body: 'x', clientMessageId: crypto.randomUUID(), upToSeq: 1 } });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  for (const [method, path] of ADMIN_ROUTES(idB)) {
    const res = await api(method, path, { token: a.token, body: method === 'GET' ? undefined : { body: 'x', clientMessageId: crypto.randomUUID(), upToSeq: 1, status: 'closed' } });
    assert.equal(res.status, 403, `${method} ${path}`);
  }

  // A's own read, and A's own list, only ever touch A's conversation.
  await api('POST', '/read', { token: a.token, body: { upToSeq: 99 } });
  const afterB = await conversationOf(b.id);
  assert.equal(afterB.unreadForClient, 1, 'B\'s unread reply is untouched by A\'s read');
  const mine = await api('GET', '/conversation', { token: a.token });
  assert.deepEqual(mine.data.messages.map((m) => m.text), ['My own message']);
  // And B still sees exactly their own.
  const theirs = await api('GET', '/conversation', { token: b.token });
  assert.deepEqual(theirs.data.messages.map((m) => m.text), [SECRET_B, 'Staff reply to B only']);
});

test('the client never sees who on staff replied, or anything of the other side\'s accounts', async () => {
  const admin = await makeAdmin({ name: 'Staff Member Name' });
  const person = await makeUser({ email: 'client.mail@example.invalid' });
  await say(person.token, 'Hello');
  await reply(admin.token, String((await conversationOf(person.id))._id), 'Answer');
  const res = await api('GET', '/conversation', { token: person.token });
  const text = JSON.stringify(res.json);
  for (const needle of ['Staff Member Name', admin.id, 'staffUser', 'bodyEnc', 'phoneEnc', 'enc:v1:', 'client.mail@example.invalid']) assert.equal(text.includes(needle), false, needle);
  assert.deepEqual(res.data.messages.map((m) => Object.keys(m).sort().join()), Array(2).fill('createdAt,id,sender,seq,text'));
  assert.equal(res.data.conversation.unreadForClient, 1);
});

// ---------------------------------------------------------------------------
// Reading: paging by number, the cursor
// ---------------------------------------------------------------------------

test('reading the conversation: the newest page, "after" only returns what is new, "before" pages back, limits are checked', async () => {
  const person = await makeUser();
  const service = new ContactChatService({ mail: { notifyStaff: async () => ({}), notifyClient: async () => ({}) } });
  for (let i = 1; i <= 7; i += 1) await service.sendClientMessage(person.user, { body: `Message ${i}`, clientMessageId: crypto.randomUUID() });
  const latest = await api('GET', '/conversation?limit=3', { token: person.token });
  assert.deepEqual(latest.data.messages.map((m) => m.seq), [5, 6, 7]);
  assert.equal(latest.data.hasMore, true);
  const older = await api('GET', '/conversation?before=5&limit=3', { token: person.token });
  assert.deepEqual(older.data.messages.map((m) => m.seq), [2, 3, 4]);
  const fresh = await api('GET', '/conversation?after=5', { token: person.token });
  assert.deepEqual(fresh.data.messages.map((m) => m.seq), [6, 7]);
  assert.equal((await api('GET', '/conversation?after=7', { token: person.token })).data.messages.length, 0, 'a poll with nothing new is empty');
  const all = await api('GET', '/conversation', { token: person.token });
  assert.equal(all.data.messages.length, 7);
  assert.equal(all.data.hasMore, false);
  for (const query of ['?limit=0', '?limit=101', '?limit=x', '?after=-1', '?after=x', '?unknown=1', '?before=1.5']) {
    assert.equal((await api('GET', `/conversation${query}`, { token: person.token })).status, 400, query);
  }
});

// ---------------------------------------------------------------------------
// The inbox
// ---------------------------------------------------------------------------

/** Three people with a conversation each; every name, email and topic carries a tag of its own so tests do not find each other's data. */
async function makeInbox() {
  counter += 1;
  const tag = `Tag${counter}x`;
  const admin = await makeAdmin();
  const alice = await makeUser({ name: `Alice ${tag}`, email: `alice.${tag.toLowerCase()}@example.invalid` });
  const bob = await makeUser({ name: `Bob ${tag}`, email: `bob.other.${tag.toLowerCase()}@example.invalid` });
  const carol = await makeUser({ name: `Carol ${tag}`, email: `carol.${tag.toLowerCase()}@example.invalid` });
  await say(alice.token, 'Alice asks about a student visa and more words', { subject: `Student visa ${tag}` });
  await say(bob.token, 'Bob needs help', { subject: `Passport renewal ${tag}` });
  await say(carol.token, 'Carol writes last', { subject: `Hotel booking ${tag}` });
  const ids = {};
  for (const p of [alice, bob, carol]) ids[p.id] = String((await conversationOf(p.id))._id);
  return { admin, alice, bob, carol, ids, tag };
}

test('the inbox: sorted by latest activity, a preview of the last message, the unread count, user name and email, no phone', async () => {
  const { admin, alice, bob, carol, ids, tag } = await makeInbox();
  const unrelated = await ContactConversation.countDocuments({});
  const res = await api('GET', '/admin/conversations?limit=50', { token: admin.token });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.total, unrelated);
  const mine = res.data.items.filter((i) => [ids[alice.id], ids[bob.id], ids[carol.id]].includes(i.id));
  assert.deepEqual(mine.map((i) => i.user.name), [`Carol ${tag}`, `Bob ${tag}`, `Alice ${tag}`], 'newest activity first');
  const first = mine[0];
  assert.deepEqual(Object.keys(first).sort(), ['id', 'lastMessageAt', 'lastMessageBy', 'preview', 'status', 'topic', 'unreadForStaff', 'user']);
  assert.equal(first.preview, 'Carol writes last');
  assert.equal(first.user.email, `carol.${tag.toLowerCase()}@example.invalid`);
  assert.equal(first.unreadForStaff, 1);
  assert.equal(first.topic, `Hotel booking ${tag}`);
  // New activity moves a conversation to the top.
  await say(alice.token, 'Alice again');
  const moved = (await api('GET', '/admin/conversations?limit=50', { token: admin.token })).data.items;
  assert.equal(moved[0].user.name, `Alice ${tag}`);
  assert.equal(moved[0].unreadForStaff, 2);
  // The preview is cut and made one line.
  await say(bob.token, `Bob writes a very long line ${'word '.repeat(60)}\nand another line`);
  const bobRow = (await api('GET', `/admin/conversations?q=Bob%20${tag}`, { token: admin.token })).data.items[0];
  assert.ok(bobRow.preview.length <= 80 && !bobRow.preview.includes('\n'), bobRow.preview);
});

test('the inbox: filter by status, unread only, and search by name, email and topic (literal text, not a pattern); paging', async () => {
  const { admin, alice, bob, carol, ids, tag } = await makeInbox();
  await reply(admin.token, ids[bob.id], 'Answer to Bob');
  await api('PATCH', `/admin/conversations/${ids[carol.id]}`, { token: admin.token, body: { status: 'closed' } });
  const list = async (query) => (await api('GET', `/admin/conversations${query}`, { token: admin.token }));
  const idsOf = (res) => res.data.items.map((i) => i.id);

  assert.ok(idsOf(await list('?status=answered&limit=50')).includes(ids[bob.id]));
  assert.equal(idsOf(await list('?status=answered&limit=50')).includes(ids[alice.id]), false);
  assert.ok(idsOf(await list('?status=closed&limit=50')).includes(ids[carol.id]));
  assert.ok(idsOf(await list('?status=open&limit=50')).includes(ids[alice.id]));
  assert.ok(idsOf(await list('?status=all&limit=50')).includes(ids[carol.id]));
  await api('POST', `/admin/conversations/${ids[alice.id]}/read`, { token: admin.token, body: { upToSeq: 99 } });
  const unreadOnly = idsOf(await list('?unread=1&limit=50'));
  assert.equal(unreadOnly.includes(ids[alice.id]), false, 'read');
  assert.ok(unreadOnly.includes(ids[carol.id]), 'still unread');

  assert.deepEqual(idsOf(await list(`?q=Alice%20${tag}`)), [ids[alice.id]], 'by name');
  assert.deepEqual(idsOf(await list(`?q=carol.${tag.toLowerCase()}@example`)), [ids[carol.id]], 'by email');
  assert.deepEqual(idsOf(await list(`?q=passport%20renewal%20${tag}`)), [ids[bob.id]], 'by topic, any case');
  assert.deepEqual(idsOf(await list(`?q=${tag}&status=answered`)), [ids[bob.id]], 'search and filter together');
  assert.deepEqual(idsOf(await list('?q=.*')), [], 'a pattern is only text');
  assert.deepEqual(idsOf(await list('?q=zzz-nobody')), []);
  assert.deepEqual(idsOf(await list('?q=asks%20about%20a%20student%20visa')), [], 'the text of messages is encrypted and is not searched');

  const page1 = await list('?limit=2&page=1');
  const page2 = await list('?limit=2&page=2');
  assert.equal(page1.data.items.length, 2);
  assert.equal(page1.data.page, 1);
  assert.ok(page1.data.total >= 3 && page1.data.totalPages >= 2);
  assert.equal(idsOf(page1).some((id) => idsOf(page2).includes(id)), false, 'no row on two pages');
  for (const query of ['?status=archived', '?limit=0', '?limit=51', '?page=0', '?page=x', '?unread=2', '?surprise=1']) {
    assert.equal((await list(query)).status, 400, query);
  }
});

test('one conversation for staff: all messages with who replied, the phone, no read marking by looking; paging; bad and missing ids are 404', async () => {
  const admin = await makeAdmin({ name: 'Reply Person' });
  const person = await makeUser({ name: 'Thread Owner', email: 'thread.owner@example.invalid' });
  await say(person.token, 'Question one', { subject: 'A topic', phone: '+92 345 1112233' });
  const id = String((await conversationOf(person.id))._id);
  await reply(admin.token, id, 'Answer one');
  await say(person.token, 'Question two');

  const before = await conversationOf(person.id);
  const res = await api('GET', `/admin/conversations/${id}`, { token: admin.token });
  assert.equal(res.status, 200);
  assert.equal(res.data.conversation.phone, '+92 345 1112233');
  assert.equal(res.data.conversation.topic, 'A topic');
  assert.deepEqual(res.data.user, { id: person.id, name: 'Thread Owner', email: 'thread.owner@example.invalid', phone: null });
  assert.deepEqual(res.data.messages.map((m) => [m.sender, m.text]), [['client', 'Question one'], ['staff', 'Answer one'], ['client', 'Question two']]);
  assert.deepEqual(res.data.messages[1].staff, { id: admin.id, name: 'Reply Person' });
  const after = await conversationOf(person.id);
  assert.deepEqual([after.unreadForStaff, after.unreadForClient, after.staffSeenClientSeq], [before.unreadForStaff, before.unreadForClient, before.staffSeenClientSeq], 'a GET changes nothing');
  assert.equal((await api('GET', `/admin/conversations/${id}?after=2`, { token: admin.token })).data.messages.length, 1);
  assert.equal((await api('GET', `/admin/conversations/${id}?limit=1`, { token: admin.token })).data.hasMore, true);

  for (const bad of ['not-an-id', '123', '0123456789abcdef01234567', '..%2f..']) {
    for (const [method, tail, body] of [['GET', '', undefined], ['POST', '/messages', { body: 'x', clientMessageId: crypto.randomUUID() }], ['POST', '/read', { upToSeq: 1 }], ['PATCH', '', { status: 'closed' }], ['DELETE', '', undefined]]) {
      const r = await api(method, `/admin/conversations/${bad}${tail}`, { token: admin.token, body });
      assert.deepEqual([r.status, r.json.code], [404, 'CONVERSATION_NOT_FOUND'], `${method} ${bad}${tail}`);
    }
  }
});

test('the staff unread total (the badge): the sum of unread client messages and the number of conversations; it follows reading and sending', async () => {
  const admin = await makeAdmin();
  const { alice, bob, ids } = await makeInbox();
  const base = (await api('GET', '/admin/unread', { token: admin.token })).data;
  await say(alice.token, 'A second one from Alice');
  assert.deepEqual((await api('GET', '/admin/unread', { token: admin.token })).data, { unread: base.unread + 1, conversations: base.conversations });
  await api('POST', `/admin/conversations/${ids[bob.id]}/read`, { token: admin.token, body: { upToSeq: 99 } });
  assert.deepEqual((await api('GET', '/admin/unread', { token: admin.token })).data, { unread: base.unread, conversations: base.conversations - 1 });
  assert.equal((await api('GET', '/unread', { token: alice.token })).data.unread, 0);
  assert.deepEqual(Object.keys((await api('GET', '/admin/unread', { token: admin.token })).data).sort(), ['conversations', 'unread']);
});

test('staff replies: validation, the retry id, the client\'s unread count and the 4000 character limit', async () => {
  const admin = await makeAdmin();
  const person = await makeUser();
  await say(person.token, 'Hello');
  const id = String((await conversationOf(person.id))._id);
  const retry = crypto.randomUUID();
  const first = await api('POST', `/admin/conversations/${id}/messages`, { token: admin.token, body: { body: 'Staff answer', clientMessageId: retry } });
  const again = await api('POST', `/admin/conversations/${id}/messages`, { token: admin.token, body: { body: 'Staff answer', clientMessageId: retry } });
  assert.deepEqual([first.status, again.status, again.data.message.id], [201, 200, first.data.message.id]);
  assert.equal((await conversationOf(person.id)).staffMsgCount, 1);
  assert.equal((await api('GET', '/unread', { token: person.token })).data.unread, 1);
  assert.equal((await reply(admin.token, id, 'y'.repeat(4000))).status, 201);
  for (const [body, code] of [['', 'MESSAGE_EMPTY'], ['   ', 'MESSAGE_EMPTY'], ['y'.repeat(4001), 'MESSAGE_TOO_LONG']]) {
    const res = await reply(admin.token, id, body);
    assert.deepEqual([res.status, res.json.code], [400, code]);
  }
  for (const extra of [{ sender: 'client' }, { status: 'open' }, { user: person.id }]) assert.equal((await reply(admin.token, id, 'Hi', extra)).status, 400);
  assert.equal((await conversationOf(person.id)).staffMsgCount, 2);
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test('delete: admin only, permanent (conversation and messages), written to the security log first, with ids and counts and never the text', async () => {
  const admin = await makeAdmin();
  const person = await makeUser();
  const MARKER = 'DELETE-TEST-MARKER-55';
  await say(person.token, `Please keep ${MARKER}`);
  const convo = await conversationOf(person.id);
  const id = String(convo._id);
  await reply(admin.token, id, 'Noted');

  assert.equal((await api('DELETE', `/admin/conversations/${id}`, { token: person.token })).status, 403, 'the owner is not an admin');
  assert.equal((await api('DELETE', `/admin/conversations/${id}`)).status, 401);
  assert.equal(await ContactMessage.countDocuments({ conversation: convo._id }), 2, 'refused requests deleted nothing');

  let res;
  const logs = await capturing(async () => { res = await api('DELETE', `/admin/conversations/${id}`, { token: admin.token }); });
  assert.equal(res.status, 204);
  assert.equal(await ContactConversation.countDocuments({ _id: convo._id }), 0);
  assert.equal(await ContactMessage.countDocuments({ conversation: convo._id }), 0);
  const events = logs.split('\n').filter((line) => line.includes('"event":"chat_conversation_deleted"')).map((line) => JSON.parse(line));
  assert.equal(events.length, 1, logs);
  assert.equal(events[0].userId, admin.id, 'who deleted it');
  assert.equal(events[0].route, '/api/chat/admin/conversations/:id');
  assert.equal(events[0].messages, 2);
  assert.equal(logs.includes(MARKER), false);
  assert.equal(logs.includes(id), false, 'not even the conversation id: the route pattern and the counts are enough');

  assert.equal((await api('DELETE', `/admin/conversations/${id}`, { token: admin.token })).status, 404);
  // The person can start again: it is a new conversation.
  const fresh = await say(person.token, 'A fresh start');
  assert.equal(fresh.status, 201);
  assert.equal(fresh.data.message.seq, 1);
});

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

test('emails: a new client message emails the staff mailbox, a staff reply emails the client; neither carries the message text', async () => {
  const admin = await makeAdmin();
  const person = await makeUser({ name: 'Mail Person', email: 'mail.person@example.invalid' });
  const MARKER = 'EMAIL-BODY-MARKER-31337';
  await say(person.token, `Question with ${MARKER}`, { subject: 'Topic for staff' });
  assert.equal(mailbox.sent.length, 1);
  const staffMail = mailbox.sent[0];
  assert.equal(staffMail.to, 'staff.inbox@example.invalid');
  assert.equal(staffMail.from, 'sender.test@example.invalid');
  const id = String((await conversationOf(person.id))._id);
  assert.ok(staffMail.text.includes(`https://admin.example.invalid/admin/contacts/${id}`));
  assert.ok(staffMail.html.includes('Mail Person') && staffMail.html.includes('Topic for staff'));
  assert.equal(JSON.stringify(staffMail).includes(MARKER), false);

  await reply(admin.token, id, `Answer with ${MARKER}`);
  assert.equal(mailbox.sent.length, 2);
  const clientMail = mailbox.sent[1];
  assert.equal(clientMail.to, 'mail.person@example.invalid');
  assert.ok(clientMail.text.includes('https://site.example.invalid/contact?chat=open'));
  assert.equal(JSON.stringify(clientMail).includes(MARKER), false);
  assert.equal(JSON.stringify(clientMail).includes('Topic for staff'), false, 'the client email has no topic either');
});

test('emails are throttled per conversation and direction (one in 3 hours), and come again after the time has passed', async () => {
  const admin = await makeAdmin();
  const person = await makeUser();
  await say(person.token, 'First');
  await say(person.token, 'Second');
  await say(person.token, 'Third');
  assert.equal(mailbox.sent.filter((m) => m.to === 'staff.inbox@example.invalid').length, 1, 'three messages, one staff email');
  const convo = await conversationOf(person.id);
  const id = String(convo._id);
  await reply(admin.token, id, 'Reply one');
  await reply(admin.token, id, 'Reply two');
  assert.equal(mailbox.sent.length, 2, 'one staff email and one client email');

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
  await ContactConversation.collection.updateOne({ _id: convo._id }, { $set: { lastAdminEmailAt: fourHoursAgo, lastClientEmailAt: fourHoursAgo } });
  await say(person.token, 'Fourth, much later');
  await reply(admin.token, id, 'Reply three, much later');
  assert.equal(mailbox.sent.length, 4, 'both directions email again after three hours');
  const threeHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await ContactConversation.collection.updateOne({ _id: convo._id }, { $set: { lastAdminEmailAt: threeHoursAgo } });
  await say(person.token, 'Fifth, two hours later');
  assert.equal(mailbox.sent.length, 4, 'two hours is still inside the limit');
});

test('two messages at the same moment send one email (the slot is taken by one atomic update)', async () => {
  const person = await makeUser();
  await Promise.all([say(person.token, 'Together one'), say(person.token, 'Together two'), say(person.token, 'Together three')]);
  assert.equal(mailbox.sent.length, 1);
});

test('a global cap on staff emails (per hour) stops a flood of new accounts from filling the mailbox; the chat itself is unaffected and the slot is given back', async () => {
  const { HourlyCap } = require('../services/contactChatMailService');
  const original = chatService.mail.cap;
  chatService.mail.cap = new HourlyCap(2);
  try {
    const people = [await makeUser(), await makeUser(), await makeUser()];
    for (const person of people) assert.equal((await say(person.token, 'Hello from a new account')).status, 201);
    assert.equal(mailbox.sent.length, 2, 'two emails, the third was held back');
    assert.equal((await conversationOf(people[2].id)).lastAdminEmailAt, undefined, 'the held-back conversation can email on its next message');
    assert.equal(await ContactMessage.countDocuments({ conversation: (await conversationOf(people[2].id))._id }), 1, 'the message itself is stored');
  } finally {
    chatService.mail.cap = original;
  }
});

test('a failed email never breaks the chat: the message is stored, the answer is 201, the log has a code only, and the next message tries again', async () => {
  const person = await makeUser({ email: 'fails.person@example.invalid' });
  mailbox.fail = true;
  let res;
  const logs = await capturing(async () => { res = await say(person.token, 'Message while mail is down'); });
  assert.equal(res.status, 201);
  assert.equal((await conversationOf(person.id)).messageCount, 1);
  assert.equal(mailbox.sent.length, 0);
  assert.ok(logs.includes('auth_failed EAUTH'), logs);
  for (const needle of ['fails.person@example.invalid', 'staff.inbox@example.invalid', 'Message while mail is down', 'dummy-password-for-tests']) assert.equal(logs.includes(needle), false, needle);
  assert.equal((await conversationOf(person.id)).lastAdminEmailAt, undefined, 'the slot was given back, so the next message can try again');
  mailbox.fail = false;
  await say(person.token, 'Mail is back');
  assert.equal(mailbox.sent.length, 1);
});

test('with no mail settings (local development) the chat works fully and nothing is sent or thrown', async () => {
  const saved = process.env.EMAIL_USER;
  delete process.env.EMAIL_USER;
  try {
    const admin = await makeAdmin();
    const person = await makeUser();
    assert.equal((await say(person.token, 'No mail here')).status, 201);
    const id = String((await conversationOf(person.id))._id);
    assert.equal((await reply(admin.token, id, 'Answer')).status, 201);
    assert.equal(mailbox.sent.length, 0);
    assert.equal((await conversationOf(person.id)).lastAdminEmailAt, undefined);
  } finally {
    process.env.EMAIL_USER = saved;
  }
});

// ---------------------------------------------------------------------------
// 30 days without a message: Closed (status only)
// ---------------------------------------------------------------------------

test('no message for 30 days: the conversation is Closed when it is looked at (the client, the inbox, the badge); nothing is deleted; a message re-opens it', async () => {
  const admin = await makeAdmin();
  const old = await makeUser();
  const recent = await makeUser();
  await say(old.token, 'An old question');
  await say(recent.token, 'A recent question');
  const days = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  await ContactConversation.collection.updateOne({ user: old.user._id }, { $set: { lastMessageAt: days(31) } });
  await ContactConversation.collection.updateOne({ user: recent.user._id }, { $set: { lastMessageAt: days(29) } });
  const idOld = String((await conversationOf(old.id))._id);

  // The staff's inbox sweeps (at most every five minutes per process; the test lets it).
  chatService.lastSweep = 0;
  const inbox = await api('GET', '/admin/conversations?status=closed&limit=50', { token: admin.token });
  assert.ok(inbox.data.items.some((i) => i.id === idOld), 'the 31-day-old conversation is closed');
  assert.equal(inbox.data.items.some((i) => i.user.name === recent.user.name), false, '29 days is still open');
  const stored = await conversationOf(old.id);
  assert.equal(stored.status, 'closed');
  assert.ok(stored.autoClosedAt instanceof Date);
  assert.equal(await ContactMessage.countDocuments({ conversation: stored._id }), 1, 'nothing was deleted');
  assert.equal(stored.unreadForStaff, 1, 'unread is unchanged: staff still see that they have not answered');

  // The client sees it closed, and a new message re-opens it.
  assert.equal((await api('GET', '/conversation', { token: old.token })).data.conversation.status, 'closed');
  const back = await say(old.token, 'I am back');
  assert.equal(back.data.conversation.status, 'open');
  assert.equal((await conversationOf(old.id)).autoClosedAt, undefined);

  // A person's own conversation is checked when they look, without any inbox sweep.
  const third = await makeUser();
  await say(third.token, 'Quiet one');
  await ContactConversation.collection.updateOne({ user: third.user._id }, { $set: { lastMessageAt: days(40) } });
  assert.equal((await api('GET', '/unread', { token: third.token })).data.status, 'closed');
});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

test('sending is limited per user (8 a minute): the ninth quick message is a 429 with a code, other users are unaffected, and reading is not blocked', async () => {
  const busy = await makeUser();
  const other = await makeUser();
  const statuses = [];
  for (let i = 0; i < 9; i += 1) statuses.push((await say(busy.token, `Message number ${i} of a burst`)).status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 201, 201, 201, 429]);
  const refused = await say(busy.token, 'One more');
  assert.deepEqual([refused.status, refused.json.code], [429, 'TOO_MANY_MESSAGES']);
  assert.equal(JSON.stringify(refused.json).includes('One more'), false, 'nothing the caller sent comes back');
  assert.equal((await conversationOf(busy.id)).messageCount, 8, 'the refused message was not stored');
  assert.equal((await say(other.token, 'Another person is fine')).status, 201, 'the limit is per user, not per address');
  assert.equal((await api('GET', '/conversation', { token: busy.token })).status, 200, 'looking is not limited by the sending budget');
  assert.equal((await api('GET', '/unread', { token: busy.token })).status, 200);
});

test('the checks for new messages have a generous per-user budget of their own (600 in 15 minutes), a refused one is a 429 with a code', async () => {
  const { LIMITS } = require('../config/contactChat');
  assert.equal(LIMITS.poll.max, 600);
  assert.equal(LIMITS.poll.windowMs, 15 * 60 * 1000);
  const { makeLimiter } = require('../middleware/chatLimits');
  const tiny = makeLimiter({ ...LIMITS.poll, max: 3 });
  const app = express();
  app.use((req, res, next) => { req.user = { _id: req.headers['x-user'] }; next(); });
  app.get('/poll', tiny, (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = `http://127.0.0.1:${srv.address().port}/poll`;
    const seen = [];
    for (let i = 0; i < 5; i += 1) seen.push((await fetch(url, { headers: { 'x-user': 'user-1' } })).status);
    assert.deepEqual(seen, [200, 200, 200, 429, 429]);
    assert.equal((await fetch(url, { headers: { 'x-user': 'user-2' } })).status, 200, 'another user has their own count');
    const res = await fetch(url, { headers: { 'x-user': 'user-1' } });
    assert.equal((await res.json()).code, 'TOO_MANY_REQUESTS');
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('a conversation stops growing at 2000 messages with a clear code', async () => {
  const person = await makeUser();
  await say(person.token, 'Start');
  await ContactConversation.collection.updateOne({ user: person.user._id }, { $set: { messageCount: 2000 } });
  const res = await say(person.token, 'One too many');
  assert.deepEqual([res.status, res.json.code], [409, 'CONVERSATION_FULL']);
});
