/* eslint-disable */
'use strict';

/**
 * The well-known places of the UK, from a FIXED list of ours, and a function that finds the ones a text names.
 *
 * Used by both facts builders (coverLetterFacts.js and itineraryFacts.js) so that free text about WHERE the applicant will stay is
 * never sent as typed: only a name from this list ever is. A street, a house number, a postcode, a host's name, a hotel's name
 * typed into such a box cannot travel by this, because the function returns only list names, never any of the text.
 *
 * Pure: no I/O, no clock, no server code.
 */

/** Well-known places in the UK: cities, towns, regions and a few landmarks. Spelled as a letter would write them. */
const PLACES = Object.freeze([
  'London', 'Oxford', 'Cambridge', 'Bristol', 'Brighton', 'Canterbury', 'York', 'Manchester', 'Liverpool', 'Birmingham', 'Leeds', 'Sheffield',
  'Newcastle', 'Durham', 'Nottingham', 'Leicester', 'Coventry', 'Norwich', 'Exeter', 'Plymouth', 'Southampton', 'Portsmouth', 'Winchester',
  'Salisbury', 'Stonehenge', 'Stratford-upon-Avon', 'Lincoln', 'Cornwall', 'Devon', 'Cotswolds', 'Lake District', 'Peak District', 'Yorkshire',
  'Bournemouth', 'Harrogate', 'Whitby', 'Blackpool', 'Carlisle', 'Gloucester', 'Worcester', 'Cheltenham', 'Hastings', 'Eastbourne', 'Margate',
  'Ipswich', 'Milton Keynes', 'Bradford', 'Wolverhampton', 'Stoke-on-Trent', 'Northampton', 'Peterborough', 'Cheddar', 'Glastonbury', 'Tintagel',
  "Land's End", "Hadrian's Wall", 'Isle of Wight', 'Greenwich', 'Hampton Court', 'Brontë Country', 'Dover', 'Windsor', 'Chester', 'Lancaster',
  'England', 'Edinburgh', 'Glasgow', 'Inverness', 'Aberdeen', 'Dundee', 'Stirling', 'St Andrews', 'Fort William', 'Isle of Skye', 'Loch Ness',
  'Highlands', 'Scotland', 'Cardiff', 'Swansea', 'Snowdonia', 'Anglesey', 'Conwy', 'Pembrokeshire', 'Brecon Beacons', 'Wales', 'Belfast',
  "Giant's Causeway", 'Northern Ireland', 'Bath', 'Derby', 'Hull', 'Perth', 'Kew',
]);

// Names that are also ordinary words: only a capital letter counts ("have a bath" is not a place).
const CAPITAL_ONLY = new Set(['Bath', 'Derby', 'Hull', 'Perth', 'Kew', 'Wales', 'Durham', 'Windsor', 'Chester', 'Lancaster', 'Highlands']);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';
const byLength = (a, b) => b.length - a.length;
const patternOf = (names, flags) => (names.length ? new RegExp(`${BOUNDARY_BEFORE}(${[...names].sort(byLength).map(escapeRegExp).join('|')})${BOUNDARY_AFTER}`, flags) : null);
const ANY_CASE = patternOf(PLACES.filter((name) => !CAPITAL_ONLY.has(name)), 'giu');
const CAPITAL = patternOf(PLACES.filter((name) => CAPITAL_ONLY.has(name)), 'gu');
const CANONICAL = new Map(PLACES.map((name) => [name.toLowerCase(), name]));

/** The places from PLACES that a text names, each once, in the order they first appear. Text only; nothing of it is returned. */
function placesIn(text) {
  const clean = String(text || '').replace(/[’‘]/g, "'");
  const found = [];
  for (const [pattern] of [[ANY_CASE], [CAPITAL]]) {
    if (!pattern) continue;
    for (const match of clean.matchAll(pattern)) found.push({ at: match.index, name: CANONICAL.get(match[0].toLowerCase()) || match[0] });
  }
  found.sort((a, b) => a.at - b.at);
  return [...new Map(found.map((f) => [f.name, f.name])).values()];
}

// A plain town: letters, spaces, apostrophes and hyphens only, 2 to 40 characters (one with a digit, a comma or a bracket is not a town).
const PLAIN_TOWN = /^[\p{L}][\p{L} '’-]{1,39}$/u;

/**
 * The place a town stands for, or null. A town that names a place of the list above gives that list name (the first one it names; the
 * list name is spelled as a letter would write it); any other plain town is used as typed (trimmed); anything else (a bracket, a digit,
 * a street) gives null: it is not a place we can name. The same two rules the itinerary template has always used for the town of a stay.
 */
function placeOfTown(town) {
  const text = typeof town === 'string' ? town.trim() : '';
  if (!text) return null;
  const listed = placesIn(text);
  if (listed.length) return listed[0];
  return PLAIN_TOWN.test(text) ? text : null;
}

/** Words that make a typed place an address or a stay (a street, a hotel...), not the name of a town or city. Lower case. */
const NOT_A_PLACE_WORDS = new Set([
  'hotel', 'hotels', 'inn', 'hostel', 'hostels', 'motel', 'lodge', 'resort', 'bnb', 'guesthouse', 'guest', 'apartment', 'apartments', 'flat', 'flats', 'villa',
  'street', 'road', 'avenue', 'lane', 'drive', 'crescent', 'terrace', 'gardens', 'boulevard', 'highway', 'postcode', 'floor', 'house', 'rd', 'ave',
]);

/** The most words the name of a town or city may have in a box the applicant types into ("Stoke on Trent", "Royal Leamington Spa"). */
const MAX_TOWN_WORDS = 3;

/**
 * Is this typed text the name of a town or city, and nothing more? The rules: the plain-town rule above (letters, spaces, apostrophes and
 * hyphens only; no digit, comma, bracket or tag; 2 to 40 characters), at most three words, and none of the words of an address or a stay
 * (street, road, hotel, flat...). A place of the list above is always accepted, whatever its words ("Hampton Court"). Used on the server (the
 * form's rule and the itinerary's facts), so a hand-made request cannot get past it.
 */
function isTownName(text) {
  const typed = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (!typed || !PLAIN_TOWN.test(typed)) return false;
  if (CANONICAL.has(typed.replace(/[’‘]/g, "'").toLowerCase())) return true;
  const words = typed.split(' ');
  if (words.length > MAX_TOWN_WORDS) return false;
  return !words.some((word) => NOT_A_PLACE_WORDS.has(word.toLowerCase()));
}

/** The places of the list, A to Z, as { value, label } options for a drop-down (the value is the name). */
const PLACE_OPTIONS = Object.freeze([...PLACES].sort((a, b) => a.localeCompare(b, 'en')).map((name) => Object.freeze({ value: name, label: name })));

module.exports = { PLACES, CAPITAL_ONLY, PLAIN_TOWN, NOT_A_PLACE_WORDS, MAX_TOWN_WORDS, PLACE_OPTIONS, placesIn, placeOfTown, isTownName };
