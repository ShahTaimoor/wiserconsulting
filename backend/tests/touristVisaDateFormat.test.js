'use strict';

// Dates in the PDFs: day, full month name, year ("18 January 2026"), never the stored ISO form (2026-01-18) or a numeric one (18/01/2026,
// 01/18/2026), in the answers PDF (the answers, the date of the application) and the itinerary PDF (the headings of the days, the details),
// and the same whatever time zone the server runs in. Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../shared/tourist-visa/engine');
const { buildItineraryFacts } = require('../shared/tourist-visa/itineraryFacts');
const answersPdf = require('../utils/touristVisaAnswersPdf');
const itinerary = require('../utils/touristVisaItineraryPdf');
const { buildSkeleton } = require('../utils/touristVisaItinerarySkeleton');
const { buildTemplateDescriptions } = require('../utils/touristVisaItineraryTemplate');
const { assembleItinerary, britishSpelling } = require('../utils/touristVisaItineraryChecks');
const { fullAnswers } = require('./helpers/touristVisaFixtures');
const { modelOf } = require('./helpers/pdfFixtures');
const { inspectPdf } = require('./helpers/pdfInspect');

const ISO = /\b\d{4}-\d{2}-\d{2}\b/;
const NUMERIC = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/;
const REFERENCE = 'TV-K7M3QD9R';

function inZone(zone, check) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  return Promise.resolve()
    .then(check)
    .finally(() => {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    });
}
const ZONES = ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Karachi'];

const textOf = (pdf) => pdf.pages.flatMap((page) => page.lines.map((line) => line.text)).join('\n');

test('the answers PDF writes every date answer as "18 January 2026", never as ISO or a numeric date', async () => {
  const answers = fullAnswers('Testfirst', 'Testlast', 'test.applicant@example.com');
  Object.assign(answers, { q1_6: '2027-03-01', q1_7: '2027-03-15', q2_17: '1990-01-18', q3_3: '2022-05-01', q3_4: '2032-05-01' });
  const submittedAt = new Date('2026-11-03T10:15:00Z');
  const pdf = await inspectPdf(await answersPdf.renderAnswersPdf(modelOf(answers, { reference: REFERENCE, submittedAt })));
  const text = textOf(pdf);
  for (const written of ['1 March 2027', '15 March 2027', '18 January 1990', '1 May 2022', '1 May 2032', '3 November 2026']) {
    assert.ok(text.includes(written), `"${written}" is in the PDF`);
  }
  assert.doesNotMatch(text, ISO, 'no ISO date');
  assert.doesNotMatch(text.replace(REFERENCE, ''), NUMERIC, 'no numeric date (18/01/2026 or 01/18/2026)');
});

test('the date of the application is the same day in every time zone, near midnight too (no off-by-one-day)', async () => {
  for (const zone of ZONES) {
    await inZone(zone, async () => {
      for (const [moment, written] of [
        ['2026-11-03T23:59:00Z', '3 November 2026'],
        ['2026-11-04T00:00:00Z', '4 November 2026'],
        ['2026-12-31T23:30:00Z', '31 December 2026'],
        ['2027-01-01T00:30:00Z', '1 January 2027'],
      ]) {
        const rows = answersPdf.buildHeaderRows({ cfg: engine.config, answers: fullAnswers(), reference: REFERENCE, submittedAt: new Date(moment) });
        const applied = rows.find((row) => /APPLICATION DATE|DATE OF APPLICATION/i.test(row.label));
        assert.ok(applied, 'the header has the date of the application');
        assert.equal(applied.value, written, `${zone}: ${moment}`);
      }
    });
  }
});

test('the itinerary PDF writes the days as "Monday 15 March 2027" and the details as "15 March 2027", never as ISO or numeric dates', async () => {
  const answers = fullAnswers('Testfirst', 'Testlast', 'a@example.com');
  Object.assign(answers, { q1_5: 'We would like to see London, then Bath.', q1_6: '2027-03-15', q1_7: '2027-03-19', q6_7: false, q6_7x: 'family_friends' });
  const facts = buildItineraryFacts(engine.config, answers, { submittedAt: new Date('2026-11-03T10:00:00Z') });
  const skeleton = buildSkeleton(facts.raw.arrival, facts.raw.departure);
  const text = assembleItinerary(skeleton.blocks, buildTemplateDescriptions(facts, skeleton).map(britishSpelling));
  const details = itinerary.detailsOf(facts, 'Testfirst Testlast');
  const pdf = await inspectPdf(await itinerary.renderItineraryPdf(itinerary.buildItineraryModel({ text, reference: REFERENCE, applicantName: 'Testfirst Testlast', details, draft: false })));
  const all = textOf(pdf);
  assert.ok(all.includes('Monday 15 March 2027'), 'the heading of the first day');
  assert.ok(all.includes('Friday 19 March 2027'), 'the heading of the last day');
  assert.ok(details.some((d) => /15 March 2027/.test(d.value)), 'the arrival date in the details');
  assert.ok(details.some((d) => /19 March 2027/.test(d.value)), 'the departure date in the details');
  assert.doesNotMatch(all, ISO, 'no ISO date');
  assert.doesNotMatch(all.replace(REFERENCE, ''), NUMERIC, 'no numeric date');
});

test('the itinerary days are the same in every time zone (the weekday and the date never move)', async () => {
  for (const zone of ZONES) {
    await inZone(zone, async () => {
      const facts = buildItineraryFacts(engine.config, { ...fullAnswers(), q1_6: '2027-01-01', q1_7: '2027-01-03' }, { submittedAt: new Date('2026-12-31T23:30:00Z') });
      const skeleton = buildSkeleton(facts.raw.arrival, facts.raw.departure);
      assert.deepEqual(skeleton.blocks.map((block) => block.heading), ['Day 1, Friday 1 January 2027', 'Day 2, Saturday 2 January 2027', 'Day 3, Sunday 3 January 2027'], zone);
    });
  }
});
