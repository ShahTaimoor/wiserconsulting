'use strict';

// Two rules that apply to BOTH facts builders (the cover letter's and the itinerary's):
//   1. "city and type of stay, never an address": the free-text area of the stay (6.7y) is sent only as the well-known places of a fixed
//      list that it names, never as typed; the town of an address is a town, not an address; "Other" is not sent as a bare word.
//   2. a BEST-EFFORT scrub of free text (postcodes, a house or flat number with a street, a title and a name), inside the redaction
//      round trip: each match is a token that remembers what was typed, so the final text still holds the applicant's own words.
// Made-up data only.

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./engine');
const cover = require('./coverLetterFacts');
const itinerary = require('./itineraryFacts');
const places = require('./places');

const cfg = engine.config;
const SUBMITTED = new Date('2026-11-03T10:00:00Z');
const WORST = 'Flat 4, 12 Acacia Road, SW1A 1AA, staying with my host Mr Ahmed Khan, tel 020 7946 0958, ahmed@example.com';

const base = (extra = {}) => ({
  q1_1: 'tourism', q1_4: 'holiday', q1_5: 'A holiday.', q1_6: '2027-03-15', q1_7: '2027-04-02',
  q2_1: 'Test', q2_2: 'Person', q6_7: false, q6_7x: 'paid_stay', q6_7y: WORST, ...extra,
});
const BUILDERS = [
  ['cover letter', (a) => cover.buildFacts(cfg, a, { submittedAt: SUBMITTED })],
  ['itinerary', (a) => itinerary.buildItineraryFacts(cfg, a, { submittedAt: SUBMITTED })],
];
const LEAKS = ['Flat 4', '12 Acacia', 'Acacia', 'SW1A', '1AA', 'Ahmed', 'Khan', 'host', 'staying with', '020', '7946', 'ahmed@', 'example.com'];
/** The lines of the "Where they will stay" section of the facts. */
const stayLines = (built) => {
  const lines = built.text.split('\n');
  const start = lines.indexOf('Where they will stay in the UK:');
  if (start < 0) return [];
  const end = lines.indexOf('', start);
  return lines.slice(start, end < 0 ? undefined : end);
};

// ---------------------------------------------------------------------------
// 1. The area of the stay
// ---------------------------------------------------------------------------

for (const [name, build] of BUILDERS) {
  test(`${name}: the worst-case string in 6.7y sends only the type of stay and nothing else`, () => {
    const built = build(base());
    for (const leak of LEAKS) assert.equal(built.text.includes(leak), false, `${leak} reached the ${name} facts`);
    assert.equal(built.canonical.replace(/"tokens":\{.*\}$/, '').includes('Acacia'), false, 'not in what the hash is made of either');
    assert.deepEqual(stayLines(built), ['Where they will stay in the UK:', '- Plans for accommodation: ' + (name === 'itinerary' ? 'a paid stay' : 'I will book a hotel or other paid stay')]);
    assert.equal(built.values.accommodationArea, undefined);
    assert.equal(built.sections.flatMap((s) => s.items).some((item) => item.key === 'accommodationArea'), false, 'no item for the area at all');
  });

  test(`${name}: a listed place in 6.7y is sent as "Area or city they expect to stay in: London", and only the place`, () => {
    const built = build(base({ q6_7y: `${WORST}, London` }));
    assert.ok(built.text.includes('- Area or city they expect to stay in: London\n') || built.text.endsWith('- Area or city they expect to stay in: London'), built.text);
    for (const leak of LEAKS) assert.equal(built.text.includes(leak), false, `${leak} reached the ${name} facts`);
    assert.deepEqual(built.values.accommodationArea, ['London']);
    assert.deepEqual(built.raw.accommodationArea, ['London']);
    const several = build(base({ q6_7y: 'near the river in Bath, then Edinburgh for a week' }));
    assert.match(several.text, /- Area or city they expect to stay in: Bath; Edinburgh/);
    assert.equal(several.text.includes('river'), false);
  });

  test(`${name}: a place that is not on the list, and an empty or hidden answer, send nothing for the area`, () => {
    for (const typed of ['Reading', 'my cousin\'s house', '   ', '']) assert.equal(build(base({ q6_7y: typed })).values.accommodationArea, undefined, JSON.stringify(typed));
    // Hidden by its gate (6.7 is Yes): never used, even if it is still stored.
    assert.equal(build(base({ q6_7: true, q6_7y: 'London' })).values.accommodationArea, undefined);
    assert.equal(build(base({ q6_7y: undefined })).values.accommodationArea, undefined);
  });

  test(`${name}: "Other" as the type of stay is "somewhere else", never the bare word`, () => {
    const built = build(base({ q6_7x: 'other', q6_7y: undefined }));
    assert.ok(built.values.accommodationPlan === 'somewhere else', built.values.accommodationPlan);
    assert.match(built.text, /- Plans for accommodation: somewhere else/);
    assert.equal(/Accommodation: Other|: Other\b/.test(built.text), false);
    assert.equal(built.raw.accommodationPlan, 'other', 'the stored answer is still known to the template');
  });

  test(`${name}: the town of an address is a town: one with a digit, a comma or a great length is an address typed in the wrong box and is dropped`, () => {
    const entry = (town) => ({ q6_7a: 'Somewhere', q6_7b: { line1: '1 Test Street', town, postcode: 'RG1 1AA', country: 'GB' }, q6_7c: '2027-03-15', q6_7d: '2027-04-02' });
    const run = (towns) => build(base({ q6_7: true, q6_7x: undefined, q6_7y: undefined, accommodation: towns.map(entry) }));
    assert.deepEqual(run(['Reading']).values.accommodationTowns, ['Reading']);
    assert.deepEqual(run(['Reading', 'Bath']).values.accommodationTowns, ['Reading', 'Bath']);
    assert.equal(run(['12 Acacia Road']).values.accommodationTowns, undefined);
    assert.equal(run(['Reading, Berkshire']).values.accommodationTowns, undefined);
    assert.equal(run(['x'.repeat(61)]).values.accommodationTowns, undefined);
    assert.deepEqual(run(['SW1A 1AA', 'Reading']).values.accommodationTowns, ['Reading'], 'only the bad one is dropped');
    // The street, the postcode and the place's own name are never read, whatever the town.
    const built = run(['Reading']);
    for (const leak of ['Test Street', 'RG1', 'Somewhere']) assert.equal(built.text.includes(leak), false, leak);
  });
}

