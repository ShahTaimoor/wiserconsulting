'use strict';

// The 22 document slots of section 10D as the senior's two lists define them, written out by hand and independently of the config
// (this is the exact-list test's "expected" side, and the helper the other tests use to ask "is this slot shown / needed for this person").
// Order is the order on screen and in the config. Made-up applicant situations are described by a small context object:
//   { employment: 'employed' | 'self_employed' | 'retired' | ..., married: bool, children: bool, sponsor: bool }
// married = 2.13 is married or civil_partnership; children = 4.7 is Yes; sponsor = 6.5 (someone else pays) is Yes.

const SLOT_LIST = [
  { id: 'q10_8', number: '10.8', slot: 'hotels', label: 'Hotel reservations (one per city or hotel, for example London and Scotland)', max: 3, shown: 'always', needed: 'always' },
  { id: 'q10_9', number: '10.9', slot: 'flight', label: 'Flight reservation', max: 3, shown: 'always', needed: 'always' },
  { id: 'q10_10', number: '10.10', slot: 'marriage', label: 'Marriage registration certificate', max: 3, shown: 'always', needed: 'married' },
  { id: 'q10_11', number: '10.11', slot: 'familyspouse', label: 'Family registration certificate with spouse and children', max: 3, shown: 'always', needed: 'marriedOrChildren' },
  { id: 'q10_12', number: '10.12', slot: 'familyparents', label: 'Family registration certificate with parents and siblings', max: 3, shown: 'always', needed: 'always' },
  { id: 'q10_13', number: '10.13', slot: 'formb', label: 'Form (B) showing children registration with NADRA', max: 5, shown: 'always', needed: 'children' },
  { id: 'q10_14', number: '10.14', slot: 'school', label: "Children's school registration certificates", max: 5, shown: 'always', needed: 'children' },
  { id: 'q10_15', number: '10.15', slot: 'businessreg', label: 'Business registration with Chamber of Commerce & Industry', max: 3, shown: 'self_employed', needed: 'always' },
  { id: 'q10_16', number: '10.16', slot: 'chambercard', label: 'Chamber membership registration card', max: 3, shown: 'self_employed', needed: 'always' },
  { id: 'q10_17', number: '10.17', slot: 'appointment', label: 'Appointment letter', max: 3, shown: 'employed', needed: 'always' },
  { id: 'q10_18', number: '10.18', slot: 'confirmation', label: 'Job confirmation letter', max: 3, shown: 'employed', needed: 'always' },
  { id: 'q10_19', number: '10.19', slot: 'noc', label: 'NOC letter', max: 3, shown: 'employed', needed: 'always' },
  { id: 'q10_20', number: '10.20', slot: 'salary', label: 'Salary slips', max: 6, shown: 'employed', needed: 'always' },
  { id: 'q10_21', number: '10.21', slot: 'taxpayer', label: 'Taxpayer registration certificate', max: 3, shown: 'always', needed: 'always' },
  { id: 'q10_7', number: '10.7', slot: 'funds', label: 'Personal bank statement', max: 10, shown: 'always', needed: 'always' },
  { id: 'q10_22', number: '10.22', slot: 'businessbank', label: 'Business bank statement', max: 10, shown: 'self_employed', needed: 'always' },
  { id: 'q10_23', number: '10.23', slot: 'property', label: 'Property documents (flat and car ownership)', max: 5, shown: 'always', needed: 'always' },
  { id: 'q10_6', number: '10.6', slot: 'passport', label: 'New passport with entry and exit stamps', max: 3, shown: 'always', needed: 'always' },
  { id: 'q10_24', number: '10.24', slot: 'oldpassports', label: 'Old passports with entry and exit stamps', max: 5, shown: 'always', needed: 'never' },
  { id: 'q10_25', number: '10.25', slot: 'nic', label: 'National identity card', max: 3, shown: 'always', needed: 'always' },
  { id: 'q10_26', number: '10.26', slot: 'sponsorship', label: 'Sponsorship letter', max: 3, shown: 'employed', needed: 'sponsor' },
  { id: 'q10_27', number: '10.27', slot: 'other', label: 'Any other relevant documents', max: 5, shown: 'always', needed: 'never' },
];

const SLOT_IDS = SLOT_LIST.map((s) => s.slot);

const isShown = (s, ctx) => s.shown === 'always' || s.shown === ctx.employment;

/** Needed (at least one file to submit) for this applicant. Only meaningful for a slot that is shown. */
function isNeeded(s, ctx) {
  switch (s.needed) {
    case 'always': return true;
    case 'never': return false;
    case 'married': return !!ctx.married;
    case 'children': return !!ctx.children;
    case 'marriedOrChildren': return !!ctx.married || !!ctx.children;
    case 'sponsor': return !!ctx.sponsor;
    default: throw new Error(`unknown rule ${s.needed}`);
  }
}

/** Slot ids on the list for this applicant, in order. */
const shownSlots = (ctx) => SLOT_LIST.filter((s) => isShown(s, ctx)).map((s) => s.slot);
/** Slot ids on the list that are needed, in order. */
const neededSlots = (ctx) => SLOT_LIST.filter((s) => isShown(s, ctx) && isNeeded(s, ctx)).map((s) => s.slot);

/** The answers (only the ones that matter to the lists) that make a context true. */
function answersFor(ctx) {
  return {
    ...(ctx.employment ? { q5_1: ctx.employment } : {}),
    q2_13: ctx.married ? 'married' : 'single',
    q4_7: !!ctx.children,
    q6_5: !!ctx.sponsor,
  };
}

/**
 * Uploads one file to every needed slot of the shared list (an applicant whose employment is retired, single, with no dependants and no
 * sponsor) EXCEPT passport and funds, which the older tests upload themselves under their own file names. `upload(token, slot, name)`
 * is the test file's own upload helper and must answer a status.
 */
async function uploadRemainingShared(upload, token, ctx = { employment: 'retired' }) {
  const assert = require('node:assert/strict');
  for (const slot of neededSlots(ctx)) {
    if (slot === 'passport' || slot === 'funds') continue;
    const res = await upload(token, slot, `${slot}-file.pdf`);
    assert.equal(res.status, 201, `${slot}: ${JSON.stringify(res.json)}`);
  }
}

module.exports = { uploadRemainingShared, SLOT_LIST, SLOT_IDS, isShown, isNeeded, shownSlots, neededSlots, answersFor };
