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

module.exports = { PLACES, CAPITAL_ONLY, placesIn };
