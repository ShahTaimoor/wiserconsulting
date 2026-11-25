'use strict';

// The friendly file names of uploaded documents: "Roohullah-Shah-Passport.pdf". Pure functions, made-up names only. Run with:
//   node --test "shared/tourist-visa/*.test.js"

const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./engine');
const { fullName } = require('./view');
const { SLOT_FILE_LABELS, FALLBACK_LABEL, DOCUMENT_EXTENSIONS, MAX_NAME_LENGTH, safeNamePart, slotFileLabel, extensionOf, documentFileNames } = require('./documentNames');

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*(\.[a-z0-9]{1,5})?$/;
const at = (minute) => new Date(Date.UTC(2027, 0, 5, 10, minute, 0)).toISOString();
const doc = (id, slot, extra = {}) => ({ id, slot, format: 'pdf', uploadedAt: at(0), ...extra });

// ---------------------------------------------------------------------------
// The slot labels
// ---------------------------------------------------------------------------

test('every file slot of the form has a file-name label, with no stray labels and no two slots sharing one', () => {
  const slots = engine.getFileQuestions(engine.config).map((q) => q.slot);
  assert.equal(slots.length, 22, 'the form has 22 file slots (if this changes, give the new slot a label)');
  for (const slot of slots) assert.ok(Object.prototype.hasOwnProperty.call(SLOT_FILE_LABELS, slot), `slot "${slot}" has no label in documentNames.js`);
  assert.deepEqual(Object.keys(SLOT_FILE_LABELS).sort(), [...slots].sort(), 'a label for a slot the form does not have');
  const labels = Object.values(SLOT_FILE_LABELS);
  assert.equal(new Set(labels).size, labels.length, 'two slots share a label');
  assert.equal(labels.includes(FALLBACK_LABEL), false, 'the plain "Document" is only for slots that are not on the list');
});

test('every label is short, plain, words joined by hyphens, and safe in a file name', () => {
  for (const [slot, label] of Object.entries(SLOT_FILE_LABELS)) {
    assert.match(label, /^[A-Z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/, `${slot}: ${label}`);
    assert.ok(label.length <= 40, `${slot} is too long: ${label}`);
  }
  assert.equal(slotFileLabel('passport'), 'Passport');
  assert.equal(slotFileLabel('funds'), 'Bank-Statement');
  assert.equal(slotFileLabel('hotels'), 'Hotel-Booking');
  assert.equal(slotFileLabel('somethingnew'), FALLBACK_LABEL, 'an unknown slot');
  for (const bad of [undefined, null, 4, {}, ['passport'], '__proto__', 'constructor', 'toString']) assert.equal(slotFileLabel(bad), FALLBACK_LABEL, String(bad));
});

// ---------------------------------------------------------------------------
// The whole name
// ---------------------------------------------------------------------------

test('a normal name: <Given names>-<Family name>-<Slot label>.<extension>', () => {
  const names = documentFileNames({ documents: [doc('a', 'passport'), doc('b', 'funds')], name: fullName('Roohullah', 'Shah'), reference: 'TV-K7M3QD9R' });
  assert.deepEqual(names, { a: 'Roohullah-Shah-Passport.pdf', b: 'Roohullah-Shah-Bank-Statement.pdf' });
  const many = documentFileNames({ documents: [doc('a', 'passport')], name: fullName('Mary Anne', 'van der Berg') });
  assert.equal(many.a, 'Mary-Anne-van-der-Berg-Passport.pdf', 'several given names and a long family name');
});

test('a missing family name leaves no stray hyphen', () => {
  assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name: fullName('Roohullah', '') }).a, 'Roohullah-Passport.pdf');
  assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name: fullName('Roohullah', undefined) }).a, 'Roohullah-Passport.pdf');
});

test('a missing or unusable name falls back to the reference, and with no reference to the label alone: a name is never empty', () => {
  for (const name of [undefined, null, '', '   ', '李明', '\u{1F600}', '---', 42]) {
    assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name, reference: 'TV-K7M3QD9R' }).a, 'TV-K7M3QD9R-Passport.pdf', JSON.stringify(name));
    assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name }).a, 'Passport.pdf', JSON.stringify(name));
  }
  for (const reference of ['tv-lowercase', 'TV K7', 'TV-"x"\r\n', '', null, undefined, 'T', 'X'.repeat(80)]) {
    assert.equal(documentFileNames({ documents: [doc('a', 'passport')], reference }).a, 'Passport.pdf', `a reference that is not safe is ignored: ${JSON.stringify(reference)}`);
  }
});

