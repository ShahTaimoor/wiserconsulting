'use strict';

// Made-up applications for the PDF tests. Nothing here is real.

const engine = require('../../shared/tourist-visa/engine');
const { buildReview } = require('../../shared/tourist-visa/view');
const pdf = require('../../utils/touristVisaAnswersPdf');
const { fullAnswers } = require('./touristVisaFixtures');

const SUBMITTED_AT = new Date('2026-11-03T10:15:00Z');
const FILES = [
  { slot: 'passport', name: 'passport-scan.pdf', size: 2000 },
  { slot: 'passport', name: 'passport-page-2.pdf', size: 3000 },
  { slot: 'funds', name: 'bank-statement.png', size: 3011 },
];

/** An application with nearly every question and every repeating group answered, some of them with long text. */
function richAnswers() {
  const a = fullAnswers('Aisha', 'Khan-Reynolds', 'aisha.khan@example.com');
  const sentence = 'I prepare the monthly accounts, supervise two junior colleagues, and report to the finance director. ';
  Object.assign(a, {
    q1_2: true, q1_2a: 'Heritage Tours Ltd', q1_2b: 'tour',
    q1_3: true,
    companions: Array.from({ length: 10 }, (_, i) => ({ q1_3a: i % 2 ? 'family_member' : 'friend', q1_3b: `Companion${i}`, q1_3c: 'Example', q1_3d: '1990-01-05', q1_3e: 'PK' })),
    q1_5: 'We would like to see London, then Bath and Edinburgh.\n' + 'A line of free text with an en dash – and an ellipsis… and £1,200 and “quotes”. '.repeat(14),
    q2_3: true, otherNames: [{ q2_3a: 'Aisha', q2_3b: 'Khan', q2_3c: 'marriage_or_partnership' }],
    q2_13: 'married', q2_23: true, nationalities: [{ q2_23b: 'AE', q2_23c: 'naturalisation', q2_23d: '2010-01-01', q2_23e: '2020-01-01' }],
    q4_7: true, dependants: [{ q4_7a: 'child', q4_7b: 'Samira', q4_7c: 'Khan', q4_7d: '2015-06-01', q4_7e: 'PK', q4_7f: true }],
    q4_8: true, parents: [
      { q4_8a: 'mother', q4_8b: 'Nadia', q4_8c: 'Khan', q4_8d: '1962-01-02', q4_8e: 'PK', q4_8f: true },
      { q4_8a: 'father', q4_8b: 'Imran', q4_8c: 'Khan', q4_8d: '1958-03-04', q4_8e: 'PK', q4_8f: true },
    ],
    q5_1: 'employed', q5_2: '2019-03', q5_3: 'Acme Example Ltd', q5_4: { line1: '5 Station Road', town: 'Karachi', country: 'PK' }, q5_5: { countryCode: '+92', number: '21 5550100' },
    q5_6: 'Senior accountant', q5_7: { amount: 3500, currency: 'GBP' }, q5_8: sentence.repeat(12).trim(),
    q6_1: 'savings', q6_2: { amount: 8800, currency: 'GBP' }, q6_5: true,
    payers: Array.from({ length: 5 }, (_, i) => ({ q6_5b: 'relative', q6_5c: `Payer ${i}`, q6_5d: 'parent', q6_5e: 'PK', q6_5f: { amount: 800, currency: 'GBP' }, q6_5g: ['travel', 'accommodation'] })),
    q6_6: true, ukFamily: Array.from({ length: 10 }, (_, i) => ({ q6_6b: 'sibling', q6_6c: `Relative ${i}`, q6_6d: 'Manchester', q6_6e: 'GB', q6_6f: 'GB', q6_6g: 'british_citizen' })),
    q6_7: true,
    accommodation: Array.from({ length: 20 }, (_, i) => ({ q6_7a: `Stay ${i}`, q6_7b: { line1: `${i + 1} Sample Street`, line2: 'Flat 2', town: 'Manchester', postcode: 'M1 1AA', country: 'GB' }, q6_7c: '2027-03-01', q6_7d: '2027-03-02' })),
    q7_1: true, ukVisas: [{ q7_2a: '2023-04', q7_2b: 'visit', q7_2c: 'REF-FAKE-0001' }],
    q7_4: true, q7_5: 20, ukVisits: Array.from({ length: 20 }, (_, i) => ({ q7_5a: 'tourism', q7_5b: '2021-08', q7_5c: { days: i + 1 } })),
    q8_1: 3, q8_2: true, otherCountryTrips: Array.from({ length: 10 }, () => ({ q8_2a: 'AE', q8_2b: 'tourism', q8_2c: '2024-01-02', q8_2d: '2024-01-09' })),
    q10_1: ['conviction'], q10_1a: 'Made-up details that wrap across several lines in the answer column. '.repeat(10),
  });
  return a;
}

/** The model of the PDF of an application's answers (as the service builds it). */
function modelOf(answers, { reference = 'TV-X42GYXPS', corrections = {}, files = FILES, submittedAt = SUBMITTED_AT } = {}) {
  const cfg = engine.config;
  const review = buildReview(cfg, answers, files, { submit: { acceptedAt: submittedAt } }, corrections);
  const header = pdf.buildHeaderRows({ cfg, answers, reference, submittedAt });
  return pdf.buildAnswersModel({ review, header, reference });
}

/** A small model made by hand, for the layout tests: `sections` is [{ id, title, items }] in one part. */
function handModel(sections, { reference = 'TV-AAAAAAAA', applicantName = 'Test Person' } = {}) {
  const header = [['APPLICANT NAME', applicantName], ['APPLICATION REFERENCE', reference]].map(([label, value]) => ({ label, value }));
  return { reference, applicantName, header, parts: [{ id: '1', title: 'Part title', sections }] };
}
const row = (question, text, style = 'normal') => ({ type: 'row', id: question, question, lines: [{ text, style }], base: null });

module.exports = { SUBMITTED_AT, FILES, richAnswers, modelOf, handModel, row };
