'use strict';

// The mail helper (config/mail.js) and the two places that send mail through it (the contact emails and the comment email). A fake transport
// only: nothing reaches the network. The "same as before" tests compare with tests/helpers/mailGolden.json, which holds exactly what the
// senders handed to the transport before the helper existed (recorded from the old code with made-up input). Made-up data only.

process.env.NODE_ENV = 'test';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

const { createMailer, getMailSettings } = require('../config/mail');
const contactService = require('../services/contactSubmissionService');
const formService = require('../services/formSubmissionService');
const golden = require('./helpers/mailGolden.json');

const PASSWORD_A = 'dummy-password-A';
const PASSWORD_B = 'dummy-password-B';
const SENDER = 'sender.test@example.invalid';
const VISITOR = 'visitor.test@example.invalid';

/** A mailer with its own environment, a fake transport that remembers what it was given, and a log it can read. */
function harness(env, { sendMail = async () => ({}), timeoutMs } = {}) {
  const built = [];
  const sent = [];
  const lines = { warn: [], error: [] };
  const mailer = createMailer({
    env,
    timeoutMs,
    createTransport: (options) => {
      built.push(options);
      return { sendMail: (mail) => { sent.push(mail); return sendMail(mail); } };
    },
    log: { warn: (...a) => lines.warn.push(a.join(' ')), error: (...a) => lines.error.push(a.join(' ')), info: () => {} },
  });
  return { mailer, built, sent, lines };
}

// ---------------------------------------------------------------------------
// The settings: which name wins
// ---------------------------------------------------------------------------

test('the password is EMAIL_PASSWORD, then EMAIL_PASS; an empty or blank value does not count', async () => {
  const both = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A, EMAIL_PASS: PASSWORD_B });
  assert.deepEqual(await both.mailer.sendMail({ to: VISITOR, subject: 's' }), { sent: true });
  assert.equal(both.built[0].auth.pass, PASSWORD_A, 'EMAIL_PASSWORD wins');

  const older = harness({ EMAIL_USER: SENDER, EMAIL_PASS: PASSWORD_B });
  assert.equal((await older.mailer.sendMail({ to: VISITOR, subject: 's' })).sent, true);
  assert.equal(older.built[0].auth.pass, PASSWORD_B, 'only the older name is set: it is used');

  for (const blank of ['', '   ', undefined]) {
    const h = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: blank, EMAIL_PASS: PASSWORD_B });
    await h.mailer.sendMail({ to: VISITOR, subject: 's' });
    assert.equal(h.built[0].auth.pass, PASSWORD_B, `EMAIL_PASSWORD ${JSON.stringify(blank)} falls back`);
  }
});

test('the other names: service (default gmail), user, admin address (falls back to the user), site links', () => {
  const plain = getMailSettings({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A });
  assert.equal(plain.service, 'gmail');
  assert.equal(plain.user, SENDER);
  assert.equal(plain.adminTo, SENDER, 'no ADMIN_EMAIL: the sending account');
  assert.equal(plain.siteUrl, '');
  assert.equal(plain.configured, true);

  const full = getMailSettings({ EMAIL_SERVICE: ' outlook ', EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A, ADMIN_EMAIL: 'staff@example.invalid', FRONTEND_URL: 'https://site.example.invalid/', ADMIN_PANEL_URL: 'https://admin.example.invalid//' });
  assert.equal(full.service, 'outlook');
  assert.equal(full.adminTo, 'staff@example.invalid');
  assert.equal(full.siteUrl, 'https://site.example.invalid', 'FRONTEND_URL first, no trailing slash');
  assert.equal(full.adminPanelUrl, 'https://admin.example.invalid', 'the admin link keeps preferring ADMIN_PANEL_URL');
  assert.equal(getMailSettings({ ADMIN_PANEL_URL: 'https://only-old.example.invalid' }).siteUrl, 'https://only-old.example.invalid', 'the older name is used when FRONTEND_URL is empty');
  assert.equal(getMailSettings({ FRONTEND_URL: 'https://only-new.example.invalid' }).adminPanelUrl, 'https://only-new.example.invalid');
});