test('the allowlist tables: the area of the stay is a "places" fact on both, not free text, and no free-text fact is left on the itinerary but its trip description', () => {
  for (const specs of [cover.SPECS, itinerary.SPECS]) {
    const area = specs.find((s) => s.key === 'accommodationArea');
    assert.equal(area.kind, 'places');
    assert.equal(area.id, 'q6_7y');
  }
  assert.deepEqual(itinerary.SPECS.filter((s) => s.kind === 'text').map((s) => s.id), ['q1_5']);
  assert.deepEqual(cover.SPECS.filter((s) => s.kind === 'text').map((s) => s.id).sort(), ['q1_5', 'q5_1d', 'q5_1h', 'q5_6', 'q5_8']);
  assert.deepEqual(cover.validateAllowlist(), []);
  assert.deepEqual(itinerary.validateItineraryAllowlist(), []);
});

test('the fixed list of places is shared: both builders find the same places, from the same list, and never return any text of their own', () => {
  assert.equal(itinerary.placesIn, places.placesIn);
  assert.equal(itinerary.PLACES, places.PLACES);
  const found = places.placesIn(WORST + ' then London');
  assert.deepEqual(found, ['London']);
  for (const name of places.placesIn('Zainab Khan loves York, ahmed@example.com and Bath')) assert.ok(places.PLACES.includes(name));
});

// ---------------------------------------------------------------------------
// 2. The best-effort scrub
// ---------------------------------------------------------------------------

const WORD = '(?<![\\p{L}\\p{N}_])';
const scrub = (text, tokens = {}) => {
  const registry = cover.createRedactions();
  const out = cover.cleanFreeText(text, tokens, registry);
  return { out, map: registry.map, originals: Object.values(registry.map) };
};
/** Puts every token back, in one pass, exactly as the server does. */
const restore = (text, map) => text.replace(/\[R\d+\]/g, (token) => (Object.prototype.hasOwnProperty.call(map, token.slice(1, -1)) ? map[token.slice(1, -1)] : token));

test('scrub: UK postcodes, in any case and spacing', () => {
  for (const code of ['SW1A 1AA', 'sw1a 1aa', 'SW1A1AA', 'M1 1AE', 'B33 8TH', 'CR2 6XH', 'DN55 1PT', 'W1A 0AX', 'EC1A 1BB']) {
    const { out, originals } = scrub(`I will be at ${code} for a week`);
    assert.equal(out.includes(code), false, code);
    assert.ok(originals.includes(code), code);
    assert.match(out, /^I will be at \[R\d+\] for a week$/, code);
  }
});

