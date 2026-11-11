/* eslint-disable */
'use strict';

/**
 * Turns an application into an ordered, human-readable review: parts, sections and rows.
 *
 * One plain function, used by the applicant's review page now and by the admin Overview and the PDF export
 * later, so all three always show the same thing. It has no UI and no server code in it, and it only reads
 * what it is given:
 *
 *   buildReview(config, answers, documents, declarations)
 *
 *  - config        the questions.json to read the form from (for a submitted application, the one it was
 *                  submitted under)
 *  - answers       the answers by question id, ALREADY DECRYPTED (decrypting is the server's job, before this)
 *  - documents     the files' metadata ({ slot, name, size }); only the name and size are used
 *  - declarations  the declaration records by question id ({ acceptedAt }), used to say when a tick was given
 *  - corrections   optional: when the team corrected an answer, by correction key (see correctionKey) -> a time. A
 *                  corrected row gets `correctedByTeam` (the date in words) and NOTHING else: never the old value
 *                  and never the reason, so the same builder can serve the applicant.
 *
 * Only questions that are visible with these answers appear. Values are text for people: option labels
 * instead of codes, dates written out, Yes and No, each repeating-group entry as its own numbered item,
 * and files as a name and a size. Sensitive answers are passed through as plain text, because they arrive
 * decrypted. Nothing here can contain a link, a URL or a storage id: it is only ever given file names and
 * sizes, and builds nothing else.
 */

const engine = require('./engine');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NOT_ANSWERED = 'Not answered';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** "2027-03-01" -> "1 March 2027". Anything that is not a full date is returned as it is. */
function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return String(value);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2027-03" -> "March 2027". */
function formatMonth(value) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(value));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return String(value);
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** A date or a moment (a Date or an ISO text) as "1 March 2027", or '' when it is neither. */
function formatMoment(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const withCommas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 1500 -> "1,500"; 1500.5 -> "1,500.50". */
function formatNumber(n) {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [whole, fraction] = fixed.split('.');
  return withCommas(whole) + (fraction ? `.${fraction}` : '');
}

function formatAmount(value) {
  if (!isObject(value) || typeof value.amount !== 'number') return String(value);
  const text = formatNumber(value.amount);
  return value.currency === 'GBP' ? `£${text}` : `${text} ${value.currency}`;
}

function formatDuration(value) {
  if (!isObject(value)) return String(value);
  const parts = ['years', 'months', 'weeks', 'days']
    .filter((unit) => typeof value[unit] === 'number')
    .map((unit) => `${value[unit]} ${value[unit] === 1 ? unit.slice(0, -1) : unit}`);
  return parts.length ? parts.join(', ') : '';
}

/** "1,536 bytes" style sizes for people: 900 -> "900 bytes", 1536 -> "1.5 KB", 4194304 -> "4 MB". */
function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const trim = (n) => String(Math.round(n * 10) / 10);
  if (bytes < 1024 * 1024) return `${trim(bytes / 1024)} KB`;
  return `${trim(bytes / (1024 * 1024))} MB`;
}

function countryName(code) {
  const found = engine.getCountries().find((c) => c.code === code);
  return found ? found.name : String(code);
}