test('the settings never contain the password, so they can be logged or returned', () => {
  const settings = getMailSettings({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A, EMAIL_PASS: PASSWORD_B });
  const text = JSON.stringify(settings);
  assert.equal(text.includes(PASSWORD_A) || text.includes(PASSWORD_B), false);
});

// ---------------------------------------------------------------------------
// Not configured (local development)
// ---------------------------------------------------------------------------

test('with no mail settings nothing is sent, nothing throws, and one quiet line names the missing variables', async () => {
  const h = harness({});
  assert.deepEqual(await h.mailer.sendMail({ to: VISITOR, subject: 'Hello', html: '<p>x</p>', label: 'test_mail' }), { sent: false, reason: 'not_configured' });
  assert.equal(h.built.length, 0, 'no transporter is built');
  assert.equal(h.sent.length, 0);
  assert.deepEqual(h.lines.error, [], 'a missing setting is not an error');
  assert.equal(h.lines.warn.length, 1);
  assert.ok(h.lines.warn[0].includes('EMAIL_USER') && h.lines.warn[0].includes('EMAIL_PASSWORD'));
  await h.mailer.sendMail({ to: VISITOR, subject: 'Again' });
  assert.equal(h.lines.warn.length, 1, 'said once, not on every email');
  assert.equal(h.mailer.isConfigured(), false);
});

test('only one of the two missing: the line names only that one; a user without a password is not configured', async () => {
  const noPassword = harness({ EMAIL_USER: SENDER });
  assert.equal((await noPassword.mailer.sendMail({ to: VISITOR, subject: 's' })).reason, 'not_configured');
  assert.ok(noPassword.lines.warn[0].includes('EMAIL_PASSWORD') && !noPassword.lines.warn[0].includes('EMAIL_USER'));
  assert.equal(noPassword.lines.warn[0].includes(SENDER), false, 'names only, never a value');
  const noUser = harness({ EMAIL_PASSWORD: PASSWORD_A });
  assert.equal((await noUser.mailer.sendMail({ to: VISITOR, subject: 's' })).sent, false);
  assert.equal(noUser.lines.warn[0].includes(PASSWORD_A), false);
});

// ---------------------------------------------------------------------------
// A send that works, and what the transport is given
// ---------------------------------------------------------------------------

