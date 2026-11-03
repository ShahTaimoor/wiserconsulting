/**
 * The template cover letter: the fallback when the AI is off, failing or limited, and always available (pure function,
 * no I/O, no AI). It is built only from the facts: the same facts give the same letter, a sentence that depends on a
 * fact appears only when the fact exists, and a missing essential fact leaves a visible placeholder such as
 * "[not provided: planned arrival date]" for the administrator to fill in. Nothing is guessed.
 *
 * Names stay as the placeholders ([NAME], [EMPLOYER], [SCHOOL]) here; the caller puts the real values in.
 */

/** "Tourism" -> "tourism"; "UK visa" and "USA" are left alone. */
const lower = (text) => (typeof text === 'string' && text.length > 1 && text[1] === text[1].toLowerCase() ? text[0].toLowerCase() + text.slice(1) : text);

const missing = (what) => `[not provided: ${what}]`;
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const sentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

function buildTemplate(facts) {
  const v = facts.values || {};
  const paragraphs = ['Dear Sir or Madam,'];

  paragraphs.push('I am applying for a UK Standard Visitor visa and I am writing to explain the purpose of my visit and my circumstances.');

  // The visit
  const visit = [
    `I plan to travel to the United Kingdom on ${v.arrival || missing('planned arrival date')} and to leave on ${v.departure || missing('planned departure date')}${v.stay ? `, a stay of ${v.stay}` : ''}.`,
    `The main reason for my visit is ${v.purpose ? lower(v.purpose) : missing('main reason for the visit')}${v.holidayReason ? ` (${lower(v.holidayReason)})` : ''}.`,
  ];
  if (v.groupTravel === 'Yes') visit.push('I will be travelling as part of an organised group.');
  if (v.companions) visit.push(`I will be travelling with ${v.companions === '1' ? 'one other person' : `${v.companions} other people`}.`);
  if (v.purposeDetails) visit.push(`In my own words: ${sentence(v.purposeDetails)}`);
  paragraphs.push(visit.join(' '));

  // Where they will stay
  const stay = [];
  if (v.accommodationPlan) stay.push(`My plan for accommodation is: ${lower(v.accommodationPlan)}.`);
  if (v.accommodationArea) stay.push(`I expect to stay in ${v.accommodationArea}.`);
  if (Array.isArray(v.accommodationTowns) && v.accommodationTowns.length) stay.push(`I have arranged a place to stay in ${list(v.accommodationTowns)}.`);
  if (stay.length) paragraphs.push(stay.join(' '));

  // The applicant
  const person = [`I am a national of ${v.nationality || missing('nationality')}${v.residenceCountry ? ` and I live in ${v.residenceCountry}` : ''}.`];
  if (v.relationshipStatus) person.push(`My relationship status is ${lower(v.relationshipStatus)}.`);
  if (v.dependants) person.push(`${v.dependants === '1' ? 'One person relies' : `${v.dependants} people rely`} on me financially.`);
  if (v.parents) person.push(`I have given details of ${v.parents === '1' ? 'one parent' : `${v.parents} parents`}.`);
  paragraphs.push(person.join(' '));

  // Work
  const work = [];
  if (v.employmentStatus) work.push(`My employment status is ${lower(v.employmentStatus)}.`);
  if (v.jobTitle) work.push(`My job title is ${v.jobTitle}.`);
  if (v.employer) work.push(`I work for ${v.employer}${v.employmentSince ? ` ${v.employmentSince}` : ''}.`);
  if (v.businessSince) work.push(`I have run my business ${v.businessSince}.`);
  if (v.businessDescription) work.push(`My business: ${sentence(v.businessDescription)}`);
  if (v.jobDescription) work.push(`My work: ${sentence(v.jobDescription)}`);
  if (v.school) work.push(`I study at ${v.school}${v.studying ? `, where I am studying ${v.studying}` : ''}.`);
  else if (v.studying) work.push(`I am studying ${v.studying}.`);
  if (v.retiredSince) work.push(`I have been retired ${v.retiredSince}.`);
  if (work.length) paragraphs.push(work.join(' '));

  // Money
  const money = [];
  if (v.incomeMonthly) money.push(`My income from work is ${v.incomeMonthly} each month after tax.`);
  if (v.businessIncome) money.push(`My income from my business is ${v.businessIncome} each month after tax.`);
  if (v.pension) money.push(`I receive a pension of ${v.pension} each month.`);
  if (v.otherIncome) money.push(`I have other income of ${v.otherIncome} each month.`);
  if (v.savings) money.push(`I have savings of ${v.savings}.`);
  if (v.plannedSpend) money.push(`I plan to spend ${v.plannedSpend} on my visit.`);
  if (v.monthlySpend) money.push(`My total spending each month is ${v.monthlySpend}.`);
  if (v.someonePaying === 'Yes' && Array.isArray(v.payers) && v.payers.length) money.push(`Someone else is helping to pay for my visit (${v.payers.join(' | ')}).`);
  else if (v.someonePaying === 'No') money.push('I am paying for my visit myself.');
  if (money.length) paragraphs.push(money.join(' '));

  // Earlier travel
  const travel = [];
  if (v.ukVisitsCount) travel.push(`I have visited the United Kingdom ${v.ukVisitsCount === '1' ? 'once' : `${v.ukVisitsCount} times`} in the past 10 years.`);
  if (Array.isArray(v.ukVisits) && v.ukVisits.length) travel.push(`${v.ukVisits.join('. ')}.`);
  if (v.visitedPlaces) travel.push(`I have also visited ${lower(v.visitedPlaces)}.`);
  if (Array.isArray(v.otherCountries) && v.otherCountries.length) travel.push(`${v.otherCountries.join('. ')}.`);
  if (travel.length) paragraphs.push(travel.join(' '));

  paragraphs.push('I confirm that the information I have given in my application is true. Thank you for considering my application.');
  paragraphs.push(`Yours faithfully,\n\n${facts.tokens && facts.tokens.NAME ? '[NAME]' : missing('applicant\'s name')}`);
  return paragraphs.join('\n\n');
}

module.exports = { buildTemplate };
