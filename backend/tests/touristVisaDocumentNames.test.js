'use strict';

// Friendly file names of uploaded documents, the parts that need no database: the header rules (contentDispositionFor for a document), the
// signed link that carries the name (the real signer, made-up credentials, no network), the helper that works the name out of an application,
// and the proof that the stored key and the upload are not touched. The API side (Overview, link, owner and admin access) is in
// touristVisaAdmin.test.js; the name rules themselves are in shared/tourist-visa/documentNames.test.js. Made-up data only.

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { contentDispositionFor, pdfFileName, DOCUMENT_EXTENSIONS } = require('../utils/pdfFileName');
const { friendlyDocumentNames } = require('../utils/touristVisaDocumentNames');
const { R2DocumentStorage } = require('../config/touristVisaStorage');
const { fullName } = require('../shared/tourist-visa/view');

const CREDENTIALS = {
  R2_ACCOUNT_ID: 'testaccount0123456789abcdef01234567',
  R2_ACCESS_KEY_ID: 'TESTACCESSKEYID0000',
  R2_SECRET_ACCESS_KEY: 'test-secret-access-key-not-real',
  R2_PRIVATE_BUCKET: 'test-private-bucket',
};
const KEY = 'tourist-visa/app123/0123456789abcdef.pdf';
const inTwoMinutes = () => new Date(Date.now() + 120 * 1000);
const disposition = (link) => new URL(link).searchParams.get('response-content-disposition');

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

test('the header for a document: an attachment or an inline file named by a plain safe name; the old PDF form is unchanged', () => {
  const docs = { extensions: DOCUMENT_EXTENSIONS };
  assert.equal(contentDispositionFor('Roohullah-Shah-Passport.pdf', docs), 'attachment; filename="Roohullah-Shah-Passport.pdf"');
  assert.equal(contentDispositionFor('Roohullah-Shah-Passport.jpg', { ...docs, inline: true }), 'inline; filename="Roohullah-Shah-Passport.jpg"');
  assert.equal(contentDispositionFor('Roohullah-Shah-Passport', docs), 'attachment; filename="Roohullah-Shah-Passport"', 'no extension is allowed for a document');
  // The PDF form: exactly as before.
  assert.equal(contentDispositionFor('Roohullah-Shah-Cover-Letter.pdf'), 'attachment; filename="Roohullah-Shah-Cover-Letter.pdf"');
  assert.equal(contentDispositionFor('Roohullah-Shah-Passport.jpg'), 'attachment; filename="document.pdf"', 'a PDF name must be a PDF name');
  assert.equal(contentDispositionFor('Roohullah-Shah-Passport'), 'attachment; filename="document.pdf"');
});

test('header safety: quotes, semicolons, line breaks, slashes, accents, other scripts, emoji, long names and bad extensions never reach a header', () => {
  const bad = ['a"b.pdf', 'a;b.pdf', 'a\r\nSet-Cookie: x=1.pdf', 'a\nb.pdf', '../x.pdf', 'a/b.pdf', 'a\\b.pdf', 'a b.pdf', 'é.pdf', 'أحمد.pdf', 'a\u{1F600}.pdf', 'x.exe', 'x.html', 'x.pdf.exe', '.pdf', '-x.pdf', '', null, undefined, 42, {}, [], `${'a'.repeat(250)}.pdf`, 'a.p%64f', 'a%0d%0a.pdf'];
  for (const value of bad) {
    for (const options of [{}, { inline: true }, { extensions: DOCUMENT_EXTENSIONS }, { extensions: DOCUMENT_EXTENSIONS, inline: true }]) {
      const header = contentDispositionFor(value, options);
      assert.match(header, /^(attachment|inline); filename="[A-Za-z0-9][A-Za-z0-9-]*(\.[a-z0-9]{1,5})?"$/, JSON.stringify(value));
      assert.equal(header.split('\n').length, 1);
      assert.equal(header.includes('\r'), false);
      assert.ok(header.endsWith('document.pdf"'), `${JSON.stringify(value)} is replaced, not put in a header`);
    }
  }
  // A caller cannot widen the list with something unsafe.
  assert.equal(contentDispositionFor('a.x"y', { extensions: ['x"y', 'pdf'] }), 'attachment; filename="document.pdf"');
  assert.equal(contentDispositionFor('a.exe', { extensions: ['exe'] }), 'attachment; filename="a.exe"', 'only the list the caller gives, and only safe words in it');
});