test('a send that works: the sender account is the default "from", the label is not sent, the transporter is built once and rebuilt when the settings change', async () => {
  const env = { EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A, EMAIL_SERVICE: 'gmail' };
  const h = harness(env);
  assert.deepEqual(await h.mailer.sendMail({ to: VISITOR, subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', label: 'test_mail' }), { sent: true });
  await h.mailer.sendMail({ to: VISITOR, subject: 'Second', html: '<p>2</p>' });
  assert.equal(h.built.length, 1, 'one transporter for the same settings');
  assert.deepEqual(h.built[0], { service: 'gmail', auth: { user: SENDER, pass: PASSWORD_A } });
  assert.deepEqual(h.sent[0], { from: SENDER, to: VISITOR, subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' });
  assert.equal('label' in h.sent[0], false);
  env.EMAIL_PASSWORD = PASSWORD_B;
  await h.mailer.sendMail({ to: VISITOR, subject: 'Third' });
  assert.equal(h.built.length, 2, 'a changed password builds a new transporter');
  assert.equal(h.built[1].auth.pass, PASSWORD_B);
  await h.mailer.sendMail({ to: VISITOR, subject: 'Own from', from: 'Someone <other@example.invalid>' });
  assert.equal(h.sent.at(-1).from, 'Someone <other@example.invalid>', 'a caller may still choose the "from"');
});

// ---------------------------------------------------------------------------
// A send that fails
// ---------------------------------------------------------------------------

test('a failure returns a result with a reason and never throws', async () => {
  const cases = [
    [{ code: 'EAUTH' }, 'auth_failed', 'EAUTH'],
    [{ responseCode: 535 }, 'auth_failed', undefined],
    [{ code: 'ETIMEDOUT' }, 'timeout', 'ETIMEDOUT'],
    [{ code: 'ECONNECTION' }, 'connection', 'ECONNECTION'],
    [{ code: 'ENOTFOUND' }, 'connection', 'ENOTFOUND'],
    [{ code: 'ECONNREFUSED' }, 'connection', 'ECONNREFUSED'],
    [{ code: 'EENVELOPE' }, 'rejected', 'EENVELOPE'],
    [{ responseCode: 550 }, 'rejected', undefined],
    [{ code: 'SOMETHING_ELSE' }, 'error', 'SOMETHING_ELSE'],
    [{}, 'error', undefined],
  ];
  for (const [fields, reason, code] of cases) {
    const h = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A }, { sendMail: async () => { throw Object.assign(new Error('failed'), fields); } });
    const result = await h.mailer.sendMail({ to: VISITOR, subject: 's' });
    assert.equal(result.sent, false);
    assert.equal(result.reason, reason, JSON.stringify(fields));
    assert.equal(result.code, code, JSON.stringify(fields));
  }
});

test('odd failures do not throw either: a transport that throws at once, one that throws a non-error, a transport that cannot be built', async () => {
  const sync = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A }, { sendMail: () => { throw new Error('sync boom'); } });
  assert.equal((await sync.mailer.sendMail({ to: VISITOR, subject: 's' })).sent, false);
  const odd = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A }, { sendMail: async () => { throw 'a plain string'; } });
  assert.deepEqual(await odd.mailer.sendMail({ to: VISITOR, subject: 's' }), { sent: false, reason: 'error' });
  const unbuildable = createMailer({ env: { EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A }, createTransport: () => { throw new Error('cannot build'); }, log: { warn() {}, error() {}, info() {} } });
  assert.deepEqual(await unbuildable.sendMail({ to: VISITOR, subject: 's' }), { sent: false, reason: 'error' });
  assert.deepEqual(await createMailer({ env: {} , log: { warn() {}, error() {}, info() {} } }).sendMail(), { sent: false, reason: 'not_configured' }, 'called with nothing at all');
});

test('a send that takes too long returns "timeout"; when it fails later nothing is left unhandled', async () => {
  let rejectLate;
  const h = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A }, { timeoutMs: 20, sendMail: () => new Promise((resolve, reject) => { rejectLate = reject; }) });
  const started = Date.now();
  assert.deepEqual(await h.mailer.sendMail({ to: VISITOR, subject: 's', label: 'slow_mail' }), { sent: false, reason: 'timeout' });
  assert.ok(Date.now() - started < 2000);
  let unhandled = false;
  const watch = () => { unhandled = true; };
  process.once('unhandledRejection', watch);
  rejectLate(Object.assign(new Error('late failure'), { code: 'ECONNRESET' }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  process.removeListener('unhandledRejection', watch);
  assert.equal(unhandled, false, 'the late failure is handled');
});

test('the log has a fixed label, a reason and an error code, and nothing else: no password, address, subject, content or error message', async () => {
  const SECRET_TEXT = 'SECRET-BODY-TEXT-123';
  const error = Object.assign(new Error(`535 Authentication failed for ${SENDER} with ${PASSWORD_A} sending to ${VISITOR}: ${SECRET_TEXT}`), {
    code: 'EAUTH',
    response: `535-5.7.8 Username and Password not accepted for ${SENDER} ${PASSWORD_B}`,
    command: `AUTH PLAIN ${PASSWORD_A}`,
    responseCode: 535,
  });
  const h = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A, ADMIN_EMAIL: 'staff.inbox@example.invalid' }, { sendMail: async () => { throw error; } });
  const result = await h.mailer.sendMail({ to: VISITOR, subject: `Subject ${SECRET_TEXT}`, html: `<p>${SECRET_TEXT}</p>`, label: 'contact_confirmation' });
  assert.deepEqual(result, { sent: false, reason: 'auth_failed', code: 'EAUTH' });
  assert.deepEqual(h.lines.error, ['Mail not sent (contact_confirmation): auth_failed EAUTH']);
  const everything = JSON.stringify([result, h.lines]);
  for (const needle of [PASSWORD_A, PASSWORD_B, SENDER, VISITOR, 'staff.inbox', SECRET_TEXT, 'Authentication failed', 'AUTH PLAIN', '@']) {
    assert.equal(everything.includes(needle), false, `"${needle}" must not be in the result or the log`);
  }
});

