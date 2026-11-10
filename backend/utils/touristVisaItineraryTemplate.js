/**
 * The template itinerary: the fallback when the AI is off, failing, limited or answers badly, and always available (pure function, no I/O,
 * no AI). It writes the short text under each heading of the skeleton from the facts alone, in plain factual wording of our own:
 * the arrival day, the middle days spread across the places the applicant named in the order they named them (or, if they named none, the
 * city they will stay in), and the departure day. The same facts give the same itinerary, nothing is invented, and it never mentions
 * a booking, a price, a time, a hotel or a link: its descriptions pass the same checks as the AI's (a test makes sure).
 *
 * A long stay (weekly blocks) is described a week at a time with the same rules.
 */

const { placesIn } = require('../shared/tourist-visa/places');

// Places that are named with "the" in front.
const WITH_THE = new Set(['Lake District', 'Peak District', 'Cotswolds', 'Highlands', 'Isle of Wight', 'Isle of Skye', 'Brecon Beacons', "Giant's Causeway"]);
const named = (place) => (WITH_THE.has(place) ? `the ${place}` : place);
const TOWN = /^[\p{L}][\p{L} '’-]{1,39}$/u;

/** What to do on an ordinary day, by the purpose of the visit. Each is a sentence of our own; `{p}` is the place. */
const DAYS = {
  tourism: [
    'Spend the day on foot in {p}, taking in its best-known streets, squares and landmarks at an easy pace.',
    'Visit one or two of the main museums or galleries in {p}, with time left over for a relaxed meal and a walk.',
    'Give the day to the parks and open spaces of {p}, then explore a quieter neighbourhood in the afternoon.',
    'Join a guided walk or a boat or bus tour of {p} to learn something of its history.',
    'Browse the local markets and shops in {p}, stop for a coffee and see where the day leads.',
    'Choose a landmark or historic site in {p} that has not been seen yet and spend the day there.',
  ],
  family_friends: [
    'Spend the day with family or friends in {p}, with no plan beyond a shared meal and a walk.',
    'Visit a local park or a nearby landmark in {p} together with family or friends.',
    'Keep the day relaxed with family or friends in {p}: time at home, a short outing and an early night.',
    'Take family or friends to see something of {p} that they have not seen before.',
  ],
  other: [
    'Keep the day for the purpose of the visit, with some free time in {p} afterwards for a walk and a meal.',
    'A lighter day in {p}: attend to the purpose of the visit and leave the evening free.',
    'Spend the day in {p}, with the purpose of the visit first and a short walk around the area after it.',
  ],
};
const REST = 'A quieter day to rest, catch up on small tasks and enjoy a relaxed meal nearby.';
const WEEKS = {
  tourism: 'a mix of museums and galleries, parks, markets and relaxed walks, with a day of rest',
  family_friends: 'time with family or friends, short outings, shared meals and a day of rest',
  other: 'the purpose of the visit, with free time for walks and meals, and a day of rest',
};

const kindOf = (facts) => {
  const purpose = facts.raw && facts.raw.purpose;
  return purpose === 'family_friends' ? 'family_friends' : purpose === 'tourism' || purpose === undefined ? 'tourism' : 'other';
};

/** Where the days are spent: the places named, else the place(s) of the stay, else one plain town of the stay, else nowhere in particular. */
function locationsOf(facts) {
  if (facts.places && facts.places.length) return facts.places;
  const v = facts.values || {};
  // The area of the stay is already a list of well-known places (never the applicant's own words); the town of an address is read the same way.
  const stay = [...new Set([...[].concat(v.accommodationArea || []), ...placesIn([].concat(v.accommodationTowns || []).join(' '))])];
  if (stay.length) return stay;
  const plain = [].concat(v.accommodationTowns || []).find((text) => typeof text === 'string' && TOWN.test(text.trim()));
  return plain ? [plain.trim()] : [];
}

/** Spreads `count` items over the locations in order, the earlier ones getting the extra: [{ place, size }], skipping unused ones. */
function spread(count, locations) {
  if (count <= 0 || locations.length === 0) return [];
  const base = Math.floor(count / locations.length);
  const extra = count % locations.length;
  return locations.map((place, i) => ({ place, size: base + (i < extra ? 1 : 0) })).filter((part) => part.size > 0);
}

/** One description for each block of the skeleton, as an array of strings. */
function buildTemplateDescriptions(facts, skeleton) {
  const kind = kindOf(facts);
  const pool = DAYS[kind];
  const locations = locationsOf(facts);
  const blocks = skeleton.blocks;
  const first = locations[0];
  const last = locations[locations.length - 1];
  const out = new Array(blocks.length);

  if (skeleton.mode === 'weeks') {
    const totalDays = blocks.reduce((sum, block) => sum + block.days, 0);
    let before = 0;
    let previous = null;
    blocks.forEach((block, i) => {
      const place = locations.length ? locations[Math.min(locations.length - 1, Math.floor(((before + block.days / 2) / totalDays) * locations.length))] : null;
      before += block.days;
      const where = place ? named(place) : null;
      if (block.first && block.last) out[i] = `A short stay: arrive${where ? ` in ${where}` : ''}, see what is close by and leave for the journey home.`;
      else if (block.first) out[i] = `Arrive${where ? ` in ${where}` : ' in the United Kingdom'}, settle in and spend the first days getting to know the area, with unhurried walks and time to find your bearings.`;
      else if (block.last) out[i] = `The final days are for a last look around${where ? ` ${where}` : ' the area'} and for packing, before setting off on the journey home.`;
      else if (place && previous && place !== previous) out[i] = `Travel to ${where} early in the week and settle in. The rest of the week is for ${WEEKS[kind]}.`;
      else out[i] = `The week continues${where ? ` in ${where}` : ''} with ${WEEKS[kind]}.`;
      previous = place;
    });
    return out;
  }

  // One heading for each day. The arrival day, the departure day, and the days between spread over the places in order.
  const middle = blocks.length > 2 ? blocks.length - 2 : 0;
  const plan = [];
  for (const { place, size } of spread(middle, locations)) for (let n = 0; n < size; n += 1) plan.push({ place, n, size });
  let counter = 0;
  blocks.forEach((block, i) => {
    if (block.first && block.last) {
      out[i] = `A single day: arrive${first ? ` in ${named(first)}` : ''}, see what is close by and finish the day ready to travel home.`;
    } else if (block.first) {
      out[i] = first ? `Arrive in ${named(first)}, settle in and take a gentle first look around the area.` : 'Arrive in the United Kingdom, settle in and take a gentle first look around the area.';
    } else if (block.last) {
      out[i] = last ? `The last day: tidy up, take a final short walk around ${named(last)} and set off on the journey home.` : 'The last day: pack, take a final short walk nearby and set off on the journey home.';
    } else {
      const step = plan[i - 1];
      const place = step ? step.place : null;
      const next = step && step.n === step.size - 1 ? plan[i] : null;
      const moved = step && step.n === 0 && step.place !== first;
      if (!place) out[i] = counter % 6 === 5 ? REST : 'Spend a relaxed day close to where you are staying, exploring on foot and stopping for a meal along the way.';
      else if (moved) out[i] = `Travel to ${named(place)} and settle in, then take a first walk around the area to get your bearings.`;
      else if (next && next.place !== place) out[i] = `A relaxed day in ${named(place)} to finish what is left, then pack up ready for the move to ${named(next.place)}.`;
      else if (counter % 6 === 5) out[i] = REST;
      else out[i] = pool[counter % pool.length].replace('{p}', named(place));
      counter += 1;
    }
  });
  return out;
}

module.exports = { buildTemplateDescriptions, locationsOf, DAYS };
