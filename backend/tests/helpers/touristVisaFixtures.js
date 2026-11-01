'use strict';

// Made-up applicant answers shared by the step 8f tests. Nothing here is real.

const SECRET_ID = 'FAKE-PASSPORT-9876';
const SECRET_NI = 'AB123456C';
const SECRET_DETAILS = 'MADE-UP-DETAILS-OF-A-CONVICTION';
const FILE_NAME = 'MADE-UP-FILE-NAME-passport.pdf';
const ADDRESS = { line1: '1 Test Street', town: 'Testville', country: 'GB' };
const gbp = (amount) => ({ amount, currency: 'GBP' });

/** [sectionId, answers] for every section of a complete application. */
const SECTIONS = (given = 'Testfirst', family = 'Testlast', email = 'test.applicant@example.com') => [
  ['1', { q1_1: 'tourism', q1_2: false, q1_3: false, q1_4: 'holiday', q1_5: 'Test trip for automated tests.', q1_6: '2027-03-01', q1_7: '2027-03-15' }],
  ['2A', { q2_1: given, q2_2: family, q2_3: false, q2_4: email, q2_5: 'me', q2_6: false, q2_9: email.toLowerCase(), q2_10: email.toLowerCase(), q2_11: email.toLowerCase() }],
  ['2B', { q2_12: 'female', q2_13: 'single', q2_14: 'GB', q2_15: 'GB', q2_16: 'Testville', q2_17: '1990-01-01', q2_18: false, q2_23: false }],
  ['2C', { q2_24: ADDRESS, q2_25: true, q2_27: { years: 2, months: 3 }, q2_28: 'owned', q2_30: false, q2_31: false }],
  ['2D', { q2_32: { countryCode: '+44', number: '7700 900123' }, q2_33: 'in_uk', q2_34: 'mobile', q2_35: ['call', 'sms'] }],
  ['3', { q3_1: SECRET_ID, q3_2: 'Test Passport Office', q3_3: '2022-05-01', q3_4: '2032-05-01' }],
  ['4B', { q4_7: false }],
  ['4C', { q4_8: true, parents: [{ q4_8a: 'mother', q4_8b: 'Testmother', q4_8c: 'Testsurname', q4_8d: '1962-01-02', q4_8e: 'GB', q4_8f: true }] }],
  ['5', { q5_1: 'retired' }],
  ['6A', { q6_1: 'none', q6_3: gbp(1500), q6_4: gbp(900), q6_5: false }],
  ['6B', { q6_6: false }],
  ['6C', { q6_7: false, q6_7x: 'not_decided' }],
  ['6D', { q6_8: false }],
  ['7', { q7_1: false, q7_3: false, q7_4: false, q7_6: false, q7_7: false }],
  ['8', { q8_1: 0, q8_2: false }],
  ['9A', { q9_11: true, q9_1: false, q9_12: true, q9_2: false }],
  ['9B', { q9_13: true, q9_3: false, q9_4: false, q9_5: false, q9_14: true, q9_6: false, q9_7: false }],
  ['9C', { q9_8: false, q9_9: false, q9_10: false }],
  ['10A', { q10_1: ['conviction'], q10_1a: SECRET_DETAILS }],
  ['10B', {}],
  ['10C', { q10_4: 'other', q10_4a: 'Sindhi', q10_5: true, q10_5a: SECRET_NI }],
];

/** All the answers of a complete application as one object (what the server stores, decrypted). */
const fullAnswers = (...args) => Object.assign({}, ...SECTIONS(...args).map(([, answers]) => answers));

module.exports = { SECRET_ID, SECRET_NI, SECRET_DETAILS, FILE_NAME, ADDRESS, gbp, SECTIONS, fullAnswers };