test('accents are stripped, other scripts are dropped, a name of other scripts only falls back', () => {
  assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name: 'José Müller-Ørsted' }).a, 'Jose-Muller-Orsted-Passport.pdf');
  assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name: 'Zoë Åström Łukasz' }).a, 'Zoe-Astrom-Lukasz-Passport.pdf');
  assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name: 'Ali أحمد Khan' }).a, 'Ali-Khan-Passport.pdf', 'the Arabic part is dropped, the Latin parts stay');
  assert.equal(documentFileNames({ documents: [doc('a', 'passport')], name: 'أحمد محمد', reference: 'TV-AB12CD34' }).a, 'TV-AB12CD34-Passport.pdf');
});

test('a very long name is cut, and the whole name stays a sensible length', () => {
  const long = documentFileNames({ documents: [doc('a', 'familyspouse')], name: Array.from({ length: 30 }, (_, i) => `Longname${i}`).join(' ') }).a;
  assert.ok(long.length <= MAX_NAME_LENGTH + 1 + 40 + 5, long.length);
  assert.match(long, SAFE_NAME);
  assert.ok(long.endsWith('-Family-Certificate-Spouse-Children.pdf'), long);
  assert.ok(!long.includes('--'));
});

test('several files in one slot are numbered 1, 2, ... in UPLOAD order; one file has no number', () => {
  const docs = [doc('late', 'funds', { uploadedAt: at(30) }), doc('early', 'funds', { uploadedAt: at(5) }), doc('middle', 'funds', { uploadedAt: at(10) }), doc('alone', 'passport')];
  const names = documentFileNames({ documents: docs, name: 'Roohullah Shah' });
  assert.deepEqual(names, {
    early: 'Roohullah-Shah-Bank-Statement-1.pdf',
    middle: 'Roohullah-Shah-Bank-Statement-2.pdf',
    late: 'Roohullah-Shah-Bank-Statement-3.pdf',
    alone: 'Roohullah-Shah-Passport.pdf',
  });
  // The same time: the order of the list decides.
  const tie = documentFileNames({ documents: [doc('x', 'funds'), doc('y', 'funds')], name: 'A B' });
  assert.deepEqual(tie, { x: 'A-B-Bank-Statement-1.pdf', y: 'A-B-Bank-Statement-2.pdf' });
  // No time at all: still numbered, in list order.
  const noTime = documentFileNames({ documents: [{ id: 'x', slot: 'funds', format: 'pdf' }, { id: 'y', slot: 'funds', format: 'pdf' }], name: 'A B' });
  assert.deepEqual(noTime, { x: 'A-B-Bank-Statement-1.pdf', y: 'A-B-Bank-Statement-2.pdf' });
});

test('duplicate names never happen: identical files are numbered, and the same label in different slots cannot occur', () => {
  const names = documentFileNames({ documents: [doc('a', 'passport'), doc('b', 'passport'), doc('c', 'passport'), doc('d', 'oldpassports')], name: 'Same Person' });
  assert.equal(new Set(Object.values(names)).size, 4);
  assert.deepEqual(Object.values(names).sort(), ['Same-Person-Old-Passport.pdf', 'Same-Person-Passport-1.pdf', 'Same-Person-Passport-2.pdf', 'Same-Person-Passport-3.pdf']);
});

test('files in a slot that is not on the list (hidden, or from an older form) still get a name, numbered together', () => {
  const names = documentFileNames({ documents: [doc('a', 'noc'), doc('b', 'gone_slot', { uploadedAt: at(1) }), doc('c', 'other_gone', { uploadedAt: at(2) })], name: 'Hidden Slots' });
  assert.equal(names.a, 'Hidden-Slots-NOC-Letter.pdf', 'a conditional slot that is hidden for this applicant now');
  assert.equal(names.b, 'Hidden-Slots-Document-1.pdf');
  assert.equal(names.c, 'Hidden-Slots-Document-2.pdf');
});

