/**
 * The template cover letter: the fallback when the AI is off, failing or limited, and always available (pure function,
 * no I/O, no AI). It is built only from the facts: the same facts give the same letter, a sentence that depends on a
 * fact appears only when the fact exists, and a missing essential fact leaves a visible placeholder such as
 * "[not provided: planned arrival date]" for the administrator to fill in. Nothing is guessed.
 *
 * It follows the same rules as the AI prompt (config/touristVisaCoverLetterPrompt.js): formal, plain and careful;
 * it states what an answer says and no more; it never repeats the form's option labels but says the answer in its own words (from
 * the stored answer, not the label); it leaves out a fact that is zero or empty; it works the applicant's own text in as plain
 * sentences; and it makes one closing request. Its wording is our own. A test checks it against the list of banned phrases.
 *
 * Names stay as tokens ([NAME], [EMPLOYER], [SCHOOL], and [R1]... for the applicant's own text) here; the caller puts the real
 * values in.
 */

const { lowerFirst, joinAnd } = require('../shared/tourist-visa/coverLetterFacts');
const { normalizeClosing } = require('./touristVisaCoverLetterChecks');

const missing = (what) => `[not provided: ${what}]`;
const sentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
/** "since March 2019 (7 years 8 months)" -> "since March 2019": the length is worked out as at the submission, not as at the letter. */
const bare = (text) => String(text).replace(/\s*\([^)]*\)\s*$/, '');

// A few countries are named with "the".
const WITH_THE = new Set(['United Kingdom', 'United States', 'United Arab Emirates', 'Netherlands', 'Philippines', 'Bahamas', 'Gambia', 'Maldives', 'Dominican Republic', 'Central African Republic']);
const place = (name) => (WITH_THE.has(name) ? `the ${name}` : name);
const placeNamed = (text) => (text === 'USA' || text === 'European Economic Area' ? `the ${text}` : place(text));

const PURPOSE = {
  family_friends: 'I am coming to see family or friends.',
  business: 'I am visiting for business.',
  study: 'I am coming to study on a short course.',
  transit: 'I will be passing through the United Kingdom on my way to another country.',
  other: 'I am visiting for another reason.',
};
const HOLIDAY = {
  holiday: 'I am visiting for a holiday and sightseeing.',
  event: 'I am visiting to attend an event.',
  shopping: 'I am visiting to go shopping.',
  cruise: 'I am visiting to join or leave a cruise.',
  other: 'I am visiting for a leisure reason.',
};
const RELATIONSHIP = {
  single: 'I am single.',
  married: 'I am married.',
  civil_partnership: 'I have a civil partner.',
  unmarried_partner: 'My partner and I are not married.',
  separated: 'I am separated.',
  divorced: 'I am divorced.',
  widowed: 'I am widowed.',
};
const ACCOMMODATION = {
  not_decided: 'I have not yet decided where I will stay.',
  paid_stay: 'I plan to pay for a hotel or other accommodation.',
  family_friends: 'I will be staying with family or friends.',
  address_unknown: 'I will be staying somewhere in the United Kingdom, but I do not have the address yet.',
};
// Who pays, said as a person: the relationship if there is a useful one, otherwise who it is.
const PAYER_RELATIONSHIP = {
  spouse_partner: 'my spouse or partner', parent: 'my parent', child: 'my child', sibling: 'my brother or sister',
  other_relative: 'another relative', friend: 'a friend', employer: 'my employer',
};
const PAYER_WHO = { relative: 'a relative', friend: 'a friend', employer: 'my employer', sponsoring_organisation: 'an organisation that sponsors my visit', other: 'someone else' };