test('what a caller or a failing server can put in a log through the label or the error code is limited', async () => {
  const hostile = Object.assign(new Error('x'), { code: `bad code with ${PASSWORD_A}\nnew line` });
  const h = harness({ EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A }, { sendMail: async () => { throw hostile; } });
  const result = await h.mailer.sendMail({ to: VISITOR, subject: 's', label: `Label with spaces ${VISITOR}\n` });
  assert.deepEqual(result, { sent: false, reason: 'error' }, 'a code that is not CAPITALS_AND_DIGITS is dropped');
  assert.deepEqual(h.lines.error, ['Mail not sent (mail): error']);
  assert.equal(h.lines.error.join('').includes(PASSWORD_A), false);
});

// ---------------------------------------------------------------------------
// The two existing senders: the same mail as before
// ---------------------------------------------------------------------------

const SAVED = ['EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_PASS', 'EMAIL_SERVICE', 'ADMIN_EMAIL', 'ADMIN_PANEL_URL', 'FRONTEND_URL'].map((name) => [name, process.env[name]]);
const realCreateTransport = nodemailer.createTransport;
afterEach(() => {
  for (const [name, value] of SAVED) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  nodemailer.createTransport = realCreateTransport;
});

function fakeTransport(behaviour = async () => ({})) {
  const sent = [];
  const built = [];
  nodemailer.createTransport = (options) => { built.push(options); return { sendMail: (mail) => { sent.push(mail); return behaviour(mail); } }; };
  return { sent, built };
}
function useMailEnvironment(extra = {}) {
  for (const name of ['EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_PASS', 'EMAIL_SERVICE', 'ADMIN_EMAIL', 'ADMIN_PANEL_URL', 'FRONTEND_URL']) delete process.env[name];
  Object.assign(process.env, { EMAIL_USER: SENDER, EMAIL_PASSWORD: PASSWORD_A, EMAIL_SERVICE: 'gmail', ADMIN_EMAIL: 'staff.inbox@example.invalid', ADMIN_PANEL_URL: 'https://site.example.invalid', ...extra });
}
const SUBMISSION = { name: 'Test <b>Person</b>', email: 'Visitor.Test@Example.invalid', phone: '+10000000000', subject: 'Question & "answers"', message: 'Line one\nLine <script>two</script>', createdAt: new Date('2027-01-05T10:00:00Z'), adminReply: { message: 'Our <i>reply</i> & thanks' } };
const FORM = { name: 'Form <User>', email: 'form.user@example.invalid', destinationCountry: 'Testland & Co', visaType: 'Tourist "Visa"', status: 'pending' };
const withDate = (mail) => ({ ...mail, html: mail.html.split('{{DATE}}').join(new Date('2027-01-05T10:00:00Z').toLocaleString()) });

test('the three contact emails and the comment email are exactly what they were: from, to, subject and the whole HTML', async () => {
  useMailEnvironment();
  const transport = fakeTransport();
  await contactService.sendConfirmationEmail(SUBMISSION);
  await contactService.sendAdminNotificationEmail(SUBMISSION);
  await contactService.sendReplyEmail(SUBMISSION);
  await formService.sendCommentEmail(FORM, { originalname: 'doc <1>.pdf' }, 'Please send a clearer copy & re-upload <now>.');
  const expected = golden.sent.map(withDate);
  assert.equal(transport.sent.length, 4);
  for (let i = 0; i < 4; i += 1) assert.deepEqual(transport.sent[i], expected[i], `email ${i + 1}`);
  assert.deepEqual(transport.sent.map((m) => m.from), [SENDER, SENDER, SENDER, SENDER]);
  assert.deepEqual(transport.sent.map((m) => m.to), ['Visitor.Test@Example.invalid', 'staff.inbox@example.invalid', 'Visitor.Test@Example.invalid', 'form.user@example.invalid']);
  assert.deepEqual(transport.built.every((o) => o.service === 'gmail' && o.auth.user === SENDER && o.auth.pass === PASSWORD_A), true);
});