test('the extension: the stored type first, then the mime type, then the name it was uploaded under, always lower case; an unsafe one is dropped', () => {
  const one = (extra) => documentFileNames({ documents: [{ id: 'a', slot: 'passport', uploadedAt: at(0), ...extra }], name: 'Ext Test' }).a;
  assert.equal(one({ format: 'jpg' }), 'Ext-Test-Passport.jpg');
  assert.equal(one({ format: 'PNG' }), 'Ext-Test-Passport.png', 'lower case');
  assert.equal(one({ mime: 'image/jpeg' }), 'Ext-Test-Passport.jpg');
  assert.equal(one({ type: 'application/pdf' }), 'Ext-Test-Passport.pdf', 'what the applicant page has: "type" is the mime type');
  assert.equal(one({ type: 'image/png', name: 'scan.pdf' }), 'Ext-Test-Passport.png', 'the type beats the name');
  assert.equal(one({ originalName: 'Old Scan.JPEG' }), 'Ext-Test-Passport.jpeg', 'an old record with no type keeps the extension of its name, lower case');
  assert.equal(one({ name: 'letter.docx' }), 'Ext-Test-Passport.docx');
  assert.equal(one({ name: 'virus.exe' }), 'Ext-Test-Passport', 'an extension that is not a known document type is dropped');
  assert.equal(one({ name: 'no-extension' }), 'Ext-Test-Passport');
  assert.equal(one({ format: 'pdf', name: 'a.b.c.exe' }), 'Ext-Test-Passport.pdf');
  assert.equal(extensionOf(null), '');
  assert.equal(extensionOf({ format: 'x'.repeat(50) }), '');
  assert.ok(DOCUMENT_EXTENSIONS.every((e) => /^[a-z0-9]{1,5}$/.test(e)));
});

test('whatever is in the name or the file name, every result is one safe word-and-hyphen name with at most one dot', () => {
  const nasty = ['a"b', 'a;b', 'a/b', 'a\\b', 'a\nb', 'a\r\nSet-Cookie: x=1', '../../etc/passwd', '<script>x</script>', '${x}', '`x`', 'a%0d%0ab', 'a b\u0000', '‮evil', 'Ali.pdf', '..', '.'];
  for (const name of nasty) {
    for (const original of ['x.pdf', '"; filename=evil.exe', '../../a.png', 'a\r\nb.pdf', '']) {
      const result = documentFileNames({ documents: [doc('a', 'passport', { format: undefined, originalName: original, mime: undefined })], name, reference: 'TV-K7M3QD9R' }).a;
      assert.match(result, SAFE_NAME, JSON.stringify([name, original]));
      assert.ok(result.split('.').length <= 2);
      assert.ok(result.length <= 130, result.length);
    }
  }
});

test('it follows the applicant: the same files get new names when the name changes, because nothing is stored', () => {
  const docs = [doc('a', 'passport')];
  assert.equal(documentFileNames({ documents: docs, name: 'Before Change' }).a, 'Before-Change-Passport.pdf');
  assert.equal(documentFileNames({ documents: docs, name: 'After Change' }).a, 'After-Change-Passport.pdf');
  assert.deepEqual(docs, [doc('a', 'passport')], 'the documents are not modified');
});

test('it needs no file content: only ids, slots, types and times are looked at, and bad input does not throw', () => {
  assert.deepEqual(documentFileNames(), {});
  assert.deepEqual(documentFileNames({}), {});
  assert.deepEqual(documentFileNames({ documents: 'nope' }), {});
  assert.deepEqual(documentFileNames({ documents: [null, undefined, 7, {}, { slot: 'passport' }, { id: 5, slot: 'passport' }] }), {}, 'a record with no text id is skipped');
  const withContent = documentFileNames({ documents: [{ id: 'a', slot: 'passport', format: 'pdf', buffer: Buffer.from('%PDF secret words'), content: 'secret words' }], name: 'No Peeking' });
  assert.deepEqual(withContent, { a: 'No-Peeking-Passport.pdf' }, 'a file that carries its content gets exactly the same name');
});

test('safeNamePart is the same rule the downloaded PDFs use', () => {
  assert.equal(safeNamePart('Roohullah Shah'), 'Roohullah-Shah');
  assert.equal(safeNamePart(''), '');
  assert.equal(MAX_NAME_LENGTH, 60);
});
