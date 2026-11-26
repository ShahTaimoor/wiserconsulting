'use strict';

// The parts of the Contact chat that need no database: cleaning and checking the text, the two email templates, the staff-email cap, and
// the email sender with a fake repository and a fake mailer (not configured, throttled, capped, failed, no recipient). Made-up data only.

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { cleanText, normaliseBody, normaliseSubject, normalisePhone } = require('../services/contactChatService');
const { ContactChatMail, HourlyCap, buildStaffNotice, buildClientNotice, oneLine } = require('../services/contactChatMailService');
const { CHAT, LIMITS, STATUSES } = require('../config/contactChat');

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

test('cleanText: plain text with plain line breaks; control, zero-width and direction characters removed; trimmed', () => {
  assert.equal(cleanText('  Hello  '), 'Hello');
  assert.equal(cleanText('a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(cleanText('a   \nb'), 'a\nb', 'trailing spaces on a line');
  assert.equal(cleanText('a\n\n\n\n\n\nb'), 'a\n\n\nb', 'long runs of empty lines');
  assert.equal(cleanText('a\u0000b\u0007c\u001bd\u007fe'), 'abcde');
  assert.equal(cleanText('a\u200bb\u202ec\u2066d\ufeffe\u2028f'), 'abcdef');
  assert.equal(cleanText('Tab\there'), 'Tab\there', 'a tab is kept');
  assert.equal(cleanText('<b>x</b> & "y" \'z\''), '<b>x</b> & "y" \'z\'', 'nothing is escaped or removed: it is text, shown as text');
  assert.equal(cleanText(12345), '12345');
});

test('normaliseBody: empty and blank are refused, the limit counts characters (not bytes), the longest allowed text passes', () => {
  assert.equal(code(() => normaliseBody('', 2000)), 'MESSAGE_EMPTY');
  assert.equal(code(() => normaliseBody(' \n\t ', 2000)), 'MESSAGE_EMPTY');
  assert.equal(code(() => normaliseBody('\u0000\u200b', 2000)), 'MESSAGE_EMPTY');
  assert.equal(code(() => normaliseBody('x'.repeat(2001), 2000)), 'MESSAGE_TOO_LONG');
  assert.equal(normaliseBody('x'.repeat(2000), 2000).length, 2000);
  assert.equal(Array.from(normaliseBody('\u{1F600}'.repeat(2000), 2000)).length, 2000, 'an emoji is one character');
  assert.equal(code(() => normaliseBody('\u{1F600}'.repeat(2001), 2000)), 'MESSAGE_TOO_LONG');
  assert.equal(code(() => normaliseBody(` ${'x'.repeat(2000)} `, 2000)), null, 'the spaces around do not count');
});

test('normaliseSubject: optional, one line, at most 80 characters', () => {
  assert.equal(normaliseSubject(undefined), undefined);
  assert.equal(normaliseSubject(null), undefined);
  assert.equal(normaliseSubject('   '), undefined);
  assert.equal(normaliseSubject('  A  topic\nwith\tbreaks '), 'A topic with breaks');
  assert.equal(normaliseSubject('x'.repeat(80)).length, 80);
  assert.equal(code(() => normaliseSubject('x'.repeat(81))), 'SUBJECT_TOO_LONG');
});

test('normalisePhone: optional; plus, digits, spaces, brackets and hyphens; 5 to 15 digits', () => {
  assert.equal(normalisePhone(undefined), undefined);
  assert.equal(normalisePhone(''), undefined);
  assert.equal(normalisePhone('  +92 300 1234567 '), '+92 300 1234567');
  assert.equal(normalisePhone('(021) 555-0100'), '(021) 555-0100');
  for (const bad of ['abc', '12', '+92 300 123x', '1234', '1'.repeat(16), `+${'1 '.repeat(14)}1`, '<script>', '+92\n300 1234567x', 'call me']) {
    assert.equal(code(() => normalisePhone(bad)), 'INVALID_PHONE', JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------

test('the staff notice: the sender and the topic, a link to the inbox, NO message text (it has no place to put one); everything escaped', () => {
  const mail = buildStaffNotice({ name: '<script>alert(1)</script> Name', topic: 'Topic "with" <b>html</b>', inboxUrl: 'https://admin.example.invalid/admin/contacts/abc123' });
  assert.equal(mail.subject, 'New chat message - <script>alert(1)</script> Name', 'the subject is plain text (mail clients do not render it as HTML)');
  assert.equal(mail.html.includes('<script>'), false);
  assert.ok(mail.html.includes('&lt;script&gt;'));
  assert.ok(mail.html.includes('&lt;b&gt;html&lt;/b&gt;'));
  assert.ok(mail.html.includes('https://admin.example.invalid/admin/contacts/abc123'));
  assert.ok(mail.text.includes('The message itself is not in this email.'));
  assert.equal(buildStaffNotice.length, 1, 'one argument: name, topic and a link; there is nowhere to pass a message');
  const nameless = buildStaffNotice({ name: '', topic: '', inboxUrl: 'https://x.example.invalid/a' });
  assert.ok(nameless.subject.includes('a visitor'));
  assert.equal(nameless.html.includes('Topic'), false);
});

test('the client notice: says that a reply is waiting and where to read it; no message text, no topic; says not to reply to the email', () => {
  const mail = buildClientNotice({ name: 'Made <i>Up</i>', siteUrl: 'https://site.example.invalid' });
  assert.equal(mail.subject, 'We have replied to your message - Wiser Consulting');
  assert.ok(mail.html.includes('https://site.example.invalid/contact?chat=open'));
  assert.ok(mail.text.includes('https://site.example.invalid/contact?chat=open'));
  assert.ok(mail.html.includes('Made &lt;i&gt;Up&lt;/i&gt;'));
  assert.equal(mail.html.includes('<i>'), false);
  assert.ok(/do not reply/i.test(mail.text));
  const noSite = buildClientNotice({ name: 'A', siteUrl: '' });
  assert.equal(noSite.html.includes('href'), false, 'no site address configured: no link, never a broken one');
});

test('oneLine: no line breaks, control characters or direction characters, bounded', () => {
  assert.equal(oneLine('a\r\nb\tc\u202ed'), 'a b c d');
  assert.equal(oneLine('x'.repeat(200), 80).length, 80);
  assert.equal(oneLine(null), '');
  assert.equal(oneLine('Subject\r\nBcc: someone@example.invalid'), 'Subject Bcc: someone@example.invalid', 'a line break can never start a new header');
});

test('the staff-email cap is a rolling hour', () => {
  let clock = 1_000_000;
  const cap = new HourlyCap(3, () => clock);
  assert.deepEqual([cap.take(), cap.take(), cap.take(), cap.take()], [true, true, true, false]);
  clock += 59 * 60 * 1000;
  assert.equal(cap.take(), false, 'still inside the hour');
  clock += 2 * 60 * 1000;
  assert.equal(cap.take(), true, 'the old ones have aged out');
});

// ---------------------------------------------------------------------------
// The sender: fake repository, fake mailer
// ---------------------------------------------------------------------------

function sender({ configured = true, claim = { previous: null }, mailResult = { sent: true }, cap } = {}) {
  const calls = { claims: [], releases: [], sent: [] };
  const repository = {
    claimEmailSlot: async (...args) => { calls.claims.push(args); return claim; },
    releaseEmailSlot: async (...args) => { calls.releases.push(args); },
  };
  const mailer = { isConfigured: () => configured, sendMail: async (mail) => { calls.sent.push(mail); return mailResult; } };
  const mail = new ContactChatMail({
    mailer,
    repository,
    cap: cap || new HourlyCap(30),
    settings: () => ({ adminTo: 'staff@example.invalid', adminPanelUrl: 'https://admin.example.invalid', siteUrl: 'https://site.example.invalid' }),
    now: () => new Date('2027-01-05T10:00:00Z'),
  });
  return { mail, calls };
}
const conversation = { _id: 'c1', subject: 'Topic' };
const user = { name: 'Name', email: 'client@example.invalid' };

test('the sender: not configured sends nothing and takes no slot; a slot that is taken too recently sends nothing', async () => {
  const off = sender({ configured: false });
  assert.deepEqual(await off.mail.notifyStaff({ conversation, user }), { sent: false, reason: 'not_configured' });
  assert.deepEqual(off.calls, { claims: [], releases: [], sent: [] });
  const soon = sender({ claim: null });
  assert.deepEqual(await soon.mail.notifyClient({ conversation, user }), { sent: false, reason: 'throttled' });
  assert.equal(soon.calls.sent.length, 0);
  assert.equal(soon.calls.claims[0][3], CHAT.EMAIL_THROTTLE_MS);
  assert.equal(CHAT.EMAIL_THROTTLE_MS, 3 * 60 * 60 * 1000);
});

test('the sender: the right recipient and link per direction; a failed send gives the slot back; the cap gives it back too; a client with no email gets nothing', async () => {
  const ok = sender();
  assert.deepEqual(await ok.mail.notifyStaff({ conversation, user }), { sent: true });
  assert.equal(ok.calls.sent[0].to, 'staff@example.invalid');
  assert.ok(ok.calls.sent[0].text.includes('https://admin.example.invalid/admin/contacts/c1'));
  assert.equal(ok.calls.claims[0][1], 'lastAdminEmailAt');
  await ok.mail.notifyClient({ conversation, user });
  assert.equal(ok.calls.sent[1].to, 'client@example.invalid');
  assert.equal(ok.calls.claims[1][1], 'lastClientEmailAt');

  const failed = sender({ claim: { previous: new Date('2027-01-01T00:00:00Z') }, mailResult: { sent: false, reason: 'auth_failed', code: 'EAUTH' } });
  assert.deepEqual(await failed.mail.notifyStaff({ conversation, user }), { sent: false, reason: 'auth_failed' });
  assert.equal(failed.calls.releases.length, 1);
  assert.deepEqual(failed.calls.releases[0].slice(1, 3), ['lastAdminEmailAt', new Date('2027-01-01T00:00:00Z')], 'the old time is put back');

  const capped = sender({ cap: new HourlyCap(0) });
  assert.deepEqual(await capped.mail.notifyStaff({ conversation, user }), { sent: false, reason: 'capped' });
  assert.equal(capped.calls.releases.length, 1);
  assert.equal(capped.calls.sent.length, 0);
  assert.equal((await sender().mail.notifyClient({ conversation, user: { name: 'No Mail', email: '' } })).reason, 'no_recipient');
  assert.equal((await sender().mail.notifyClient({ conversation, user: null })).reason, 'no_recipient');
  const cappedClient = sender({ cap: new HourlyCap(0) });
  assert.equal((await cappedClient.mail.notifyClient({ conversation, user })).sent, true, 'the cap is only for staff emails');
});

test('the sender never throws, whatever the repository or the mailer does', async () => {
  const broken = new ContactChatMail({
    mailer: { isConfigured: () => true, sendMail: async () => { throw new Error('boom'); } },
    repository: { claimEmailSlot: async () => { throw new Error('database down'); }, releaseEmailSlot: async () => {} },
    settings: () => ({}),
  });
  assert.deepEqual(await broken.notifyStaff({ conversation, user }), { sent: false, reason: 'error' });
  assert.deepEqual(await broken.notifyClient({ conversation, user }), { sent: false, reason: 'error' });
});

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

test('the limits are the planned ones', () => {
  assert.equal(CHAT.MAX_CLIENT_MESSAGE, 2000);
  assert.equal(CHAT.MAX_STAFF_MESSAGE, 4000);
  assert.equal(CHAT.AUTO_CLOSE_AFTER_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(CHAT.EMAIL_TIMEOUT_MS, 4000);
  assert.deepEqual([LIMITS.sendMinute.max, LIMITS.sendHour.max, LIMITS.sendDay.max], [8, 60, 300]);
  assert.equal(LIMITS.poll.max, 600);
  assert.deepEqual([...STATUSES], ['open', 'answered', 'closed']);
  for (const limit of Object.values(LIMITS)) assert.ok(limit.windowMs > 0 && limit.max > 0 && /^[A-Z_]+$/.test(limit.code));
  // Polling every 15 seconds for 15 minutes is 60 requests per tab: the budget leaves room for ten tabs.
  assert.ok(LIMITS.poll.max >= 10 * (LIMITS.poll.windowMs / 15000));
});
