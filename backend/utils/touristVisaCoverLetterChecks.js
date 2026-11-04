/**
 * Checks a cover letter written by the AI before it is kept (pure functions, no I/O).
 *
 *  - Placeholders: only [NAME], [EMPLOYER] and [SCHOOL] may appear, each only if the facts supplied its value, and
 *    [NAME] must appear (the letter has to be signed). The real values are put in afterwards, by substitute().
 *  - No hallucinated figures: every date, number and amount in the letter, and every number written out in words,
 *    must also be in the facts the model was given (after formatting: "1,250" and "1250" are the same).
 *  - A sensible length, no links, no markup.
 *
 * A failed check returns a FIXED CODE and nothing of the text, so the reason can be recorded and shown safely. A letter that
 * contains a banned phrase (BANNED_PHRASES below) returns AI_BANNED_PHRASE; the service asks the AI once more for that one.
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
/**
 * Phrases and patterns an AI letter must not contain: a SAFETY NET for the rules in the prompt (config/touristVisaCoverLetterPrompt.js),
 * not a guarantee. They cover announcing the applicant's own words, remarks about the form or "details provided", claims of
 * compliance, enthusiasm, ties, stability, funds, character and intentions, "demonstrating" and the like, and promises.
 * Each has a fixed id (the id, never the text, is what a test or a log may name). Case-insensitive. A pattern is ignored for
 * a letter whose applicant's own free text contains it too (they wrote it; the letter may use their words).
 * Every id needs an example in the tests, so a phrase cannot be added without being tested.
 */