test('the staff notice still goes to the sending account when there is no ADMIN_EMAIL, and links to localhost without an admin address', async () => {
  useMailEnvironment({ ADMIN_EMAIL: undefined, ADMIN_PANEL_URL: undefined });
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PANEL_URL;
  const transport = fakeTransport();
  await contactService.sendAdminNotificationEmail(SUBMISSION);
  assert.equal(transport.sent[0].to, SENDER);
  assert.ok(transport.sent[0].html.includes('href="http://localhost:3000/admin/contacts"'));
});

test('the comment email used EMAIL_PASS and still works with only that older name; the contact emails now accept it too', async () => {
  useMailEnvironment({ EMAIL_PASSWORD: undefined, EMAIL_PASS: PASSWORD_B });
  delete process.env.EMAIL_PASSWORD;
  const transport = fakeTransport();
  await formService.sendCommentEmail(FORM, { originalname: 'a.pdf' }, 'hello');
  await contactService.sendConfirmationEmail(SUBMISSION);
  assert.equal(transport.sent.length, 2);
  assert.ok(transport.built.every((o) => o.auth.pass === PASSWORD_B));
});

test('the comment email is still skipped when the customer has no email on file', async () => {
  useMailEnvironment();
  const transport = fakeTransport();
  await formService.sendCommentEmail({ ...FORM, email: '' }, { originalname: 'x.pdf' }, 'skipped');
  await formService.sendCommentEmail({ ...FORM, email: undefined }, { originalname: 'x.pdf' }, 'skipped');
  assert.equal(transport.sent.length, 0);
});

test('with no mail settings both senders skip quietly and return as before (nothing thrown, nothing sent)', async () => {
  for (const name of ['EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_PASS']) delete process.env[name];
  const transport = fakeTransport();
  await assert.doesNotReject(() => contactService.sendConfirmationEmail(SUBMISSION));
  await assert.doesNotReject(() => contactService.sendAdminNotificationEmail(SUBMISSION));
  await assert.doesNotReject(() => contactService.sendReplyEmail(SUBMISSION));
  await assert.doesNotReject(() => formService.sendCommentEmail(FORM, { originalname: 'a.pdf' }, 'hello'));
  assert.equal(transport.sent.length, 0);
  assert.equal(transport.built.length, 0);
});

test('when the mail server refuses, both senders still return normally, and the log carries no address, password or text', async () => {
  useMailEnvironment();
  fakeTransport(async () => { throw Object.assign(new Error(`rejected ${VISITOR} ${PASSWORD_A} ${SUBMISSION.message}`), { code: 'EAUTH' }); });
  const lines = [];
  const original = { error: console.error, log: console.log, info: console.info, warn: console.warn };
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map(String).join(' '));
  try {
    await assert.doesNotReject(() => contactService.sendConfirmationEmail(SUBMISSION));
    await assert.doesNotReject(() => contactService.sendAdminNotificationEmail(SUBMISSION));
    await assert.doesNotReject(() => contactService.sendReplyEmail(SUBMISSION));
    await assert.doesNotReject(() => formService.sendCommentEmail(FORM, { originalname: 'a.pdf' }, 'hello'));
  } finally {
    Object.assign(console, original);
  }
  const log = lines.join('\n');
  assert.ok(log.includes('auth_failed EAUTH'), log);
  for (const needle of [PASSWORD_A, VISITOR, SENDER, 'Line one', 'form.user', '@']) assert.equal(log.includes(needle), false, `"${needle}" is not in the log`);
});