test('a fuzz of 2000 names and file names: every document header is one clean line', () => {
  const pieces = ['Roohullah', 'Shah', ' ', '-', '"', ';', '\r', '\n', '/', '\\', '.', ':', '%', '\u0000', 'é', 'ß', '\u{1F600}', 'أحمد', '‮', '<', '>', '$'];
  let seed = 4242;
  const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  const slots = ['passport', 'funds', 'hotels', 'noc', 'gone'];
  for (let i = 0; i < 2000; i += 1) {
    const name = Array.from({ length: 1 + (next() % 12) }, () => pieces[next() % pieces.length]).join('');
    const original = Array.from({ length: 1 + (next() % 8) }, () => pieces[next() % pieces.length]).join('') + ['', '.pdf', '.exe', '.JPG'][next() % 4];
    const documents = [{ id: 'a', slot: slots[next() % 5], originalName: original }, { id: 'b', slot: slots[next() % 5], format: 'png' }];
    const names = friendlyDocumentNames({ answers: { q2_1: name, q2_2: pieces[next() % pieces.length] }, reference: 'TV-K7M3QD9R', documents });
    for (const id of ['a', 'b']) {
      const header = contentDispositionFor(names[id], { extensions: DOCUMENT_EXTENSIONS, inline: next() % 2 === 0 });
      assert.match(header, /^(attachment|inline); filename="[A-Za-z0-9][A-Za-z0-9-]*(\.[a-z0-9]{1,5})?"$/, JSON.stringify([name, original]));
      assert.equal(header.includes('document.pdf'), false, `a name made here is always accepted: ${names[id]}`);
    }
  }
});

// ---------------------------------------------------------------------------
// The signed link carries the name
// ---------------------------------------------------------------------------

test('the signed link names the saved file; without a name it is exactly the old link; the signature covers the name', async () => {
  const adapter = new R2DocumentStorage({ env: CREDENTIALS });
  const plain = await adapter.temporaryUrl({ publicId: KEY }, inTwoMinutes());
  assert.equal(disposition(plain), null, 'no name asked for: no header in the link, as before');

  const named = await adapter.temporaryUrl({ publicId: KEY }, inTwoMinutes(), { fileName: 'Roohullah-Shah-Passport.pdf' });
  assert.equal(disposition(named), 'inline; filename="Roohullah-Shah-Passport.pdf"');
  assert.equal(new URL(named).pathname, `/${KEY}`, 'the stored key is not changed: the object is the same random one');
  assert.equal(named.includes(CREDENTIALS.R2_SECRET_ACCESS_KEY), false);
  assert.ok(new URL(named).searchParams.get('X-Amz-Signature'));

  const other = await adapter.temporaryUrl({ publicId: KEY }, inTwoMinutes(), { fileName: 'Someone-Else-Passport.pdf' });
  assert.notEqual(new URL(other).searchParams.get('X-Amz-Signature'), new URL(named).searchParams.get('X-Amz-Signature'), 'a changed name is a changed signature');
});

test('a hostile name never reaches the link: it becomes document.pdf', async () => {
  const adapter = new R2DocumentStorage({ env: CREDENTIALS });
  for (const fileName of ['a"; filename=evil.exe', 'a\r\nSet-Cookie: x=1', '../../x.pdf', 'é.pdf', 'x.exe']) {
    const link = await adapter.temporaryUrl({ publicId: KEY }, inTwoMinutes(), { fileName });
    assert.equal(disposition(link), 'inline; filename="document.pdf"', JSON.stringify(fileName));
  }
  for (const empty of ['', undefined, null, 42]) {
    assert.equal(disposition(await adapter.temporaryUrl({ publicId: KEY }, inTwoMinutes(), { fileName: empty })), null, `nothing asked for: ${JSON.stringify(empty)}`);
  }
});