function buildTemplate(facts) {
  const v = facts.values || {};
  const raw = facts.raw || {};
  const entries = facts.entries || {};
  const paragraphs = ['Dear Sir or Madam,', 'I am writing in support of my application for a UK Standard Visitor visa.'];
  const add = (parts) => { const filled = parts.filter(Boolean); if (filled.length) paragraphs.push(filled.join(' ')); };

  // The visit
  const purpose = (() => {
    if (!v.purpose) return missing('main reason for the visit');
    if (raw.purpose === 'tourism') return HOLIDAY[raw.holidayReason] || 'I am visiting for a holiday.';
    return PURPOSE[raw.purpose] || `The main reason for my visit is ${lowerFirst(v.purpose)}.`;
  })();
  add([
    `I plan to arrive in the United Kingdom on ${v.arrival || missing('planned arrival date')} and to leave on ${v.departure || missing('planned departure date')}${v.stay ? `, a stay of ${v.stay}` : ''}.`,
    purpose,
    v.purposeDetails ? sentence(v.purposeDetails) : '',
    raw.groupTravel === true ? 'I will be travelling as part of an organised group.' : '',
    v.companions ? `I will be travelling with ${v.companions === '1' ? 'one other person' : `${v.companions} other people`}.` : '',
  ]);

  // Where they will stay
  add([
    ACCOMMODATION[raw.accommodationPlan] || '',
    v.accommodationArea ? `I expect to stay in ${v.accommodationArea}.` : '',
    Array.isArray(v.accommodationTowns) && v.accommodationTowns.length ? `I will be staying in ${joinAnd(v.accommodationTowns)}.` : '',
  ]);

  // About the applicant
  add([
    `I am a national of ${v.nationality ? place(v.nationality) : missing('nationality')}${v.residenceCountry ? ` and I live in ${place(v.residenceCountry)}` : ''}.`,
    RELATIONSHIP[raw.relationshipStatus] || '',
    v.dependants ? (v.dependants === '1' ? 'One person relies on me financially.' : `${v.dependants} people rely on me financially.`) : '',
  ]);

  // Work
  const work = [];
  if (raw.employmentStatus === 'employed') {
    work.push(`I am employed${v.jobTitle ? `, and my job title is ${v.jobTitle}` : ''}.`);
    if (v.employer) work.push(`I have worked for ${v.employer}${v.employmentSince ? ` ${bare(v.employmentSince)}` : ''}.`);
    if (v.jobDescription) work.push(sentence(v.jobDescription));
  } else if (raw.employmentStatus === 'self_employed') {
    work.push('I am self-employed.');
    if (v.businessSince) work.push(`I have run my business${v.employer ? `, ${v.employer},` : ''} ${bare(v.businessSince)}.`);
    else if (v.employer) work.push(`My business is ${v.employer}.`);
    if (v.businessDescription) work.push(sentence(v.businessDescription));
  } else if (raw.employmentStatus === 'student') {
    work.push(`I am a student${v.school ? ` at ${v.school}` : ''}${v.studying ? `${v.school ? ', where I am studying' : ', studying'} ${v.studying}` : ''}.`);
  } else if (raw.employmentStatus === 'retired') {
    work.push('I am retired.');
    if (v.retiredSince) work.push(`I have been retired ${bare(v.retiredSince)}.`);
  } else if (raw.employmentStatus === 'homemaker') {
    work.push('I am a homemaker and I look after the home or family.');
  } else if (raw.employmentStatus === 'unemployed') {
    work.push('I am not working.');
  }
  add(work);

  // Money: only amounts above zero are in the facts at all
  const payers = (entries.payers || []).map((f) => {
    const relationship = f.q6_5d && PAYER_RELATIONSHIP[f.q6_5d.raw];
    const who = relationship || (f.q6_5b && PAYER_WHO[f.q6_5b.raw]) || 'someone';
    const covers = f.q6_5g ? f.q6_5g.text.split('; ').map(lowerFirst) : [];
    return `${cap(who)}${f.q6_5e ? `, who lives in ${place(f.q6_5e.text)},` : ''} will ${f.q6_5f ? `pay ${f.q6_5f.text}` : 'contribute'}${covers.length ? ` towards ${joinAnd(covers)}` : ''}.`;
  });
  add([
    v.incomeMonthly ? `I earn ${v.incomeMonthly} each month after tax.` : '',
    v.businessIncome ? `I earn ${v.businessIncome} each month from my business, after tax.` : '',
    v.pension ? `I receive a pension of ${v.pension} each month.` : '',
    v.otherIncome ? `I also receive ${v.otherIncome} each month in other income.` : '',
    v.savings ? `I have savings of ${v.savings}.` : '',
    v.plannedSpend ? `I plan to spend ${v.plannedSpend} on the visit myself.` : '',
    v.monthlySpend ? `I spend ${v.monthlySpend} in total each month.` : '',
    ...payers,
    raw.someonePaying === false && payers.length === 0 ? 'No one else is paying towards the cost of my visit.' : '',
    raw.someonePaying === true && payers.length === 0 ? 'Someone else is paying towards the cost of my visit.' : '',
  ]);

  // Earlier travel
  const visits = (entries.ukVisits || []).filter((f) => f.q7_5b).map((f) => `${f.q7_5b.text}${f.q7_5c ? ` (${f.q7_5c.text})` : ''}`);
  const trips = (entries.otherCountries || []).filter((f) => f.q8_2a).map((f) => {
    const span = f.q8_2c && f.q8_2d ? ` from ${f.q8_2c.text} to ${f.q8_2d.text}` : f.q8_2c ? ` from ${f.q8_2c.text}` : f.q8_2d ? ` until ${f.q8_2d.text}` : '';
    return `I visited ${place(f.q8_2a.text)}${span}.`;
  });
  add([
    v.ukVisitsCount ? `I have visited the United Kingdom ${v.ukVisitsCount === '1' ? 'once' : `${v.ukVisitsCount} times`} in the past 10 years.` : '',
    visits.length ? `My visits were in ${joinAnd(visits)}.` : '',
    v.visitedPlaces ? `I have also visited ${joinAnd(String(v.visitedPlaces).split('; ').map(placeNamed))}.` : '',
    ...trips,
  ]);

  add(['I would be grateful if you would consider my application. Thank you for your time.']);
  return normalizeClosing(paragraphs.join('\n\n'), { name: facts.tokens && facts.tokens.NAME ? 'token' : 'gap' });
}

module.exports = { buildTemplate };