test('scrub: a flat or a house number with up to three words and a street word, abbreviations and numbers like 12a and 3-5', () => {
  const cases = [
    ['12 Acacia Road', '12 Acacia Road'],
    ['12a Acacia Road', '12a Acacia Road'],
    ['3-5 High Street', '3-5 High Street'],
    ['221 baker street', '221 baker street'],
    ['7 St Peters Road', '7 St Peters Road'],
    ['10 Downing Street', '10 Downing Street'],
    ['45 The Old Mill Lane', '45 The Old Mill Lane'],
    ['8 Oak Avenue', '8 Oak Avenue'],
    ['2 Elm Close', '2 Elm Close'],
    ['19 Queens Gardens', '19 Queens Gardens'],
    ['5 Rose Court', '5 Rose Court'],
    ['101 Park Terrace', '101 Park Terrace'],
    ['14 Green Way', '14 Green Way'],
    ['6 High St', '6 High St'],
    ['6 Marsh Rd.', '6 Marsh Rd.'],
    ['Flat 4', 'Flat 4'],
    ['flat 12b', 'flat 12b'],
    ['Apartment 9', 'Apartment 9'],
  ];
  for (const [text, original] of cases) {
    const { out, originals } = scrub(`I will stay at ${text} in the city`);
    assert.equal(out.includes(original), false, `${text} was not scrubbed: ${out}`);
    assert.ok(originals.includes(original), `${text}: ${JSON.stringify(originals)}`);
  }
});

test('scrub: a title and the one or two capitalised words after it', () => {
  for (const [text, original] of [
    ['Mr Ahmed Khan', 'Mr Ahmed Khan'], ['Mrs Smith', 'Mrs Smith'], ['Ms Jane Doe', 'Ms Jane Doe'], ['Miss Rose Tyler', 'Miss Rose Tyler'], ['Mx Taylor', 'Mx Taylor'],
    ['Dr Alan Grant', 'Dr Alan Grant'], ['Dr. Alan Grant', 'Dr. Alan Grant'], ['Prof Turing', 'Prof Turing'], ['Professor Higgins', 'Professor Higgins'], ['MR AHMED KHAN', 'MR AHMED KHAN'], ["Mrs O'Neil", "Mrs O'Neil"], ['Dr Müller', 'Dr Müller'], ['Ms Chloë Dubois-Martin', 'Ms Chloë Dubois-Martin'],
  ]) {
    const { out, originals } = scrub(`I am staying with ${text} next week`);
    assert.equal(out.includes(original), false, `${text}: ${out}`);
    assert.ok(originals.includes(original), `${text}: ${JSON.stringify(originals)}`);
    assert.match(out, /^I am staying with \[R\d+\] next week$/, text);
  }
  // Only two words after the title are taken.
  const three = scrub('Mr Ahmed Khan Junior arrives');
  assert.equal(three.originals[0], 'Mr Ahmed Khan');
  assert.match(three.out, /\[R\d+\] Junior arrives/);
});

test('scrub: telephone numbers, emails and links keep working next to the new patterns, and every kind is its own token', () => {
  const { out, map } = scrub(WORST);
  for (const leak of ['Flat 4', 'Acacia', 'SW1A', 'Ahmed', 'Khan', '020', 'ahmed@']) assert.equal(out.includes(leak), false, leak);
  assert.match(out, /^\[R\d+\], \[R\d+\], \[R\d+\], staying with my host \[R\d+\], tel \[R\d+\], \[R\d+\]$/);
  assert.equal(new Set(Object.values(map)).size, Object.keys(map).length);
  assert.deepEqual(Object.values(map).sort(), ['020 7946 0958', '12 Acacia Road', 'Flat 4', 'Mr Ahmed Khan', 'SW1A 1AA', 'ahmed@example.com'].sort());
});

test('scrub: ordinary words and place names that must NOT be scrubbed are left exactly as they are', () => {
  for (const text of [
    'I would like to see Bath and Edinburgh.',
    'A holiday in London with my family.',
    'We plan three days in the Lake District and two days in York.',
    'I will miss the train home, and Miss it not.',
    'Mr and Mrs are titles and mr is not a name',
    'I will meet Dr and Mrs everywhere.',
    'the way to the court is a long road',
    'I want to visit the Tower of London in March 2027, arriving 15 March.',
    'A stay of 18 nights from 15 March to 2 April.',
    'I have 2 children and 3 bags to carry.',
    'I take the number 12 bus down Kensington High Street to see the shops.',
    'We saw 3 museums, a park and a market.',
    'I earn 3,500 a month and save 400.',
    'Room for 2 in a quiet place.',
    'Visit the market in Camden Town, the Bridge, and Hyde Park.',
  ]) {
    const { out, originals } = scrub(text);
    assert.equal(out, text, `corrupted: ${text} -> ${out}`);
    assert.deepEqual(originals, [], text);
  }
});