/** The text of one answer, or null when it has none to show. Returns { text, items? }. */
function readValue(cfg, question, value, answers, entry) {
  switch (question.type) {
    case 'YN':
      return { text: value === true ? 'Yes' : 'No' };
    case 'DATE':
      return { text: formatDate(value) };
    case 'MY':
      return { text: formatMonth(value) };
    case 'NUM':
      return { text: String(value) };
    case 'AMT':
      return { text: formatAmount(value) };
    case 'DUR':
      return { text: formatDuration(value) };
    case 'CTRY':
      return { text: countryName(value) };
    case 'SEL': {
      const option = engine.resolveOptions(cfg, question.id, answers, entry).find((o) => o.value === value);
      return { text: option ? option.label : String(value) };
    }
    case 'CHK': {
      const options = engine.resolveOptions(cfg, question.id, answers, entry);
      const items = (Array.isArray(value) ? value : []).map((v) => {
        const option = options.find((o) => o.value === v);
        return option ? option.label : String(v);
      });
      return { text: items.join('; '), items };
    }
    case 'ADDR': {
      if (!isObject(value)) return { text: String(value) };
      return { text: [value.line1, value.line2, value.town, value.region, value.postcode, value.country ? countryName(value.country) : '']
        .filter((part) => typeof part === 'string' && part.trim()).join(', ') };
    }
    case 'TEL':
      return { text: isObject(value) ? `${value.countryCode} ${value.number}` : String(value) };
    default:
      // TXT, LNG, EML: the text as it was given.
      return { text: String(value) };
  }
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

/**
 * The text of one stored value as the review would show it ("Yes", "1 March 2027", "£1,500", an option's label),
 * or "Not answered" when there is nothing to show. `answers` is the whole application (some option lists are made
 * from other answers) and `entry` is the repeating-group entry when the question is inside one.
 */
function describeValue(cfg, question, value, answers, entry) {
  if (question.type === 'ACK') return value === true ? 'Confirmed' : 'Not confirmed';
  if (!hasValue(value)) return NOT_ANSWERED;
  return readValue(cfg, question, value, isObject(answers) ? answers : {}, entry || null).text;
}

/**
 * The key a correction is stored under: the question id, or "<question id>[<entry index>]" for an answer inside a
 * repeating group's entry. A repeating group as a whole (entries added or removed) uses the group's id.
 */
function correctionKey(questionId, index) {
  return index === undefined || index === null ? questionId : `${questionId}[${index}]`;
}

/** { correctedByTeam: "1 March 2027" } when the answer under this key was corrected by the team, else nothing. */
function correctionMark(corrections, key) {
  if (!isObject(corrections) || corrections[key] === undefined) return {};
  const when = formatMoment(corrections[key]);
  return when ? { correctedByTeam: when } : {};
}

function questionRow(cfg, question, answers, entry, documents, declarations, corrections, key) {
  const base = { id: question.id, number: question.number, label: question.label, ...correctionMark(corrections, key) };

  if (question.type === 'FILE') {
    const files = (Array.isArray(documents) ? documents : [])
      .filter((d) => d && d.slot === question.slot)
      .map((d) => ({ name: String(d.name), size: d.size, sizeText: formatSize(d.size) }));
    return { ...base, kind: 'files', files, empty: files.length === 0, value: files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'No files uploaded' };
  }

  const value = entry ? entry[question.id] : answers[question.id];

  if (question.type === 'ACK') {
    if (value !== true) return { ...base, kind: 'value', value: 'Not confirmed', empty: true };
    const record = declarations && declarations[question.id];
    const when = record ? formatMoment(record.acceptedAt) : '';
    return { ...base, kind: 'value', value: 'Confirmed', ...(when ? { note: `Confirmed on ${when}` } : {}) };
  }

  if (!hasValue(value)) return { ...base, kind: 'value', value: NOT_ANSWERED, empty: true };
  const { text, items } = readValue(cfg, question, value, answers, entry);
  return { ...base, kind: 'value', value: text, ...(items ? { items } : {}) };
}

function groupRow(cfg, group, answers, documents, declarations, corrections) {
  const entries = Array.isArray(answers[group.id]) ? answers[group.id] : [];
  const members = group.questions.map((id) => engine.getQuestion(cfg, id)).filter(Boolean);
  return {
    id: group.id,
    number: null,
    label: `${group.entryLabel} details`,
    kind: 'group',
    ...correctionMark(corrections, correctionKey(group.id)),
    empty: entries.length === 0,
    value: entries.length === 0 ? 'No entries' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`,
    entries: entries.map((entry, index) => ({
      title: `${group.entryLabel} ${index + 1}`,
      rows: members
        .filter((m) => engine.isVisible(cfg, m.id, answers, isObject(entry) ? entry : {}))
        .map((m) => questionRow(cfg, m, answers, isObject(entry) ? entry : {}, documents, declarations, corrections, correctionKey(m.id, index))),
    })),
  };
}

function sectionRows(cfg, sectionId, answers, documents, declarations, corrections) {
  const visible = new Set(engine.getVisibleQuestions(cfg, sectionId, answers).map((q) => q.id));
  const rows = [];
  const placed = new Set();
  for (const question of cfg.questions) {
    if (question.section !== sectionId || !visible.has(question.id)) continue;
    if (!question.group) {
      rows.push(questionRow(cfg, question, answers, null, documents, declarations, corrections, correctionKey(question.id)));
      continue;
    }
    if (placed.has(question.group)) continue;
    placed.add(question.group);
    const group = (cfg.groups || []).find((g) => g.id === question.group);
    if (group) rows.push(groupRow(cfg, group, answers, documents, declarations, corrections));
  }
  return rows;
}

/**
 * The review of an application: { parts: [{ id, title, sections: [{ id, title, filesOnly, rows }] }] }.
 * Sections and parts that do not apply (nothing in them is visible) are left out, in form order.
 * A row is { id, number, label, kind: 'value' | 'files' | 'group', value, empty?, items?, note?, files?, entries? }.
 */
function buildReview(cfg, answers, documents, declarations, corrections) {
  const given = isObject(answers) ? answers : {};
  const sections = engine.getVisibleSections(cfg, given);
  const parts = cfg.parts
    .map((part) => ({
      id: part.id,
      title: part.title,
      sections: sections
        .filter((section) => section.part === part.id)
        .map((section) => ({
          id: section.id,
          title: section.title,
          filesOnly: engine.isFilesOnlySection(cfg, section.id),
          rows: sectionRows(cfg, section.id, given, documents, declarations, corrections),
        })),
    }))
    .filter((part) => part.sections.length > 0);
  return { parts };
}

module.exports = {
  buildReview,
  describeValue,
  correctionKey,
  formatDate,
  formatMonth,
  formatMoment,
  formatAmount,
  formatDuration,
  formatSize,
};
