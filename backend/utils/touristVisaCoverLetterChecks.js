/**
 * Checks a cover letter written by the AI before it is kept (pure functions, no I/O).
 *
 *  - Placeholders: only [NAME], [EMPLOYER] and [SCHOOL] may appear, each only if the facts supplied its value, and
 *    [NAME] must appear (the letter has to be signed). The real values are put in afterwards, by substitute().
 *  - No hallucinated figures: every date, number and amount in the letter, and every number written out in words,
 *    must also be in the facts the model was given (after formatting: "1,250" and "1250" are the same).
 *  - A sensible length, no links, no markup.
 *
 * A failed check returns a FIXED CODE and nothing of the text, so the reason can be recorded and shown safely.
 */

const { MONTH_PATTERN } = require('../shared/tourist-visa/coverLetterFacts');

const KNOWN_TOKENS = ['NAME', 'EMPLOYER', 'SCHOOL'];
const MIN_WORDS = 150;
const MAX_WORDS = 700;

// "one" is left out on purpose: it is mostly a pronoun ("one of the reasons").
const NUMBER_WORDS = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000,
};
const WORD_PATTERN = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');
const DAY_MONTH_YEAR = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`, 'g');
const MONTH_YEAR = new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{4})\\b`, 'g');
const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;

const numberKey = (raw) => String(Number(String(raw).replace(/,/g, '')));

/** Cleans what a model tends to add: code fences, bold markers, heading marks. */
function tidy(raw) {
  return String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/^```[a-z]*\n?|\n?```$/gi, '')
    .replace(/\*\*|__/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** The dates of a text as keys: "1 March 2027", "1 March" and "March 2027". Returns { keys, rest } with the dates taken out of `rest`. */
function datesOf(text) {
  const keys = [];
  let rest = text.replace(DAY_MONTH_YEAR, (match, day, month, year) => {
    keys.push(year ? `${Number(day)} ${month} ${year}` : `${Number(day)} ${month}`);
    return ' ';
  });
  rest = rest.replace(MONTH_YEAR, (match, month, year) => {
    keys.push(`${month} ${year}`);
    return ' ';
  });
  return { keys, rest };
}

/** Everything the facts allow: dates (and the shorter forms of a full date) and numbers. */
function allowedFrom(factsText) {
  const dates = new Set();
  const full = [...factsText.matchAll(DAY_MONTH_YEAR)];
  for (const m of full) {
    dates.add(m[3] ? `${Number(m[1])} ${m[2]} ${m[3]}` : `${Number(m[1])} ${m[2]}`);
    dates.add(`${Number(m[1])} ${m[2]}`);
    if (m[3]) dates.add(`${m[2]} ${m[3]}`);
  }
  for (const m of factsText.matchAll(MONTH_YEAR)) dates.add(`${m[1]} ${m[2]}`);
  const numbers = new Set([...factsText.matchAll(NUMBER)].map((m) => numberKey(m[0])));
  return { dates, numbers };
}

/** The code of the first date, number or amount in the text that is not in the facts, or null. */
function figuresCode(text, facts) {
  const allowed = allowedFrom(facts.text || '');
  const { keys, rest } = datesOf(text);
  if (keys.some((key) => !allowed.dates.has(key))) return 'LETTER_DATE_NOT_IN_FACTS';

  // List markers ("1." at the start of a line) are not figures.
  const figures = rest.replace(/^\s*\d+[.)]\s+/gm, '');
  for (const m of figures.matchAll(NUMBER)) if (!allowed.numbers.has(numberKey(m[0]))) return 'LETTER_NUMBER_NOT_IN_FACTS';
  for (const m of figures.matchAll(WORD_PATTERN)) if (!allowed.numbers.has(String(NUMBER_WORDS[m[1].toLowerCase()]))) return 'LETTER_NUMBER_NOT_IN_FACTS';

  return null;
}

/**
 * checkLetter(raw, facts) -> { ok: true, text } with the placeholders still in, or { ok: false, code }.
 * `facts` is the result of buildFacts (its `text` is what the model saw and its `tokens` the real values).
 */
function checkLetter(raw, facts) {
  const text = tidy(raw);
  if (!text) return { ok: false, code: 'LETTER_EMPTY' };
  const words = wordCount(text);
  if (words < MIN_WORDS || words > MAX_WORDS) return { ok: false, code: 'LETTER_LENGTH' };
  if (/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.\w+|<[a-z/!][^>]*>/i.test(text)) return { ok: false, code: 'LETTER_LINK' };

  const tokens = facts.tokens || {};
  for (const match of text.matchAll(/\[([^\]\n]{0,40})\]/g)) {
    const name = match[1];
    if (!KNOWN_TOKENS.includes(name) || typeof tokens[name] !== 'string' || !tokens[name]) return { ok: false, code: 'LETTER_UNKNOWN_TOKEN' };
  }
  if (tokens.NAME && !text.includes('[NAME]')) return { ok: false, code: 'LETTER_MISSING_TOKEN' };

  const figures = figuresCode(text, facts);
  if (figures) return { ok: false, code: figures };

  return { ok: true, text };
}

/** Puts the real values in place of the placeholders. A value is inserted as it is (no pattern characters are special). */
function substitute(text, tokens) {
  return text.replace(/\[(NAME|EMPLOYER|SCHOOL)\]/g, (match, name) => (typeof tokens[name] === 'string' && tokens[name] ? tokens[name] : match));
}

module.exports = { checkLetter, figuresCode, substitute, tidy, wordCount, KNOWN_TOKENS, MIN_WORDS, MAX_WORDS };
