'use strict';

// Made-up itinerary descriptions for tests, for any number of headings up to 30: each ordinary day has its own opening words and its own
// sight, so the set passes every rule an AI answer has to pass (no repeated sentence, run of five words or opening three words), and the
// arrival and the last day say what they must. No real data.

const OPENERS = [
  'Wander through', 'Explore', 'Visit', 'Walk around', 'Stroll along', 'Browse', 'Tour', 'Cross', 'Climb', 'Sit in',
  'Follow', 'Discover', 'Head to', 'Look around', 'Spend the morning at', 'Take time at', 'Call in at', 'See', 'Pause at', 'Step into',
  'Make for', 'Settle by', 'Trace', 'Circle', 'Roam', 'Inspect', 'Survey', 'Admire', 'Pass through', 'Linger at',
];
const TAILS = [
  'the old market and its side streets', 'a well-known museum and its main galleries', 'the cathedral and the quiet close around it', 'a city park and its lake path',
  'the castle walls and the ramparts', 'a historic street of small shops', 'the riverside path and its bridges', 'a famous abbey and its cloisters',
  'the central library and its reading rooms', 'a botanical garden and its glasshouses', 'the old harbour and its fish stalls', 'the university quad and nearby lanes',
  'a covered arcade of independent shops', 'the town hall square and its fountain', 'a hilltop viewpoint over the rooftops', 'the market hall and its food stalls',
  'a small gallery of local art', 'the old city gates and the lanes beyond', 'a canal towpath and its locks', 'the oldest church in the centre',
  'a row of Georgian terraces', 'the clock tower and the square below', 'a museum of local history', 'the city wall and its walkway',
  'a quiet park with a bandstand', 'the old bridge and the weir beside it', 'a street of antique dealers', 'the guildhall and its courtyard',
  'a walled garden near the river', 'the observatory and its small museum',
];

/**
 * `count` descriptions: the arrival first, a departure last, and a distinct day for each heading between. `places` are spread over the
 * days in order (the first days in the first place, and so on); with none, the city is "the city".
 */
function distinctDescriptions(count, places = []) {
  if (count > OPENERS.length) throw new Error('distinctDescriptions makes at most 30');
  return Array.from({ length: count }, (_, i) => {
    const place = places.length ? places[Math.min(places.length - 1, Math.floor((i / count) * places.length))] : 'the city';
    if (count === 1) return `Arrive in ${place}, see what is close by and set off on the journey home.`;
    if (i === 0) return `Arrive in ${place} and settle in, then take a gentle first look around the area.`;
    if (i === count - 1) return `Spend a last quiet morning in ${place} before setting off on the journey home.`;
    return `${OPENERS[i]} ${TAILS[i]} in ${place}.`;
  });
}

/** A word made of letters only that is different for every (i, j): for entries that must share nothing with each other. */
function pseudoWord(i, j) {
  let n = i * 100 + j + 1000;
  let word = '';
  while (n > 0) { word = String.fromCharCode(97 + (n % 26)) + word; n = Math.floor(n / 26); }
  return word;
}

module.exports = { distinctDescriptions, pseudoWord, OPENERS, TAILS };