test('the stored key is still random and carries no part of any name', async () => {
  const sent = [];
  const adapter = new R2DocumentStorage({ env: CREDENTIALS, client: { send: async (command) => { sent.push(command); return {}; } } });
  const result = await adapter.upload(Buffer.from('%PDF-1.7\n'), { applicationId: 'app123', extension: 'pdf' });
  assert.match(result.publicId, /^tourist-visa\/app123\/[0-9a-f]{32}\.pdf$/);
  assert.deepEqual(Object.keys(result).sort(), ['bytes', 'publicId', 'resourceType']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.Key, result.publicId);
  assert.equal(Object.prototype.hasOwnProperty.call(sent[0].input, 'ContentDisposition'), false, 'the stored object has no name of its own either');
});

// ---------------------------------------------------------------------------
// Working the names out of an application
// ---------------------------------------------------------------------------

test('friendlyDocumentNames reads the given and family names (q2_1, q2_2) and the reference of an application, and nothing else', () => {
  const application = {
    reference: 'TV-K7M3QD9R',
    answers: { q2_1: 'Roohullah', q2_2: 'Shah', q3_1: 'FAKE-PASSPORT-9876' },
    documents: [
      { id: 'a', slot: 'passport', format: 'pdf', uploadedAt: '2027-01-05T10:00:00Z', originalName: 'dsfew6567reww.pdf', publicId: 'tourist-visa/x/random.pdf' },
      { id: 'b', slot: 'funds', format: 'pdf', uploadedAt: '2027-01-05T10:01:00Z', originalName: 'q1.pdf' },
      { id: 'c', slot: 'funds', format: 'jpg', uploadedAt: '2027-01-05T10:02:00Z', originalName: 'q2.jpg' },
    ],
  };
  assert.deepEqual(friendlyDocumentNames(application), {
    a: 'Roohullah-Shah-Passport.pdf',
    b: 'Roohullah-Shah-Bank-Statement-1.pdf',
    c: 'Roohullah-Shah-Bank-Statement-2.jpg',
  });
  assert.equal(JSON.stringify(friendlyDocumentNames(application)).includes('FAKE-PASSPORT'), false, 'no other answer is used');
  assert.equal(application.documents[0].originalName, 'dsfew6567reww.pdf', 'the application is not modified');

  assert.equal(friendlyDocumentNames({ ...application, answers: { q2_1: 'Roohullah' } }).a, 'Roohullah-Passport.pdf', 'no family name');
  assert.equal(friendlyDocumentNames({ ...application, answers: {} }).a, 'TV-K7M3QD9R-Passport.pdf', 'no name: the reference');
  assert.equal(friendlyDocumentNames({ ...application, answers: {}, reference: undefined }).a, 'Passport.pdf', 'neither: the label');
  assert.deepEqual(friendlyDocumentNames(null), {});
  assert.deepEqual(friendlyDocumentNames({}), {});
});

test('the name of a document is the name of the downloaded PDFs for the same person: one rule for both', () => {
  const answers = { q2_1: 'José María', q2_2: 'Núñez-Pérez' };
  const person = fullName(answers.q2_1, answers.q2_2);
  const document = friendlyDocumentNames({ answers, documents: [{ id: 'a', slot: 'passport', format: 'pdf' }] }).a;
  const pdf = pdfFileName({ name: person, type: 'cover_letter' });
  assert.equal(document, 'Jose-Maria-Nunez-Perez-Passport.pdf');
  assert.equal(pdf, 'Jose-Maria-Nunez-Perez-Cover-Letter.pdf');
  assert.equal(document.split('-Passport')[0], pdf.split('-Cover-Letter')[0]);
});