test('scrub: where ordinary text does match (a number then words then a street word), it is replaced by a token and put back exactly', () => {
  // "Kensington High Street" visited as an attraction, with a number in front: scrubbed, and restored as typed.
  const typed = 'I want to walk down 24 Kensington High Street and see the shops.';
  const { out, map } = scrub(typed);
  assert.equal(out.includes('Kensington'), false);
  assert.equal(restore(out, map), typed);
});

test('scrub: text in other scripts is not corrupted, and what is matched in a mixed text is still restored exactly', () => {
  for (const text of [
    'أريد زيارة لندن مع عائلتي لمدة 5 أيام', 'ロンドンとバースを訪れたいです。3日間滞在します', '我想去伦敦和爱丁堡，住 12 号', 'Хочу посетить Лондон и Эдинбург на 7 дней', 'אני רוצה לבקר בלונדון ובאדינבורו', 'Θέλω να επισκεφθώ το Λονδίνο για 4 ημέρες', 'ฉันอยากไปลอนดอนเป็นเวลา 5 วัน', 'चौथा दिन लंदन में घूमना', 'Quiero ver Londres 10 días, Ç ñ é ü ø å.',
  ]) {
    const { out, originals } = scrub(text);
    assert.equal(out, text, text);
    assert.deepEqual(originals, [], text);
  }
  const mixed = 'أريد زيارة Bath مع Mr Ahmed Khan في SW1A 1AA و 12 Acacia Road، 我想去伦敦';
  const { out, map } = scrub(mixed);
  assert.equal(/Ahmed|SW1A|Acacia/.test(out), false);
  assert.ok(out.includes('أريد زيارة Bath') && out.includes('我想去伦敦'));
  assert.equal(restore(out, map), mixed);
});

test('scrub: the full round trip returns the original text unchanged, for every kind of match, with the applicant\'s own name and a typed "[R1]" in it', () => {
  const tokens = { NAME: 'Test Person' };
  for (const typed of [
    WORST,
    'I test software. Test Person here: 12 Acacia Road, SW1A 1AA, Flat 4, Mr Ahmed Khan, Mrs Smith, +44 7700 900123, a@b.co.uk, https://example.org/x?y=1.',
    'Typed [R1] and [NAME] and [R2] with Dr Alan Grant at 5 Oak Lane.',
    'mr khan, MR KHAN, Mr and Mrs, Miss the train, 3 days, 15 March 2027.',
    'Visit Bath. Stay at 3-5 High St. Then 9 Rose Court, then Flat 12b.',
  ]) {
    const { out, map } = scrub(typed, tokens);
    assert.equal(restore(out, map), typed, typed);
    // The tokens in the output are only the ones that were made.
    for (const token of out.match(/\[R\d+\]/g) || []) assert.ok(Object.prototype.hasOwnProperty.call(map, token.slice(1, -1)), token);
  }
});

test('scrub: through the facts builders, free text is scrubbed and the originals are remembered for putting back (trip description and job description)', () => {
  const typed = 'See London, then stay at 12 Acacia Road, SW1A 1AA with Mr Ahmed Khan.';
  for (const [name, build] of BUILDERS) {
    const built = build(base({ q6_7y: undefined, q1_5: typed }));
    const block = /<data name="[^"]+">\n([\s\S]*?)\n<\/data>/.exec(built.text)[1];
    for (const leak of ['Acacia', 'SW1A', 'Ahmed', 'Khan']) assert.equal(block.includes(leak), false, `${name}: ${leak}`);
    assert.equal(restore(block, built.redactions), typed, name);
  }
  const job = 'I work for Mr Brown at 5 Station Road, M1 1AE.';
  const built = cover.buildFacts(cfg, { ...base(), q5_1: 'employed', q5_8: job }, { submittedAt: SUBMITTED });
  assert.equal(/Brown|Station|M1 1AE/.test(built.text), false);
  assert.equal(restore(/<data name="About the job">\n([\s\S]*?)\n<\/data>/.exec(built.text)[1], built.redactions), job);
});

test('the scrub is part of what the facts are made of: a different address is a different fact, the same words are the same fact', () => {
  const one = cover.buildFacts(cfg, base({ q6_7y: undefined, q1_5: 'Stay at 12 Acacia Road.' }), { submittedAt: SUBMITTED }).canonical;
  assert.equal(cover.buildFacts(cfg, base({ q6_7y: undefined, q1_5: 'Stay at 12 Acacia Road.' }), { submittedAt: SUBMITTED }).canonical, one);
  assert.notEqual(cover.buildFacts(cfg, base({ q6_7y: undefined, q1_5: 'Stay at 14 Acacia Road.' }), { submittedAt: SUBMITTED }).canonical, one);
});