const BANNED_PHRASES = Object.freeze([
  { id: 'own-words', pattern: /\bmy own words\b/i },
  { id: 'as-expressed', pattern: /\bas i (have )?(expressed|stated|explained|described|mentioned)\b|\bi (have )?(described|expressed)\b/i },
  { id: 'details-provided', pattern: /\bdetails (have been|were|are) (provided|given|supplied|stated)\b/i },
  { id: 'given-on-form', pattern: /\b(provided|given|stated|supplied|listed|entered) (on|in) (the|my|this) (application )?(form|application)\b/i },
  { id: 'the-form', pattern: /\b(application form|the form|my form)\b/i },
  { id: 'information-given', pattern: /\binformation (that )?(i have |i've )?(given|provided|supplied)\b/i },
  { id: 'compliance', pattern: /\b(complian(ce|t)|comply|complies|complying) with\b/i },
  { id: 'meets-requirements', pattern: /\b(meet|meets|meeting|satisf(y|ies|ying)|fulfil(s|ling)?) (all |the |these |those )?(immigration |visa |relevant )?(requirements|rules|criteria|conditions)\b/i },
  { id: 'immigration-rules', pattern: /\bimmigration rules\b/i },
  { id: 'enthusiasm', pattern: /\b(enthusias\w*|excited|eager\w*|delighted)\b/i },
  { id: 'looking-forward', pattern: /\blooking forward to\b/i },
  { id: 'demonstrating', pattern: /\bdemonstrat\w*/i },
  { id: 'illustrating', pattern: /\billustrat\w*/i },
  { id: 'underscoring', pattern: /\bunderscor\w*|\bunderlin(e|es|ing)\b|\btestament\b|\bshowcas\w*/i },
  { id: 'ties', pattern: /\b(ties|bonds)\b|\bstrong (family |personal |social |economic |financial )?(connections|links)\b/i },
  { id: 'stability', pattern: /\bstable (situation|life|employment|income|job|circumstances|background|position)\b|\bfinancially (stable|secure|independent|sound)\b/i },
  { id: 'public-funds', pattern: /\bpublic funds\b|\brecourse\b/i },
  { id: 'funds-claims', pattern: /\b(sufficient|adequate|ample|enough) (funds|money|means|resources)\b/i },
  { id: 'promise', pattern: /\b(guarantee\w*|promise\w*|assure\w*|pledge\w*)\b/i },
  { id: 'return-claim', pattern: /\b(intend|intention|intends)s? to return\b|\bwill return\b|\bwill definitely\b/i },
  { id: 'no-intention', pattern: /\b(do not|don't|have no|had no) (intend|intention|wish|plan)\b|\bno intention of\b/i },
  { id: 'genuine', pattern: /\bgenuine\b/i },
  { id: 'character', pattern: /\b(law-abiding|good character|trustworthy|upstanding|of good standing)\b/i },
  { id: 'confirm', pattern: /\bi (hereby )?(confirm|declare|certify|affirm)\b/i },
]);

/** What the applicant typed, as one text (what the facts carry as free text). */
function freeTextOf(facts) {
  const items = Array.isArray(facts && facts.sections) ? facts.sections.flatMap((s) => s.items || []) : [];
  return items.filter((i) => i && i.free).map((i) => (Array.isArray(i.value) ? i.value.join(' ') : String(i.value))).join('\n');
}

/** The id of the first banned phrase in the text, or null. A phrase the applicant's own free text contains is not counted. */
function bannedPhraseId(text, freeText = '') {
  for (const { id, pattern } of BANNED_PHRASES) {
    if (pattern.test(text) && !pattern.test(freeText)) return id;
  }
  return null;
}

function checkLetter(raw, facts) {
  const text = tidy(raw);
  if (!text) return { ok: false, code: 'LETTER_EMPTY' };
  const words = wordCount(text);
  if (words < MIN_WORDS || words > MAX_WORDS) return { ok: false, code: 'LETTER_LENGTH' };
  if (/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.\w+|<[a-z/!][^>]*>/i.test(text)) return { ok: false, code: 'LETTER_LINK' };

  // Tokens: [NAME], [EMPLOYER] and [SCHOOL] only when the facts supplied the value, and [R1], [R2]... only when the facts
  // took that piece of the applicant's text out. Anything else in square brackets is made up.
  const tokens = facts.tokens || {};
  const redactions = facts.redactions || {};
  for (const match of text.matchAll(/\[([^\]\n]{0,40})\]/g)) {
    const name = match[1];
    if (/^R\d+$/.test(name)) {
      if (!Object.prototype.hasOwnProperty.call(redactions, name)) return { ok: false, code: 'LETTER_UNKNOWN_TOKEN' };
    } else if (!KNOWN_TOKENS.includes(name) || typeof tokens[name] !== 'string' || !tokens[name]) {
      return { ok: false, code: 'LETTER_UNKNOWN_TOKEN' };
    }
  }
  if (tokens.NAME && !text.includes('[NAME]')) return { ok: false, code: 'LETTER_MISSING_TOKEN' };

  // Wording that is not allowed (a fixed code and the id of the phrase, never its text). The service asks the AI once more for this one.
  const banned = bannedPhraseId(text, freeTextOf(facts));
  if (banned) return { ok: false, code: 'AI_BANNED_PHRASE', phrase: banned };

  const figures = figuresCode(text, facts);
  if (figures) return { ok: false, code: figures };

  return { ok: true, text };
}

/**
 * Puts the real values in place of the tokens, in ONE pass over the letter: [NAME], [EMPLOYER] and [SCHOOL] become the applicant's
 * name, employer and school; [R1], [R2]... become exactly the text that was taken out of the applicant's own words, as they typed
 * it (same letters, same case). A value is inserted as it is: it is not searched again, so nothing a value contains can be
 * mistaken for a token, and no pattern character is special.
 */
function substitute(text, tokens, redactions = {}) {
  return text.replace(/\[(NAME|EMPLOYER|SCHOOL|R\d+)\]/g, (match, key) => {
    if (/^R\d+$/.test(key)) return Object.prototype.hasOwnProperty.call(redactions, key) ? redactions[key] : match;
    return typeof tokens[key] === 'string' && tokens[key] ? tokens[key] : match;
  });
}

// ---------------------------------------------------------------------------
// The closing
// ---------------------------------------------------------------------------

const CLOSING_PHRASE = /\byours\s+(?:faithfully|sincerely|truly)\b[\s,.;:!-]*/i;
const CLOSING_PHRASE_EVERYWHERE = new RegExp(CLOSING_PHRASE.source, 'gi');
const SIGN_OFF_LINE = /^(?:kind\s+regards|best\s+regards|with\s+(?:kind|best)\s+regards|warm\s+regards|best\s+wishes|regards|sincerely|respectfully|yours\s+(?:faithfully|sincerely|truly))\s*[,.;:!]?$/i;
const SIGN_OFF_ON_ITS_OWN_LINE = /(?:^|\n)[ \t]*(?:(?:with\s+)?(?:kind|best|warm)\s+regards|best\s+wishes|sincerely|respectfully)[ \t]*[,.;:!]?[ \t]*(?=\n|$)/i;
const SIGN_OFF_ENDING = /[\s,]*(?:with\s+)?(?:kind|best|warm)\s+regards[\s,.;:!]*$/i;
const NAME_GAP = "[not provided: applicant's name]";
const NAME_LINE = /^(?:\[NAME\]|\[not provided: applicant's name\])\s*[,.]?$/;
const NAME_ENDING = /(?:[\s,]*(?:\[NAME\]|\[not provided: applicant's name\])[.,]?)+\s*$/;

/**
 * Makes the end of a letter the same every time, whatever the writer did: the last paragraph, a blank line, "Yours faithfully," on
 * its own line, and the name on the next line. A closing the model put at the end of a line, written twice, replaced by another
 * sign-off ("Kind regards"), signed with a name of its own, or left out altogether all end up the same. A closing phrase in the
 * middle of a long text is only taken out. `name`: "token" signs with [NAME] (the server puts the real name in), "gap" with a visible
 * [not provided: applicant's name] gap, "none" adds no name line.
 */
function normalizeClosing(raw, { name = 'token' } = {}) {
  let text = String(raw).replace(/\r\n/g, '\n').trim();
  // The first closing: "Yours faithfully" anywhere (even at the end of a line), or another sign-off on a line of its own.
  const first = [CLOSING_PHRASE.exec(text), SIGN_OFF_ON_ITS_OWN_LINE.exec(text)].filter(Boolean).sort((a, b) => a.index - b.index)[0];
  if (first) {
    const tail = text.slice(first.index);
    const signatureLines = tail.split('\n').filter((line) => line.trim());
    // What follows the closing is a signature block (the closing, a name, maybe both again): drop it. A long tail is real text.
    text = tail.length <= 240 && signatureLines.length <= 6 ? text.slice(0, first.index) : text.replace(CLOSING_PHRASE_EVERYWHERE, ' ');
  }
  for (let pass = 0; pass < 4; pass += 1) {
    const before = text;
    const lines = text.trimEnd().split('\n');
    while (lines.length) {
      const last = lines[lines.length - 1].trim();
      if (last === '' || SIGN_OFF_LINE.test(last) || NAME_LINE.test(last)) lines.pop();
      else break;
    }
    text = lines.join('\n').replace(NAME_ENDING, '').replace(SIGN_OFF_ENDING, '').trim();
    if (text === before.trim()) break;
  }
  if (!text) return ''; // nothing but a closing is no letter: the checks report it as empty
  const signature = name === 'token' ? '\n[NAME]' : name === 'gap' ? `\n${NAME_GAP}` : '';
  return `${text}\n\nYours faithfully,${signature}`;
}

module.exports = { checkLetter, figuresCode, bannedPhraseId, freeTextOf, BANNED_PHRASES, substitute, normalizeClosing, NAME_GAP, tidy, wordCount, KNOWN_TOKENS, MIN_WORDS, MAX_WORDS };
