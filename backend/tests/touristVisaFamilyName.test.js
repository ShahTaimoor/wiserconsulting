'use strict';

// The Family name is optional (config 1.2.0): some people have one name only. Without a database: the admin summary, the answers PDF, the cover
// letter (the letterhead, the closing and the placeholder) and the itinerary PDF each read back with pdfjs, with the Family name missing,
// empty, whitespace only and normal. A name must never show a gap, a stray space, a comma, "undefined" or "null". Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../shared/tourist-visa/engine');
const view = require('../shared/tourist-visa/view');
const { buildFacts, tokenValues } = require('../shared/tourist-visa/coverLetterFacts');
const { buildItineraryFacts } = require('../shared/tourist-visa/itineraryFacts');
const { summaryOf } = require('../utils/touristVisaSummary');
const answersPdf = require('../utils/touristVisaAnswersPdf');
const letter = require('../utils/touristVisaCoverLetterPdf');
const itinerary = require('../utils/touristVisaItineraryPdf');
const { buildTemplate } = require('../utils/touristVisaCoverLetterTemplate');
const { substitute } = require('../utils/touristVisaCoverLetterChecks');
const { buildSkeleton } = require('../utils/touristVisaItinerarySkeleton');
const { buildTemplateDescriptions } = require('../utils/touristVisaItineraryTemplate');
const { assembleItinerary, britishSpelling } = require('../utils/touristVisaItineraryChecks');
const { fullAnswers } = require('./helpers/touristVisaFixtures');
const { modelOf } = require('./helpers/pdfFixtures');
const { inspectPdf } = require('./helpers/pdfInspect');

const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const REFERENCE = 'TV-K7M3QD9R';
const DATE = new Date('2026-11-03T10:15:00Z');

/** [label, the answers' family name, the name that should be printed]. `undefined` removes the key altogether. */
const CASES = [
  ['missing', undefined, 'Testfirst'],
  ['empty', '', 'Testfirst'],
  ['whitespace only', '   \t ', 'Testfirst'],
  ['normal', 'Testlast', 'Testfirst Testlast'],
];
const answersFor = (family) => {
  const a = fullAnswers('Testfirst', family, 'test.applicant@example.com');
  if (family === undefined) delete a.q2_2;
  return a;
};
const linesOf = (pdf) => pdf.pages.flatMap((page) => page.lines.map((line) => line.text));
const allText = (pdf) => linesOf(pdf).join('\n');
/** No gap, stray space, comma, "undefined" or "null" in what a name looks like in a PDF. */
const assertCleanText = (text, where) => {
  assert.doesNotMatch(text, /undefined|\bnull\b|NaN/, `${where}: undefined or null`);
  assert.doesNotMatch(text, /Testfirst\s{2,}|Testfirst\s*,|\s{2,}Testlast/, `${where}: a gap or comma around the name`);
};

for (const [label, family, printed] of CASES) {
  test(`Family name ${label}: the summary kept for the admin list is "${printed}"`, () => {
    const { name } = summaryOf(answersFor(family));
    assert.equal(name, printed);
    assert.doesNotMatch(name, /undefined|null|\s\s|^\s|\s$/);
  });

  test(`Family name ${label}: the answers PDF prints "${printed}" as the applicant, with no gap`, async () => {
    const answers = answersFor(family);
    const header = answersPdf.buildHeaderRows({ cfg: engine.config, answers, reference: REFERENCE, submittedAt: SUBMITTED });
    assert.equal(header.find((row) => row.label === 'APPLICANT NAME').value, printed);
    const model = modelOf(answers);
    assert.equal(model.applicantName, printed);
    const pdf = await inspectPdf(await answersPdf.renderAnswersPdf(model));
    const text = allText(pdf);
    assertCleanText(text, 'answers PDF');
    assert.ok(text.includes(printed), 'the name is printed');
    // The review row of the Family name itself says "Not answered" when it is empty.
    if (family === undefined || !String(family).trim()) {
      const row = view.buildReview(engine.config, answers, [], {}).parts.flatMap((p) => p.sections).find((s) => s.id === '2A').rows.find((r) => r.id === 'q2_2');
      assert.equal(row.value, 'Not answered');
    }
  });

  test(`Family name ${label}: the cover letter has the letterhead "${printed}" and the closing "${printed}", with no gap`, async () => {
    const answers = answersFor(family);
    const sender = letter.senderOf(answers);
    assert.equal(sender.name, printed);

    // The placeholder the server puts back into the letter.
    assert.equal(tokenValues(engine.config, answers).NAME, printed);

    // The template letter, as it is stored: the closing carries the name.
    const facts = buildFacts(engine.config, answers, { submittedAt: SUBMITTED });
    const text = substitute(buildTemplate(facts), facts.tokens, facts.redactions);
    assert.ok(text.includes(`Yours faithfully,\n${printed}`) || text.includes(printed), 'the stored letter names the applicant');
    assertCleanText(text, 'stored letter');

    const model = letter.buildLetterModel({ text, reference: REFERENCE, sender, date: DATE, draft: false });
    const pdf = await inspectPdf(await letter.renderCoverLetterPdf(model));
    const pdfText = allText(pdf);
    assertCleanText(pdfText, 'cover letter PDF');
    const lines = linesOf(pdf);
    assert.ok(lines.includes(printed), 'the letterhead line is exactly the name');
    const closing = lines.indexOf('Yours faithfully,');
    assert.ok(closing >= 0 && lines[closing + 1] === printed, `the closing is followed by "${printed}"`);
  });

  test(`Family name ${label}: the itinerary PDF has "${printed}" as the traveller and in the continuation header, with no gap`, async () => {
    const answers = answersFor(family);
    Object.assign(answers, { q1_5: 'We would like to see London, then Bath and Edinburgh.', q1_6: '2027-03-15', q1_7: '2027-03-20', q6_7: false, q6_7x: 'family_friends' });
    const sender = letter.senderOf(answers);
    const facts = buildItineraryFacts(engine.config, answers, { submittedAt: SUBMITTED });
    const skeleton = buildSkeleton(facts.raw.arrival, facts.raw.departure);
    const text = assembleItinerary(skeleton.blocks, buildTemplateDescriptions(facts, skeleton).map(britishSpelling));
    const details = itinerary.detailsOf(facts, sender.name);
    assert.equal((details.find((d) => d.label === 'Traveller') || {}).value, printed);
    const model = itinerary.buildItineraryModel({ text, reference: REFERENCE, applicantName: sender.name, details, draft: false });
    assert.equal(model.applicantName, printed);
    const pdf = await inspectPdf(await itinerary.renderItineraryPdf(model));
    const pdfText = allText(pdf);
    assertCleanText(pdfText, 'itinerary PDF');
    assert.ok(pdfText.includes(printed), 'the traveller is printed');
  });
}

test('both names missing: nothing is invented (no "undefined", no empty line) in the summary or the letterhead', () => {
  const a = fullAnswers('', undefined, 'test.applicant@example.com');
  delete a.q2_2;
  assert.equal(summaryOf(a).name, '');
  assert.equal(letter.senderOf(a).name, '');
  assert.equal(summaryOf({}).name, '');
  assert.equal(summaryOf(null).name, '');
});
