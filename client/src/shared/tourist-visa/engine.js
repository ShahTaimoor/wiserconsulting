/* eslint-disable */
'use strict';

/**
 * Tourist Visa form engine.
 *
 * Canonical source: shared/tourist-visa/. Do not edit the copies in
 * client/src/shared/tourist-visa/ or backend/shared/tourist-visa/; run
 * `node scripts/sync-shared.js` after changing the canonical files.
 *
 * Pure functions only: no I/O, no logging. Answers are never written anywhere
 * by this module. Zod is passed in by the caller (`z`) so the same file works
 * in the Next.js client and the Express backend with their own zod install.
 */

const config = require('./questions.json');
const countries = require('./countries.json');

const TYPES = [
  'TXT', 'LNG', 'DATE', 'MY', 'NUM', 'DUR', 'AMT', 'YN',
  'SEL', 'CTRY', 'CHK', 'ADDR', 'TEL', 'EML', 'ACK', 'FILE',
];
const DURATION_UNITS = ['years', 'months', 'weeks', 'days'];
const DURATION_MAX = { years: 150, months: 1800, weeks: 7800, days: 54750 };
const REQUIRED_MSG = 'This question is required';
const COUNTRY_CODES = new Set(countries.map((c) => c.code));
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

function buildIndex(cfg) {
  const byId = new Map();
  const order = new Map();
  cfg.questions.forEach((q, i) => {
    byId.set(q.id, q);
    order.set(q.id, i);
  });
  return {
    byId,
    order,
    groups: new Map((cfg.groups || []).map((g) => [g.id, g])),
    sections: new Map(cfg.sections.map((s) => [s.id, s])),
  };
}

const indexCache = new WeakMap();
function indexOf(cfg) {
  let idx = indexCache.get(cfg);
  if (!idx) {
    idx = buildIndex(cfg);
    indexCache.set(cfg, idx);
  }
  return idx;
}

function getQuestion(cfg, id) {
  return indexOf(cfg).byId.get(id);
}

function getCountries() {
  return countries;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

/** Treats '', null, undefined, [] and empty objects as "not answered". */
function cleanEmpty(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.trim() === '' ? undefined : v;
  if (Array.isArray(v)) return v.length ? v : undefined;
  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) {
      if (UNSAFE_KEYS.has(k)) continue;
      const c = cleanEmpty(v[k]);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

function valueAt(input, path) {
  let cur = input;
  for (const key of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function isRealMonth(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function scopeGet(flat, entry, id) {
  if (entry && Object.prototype.hasOwnProperty.call(entry, id)) return entry[id];
  return flat[id];
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Is the repeating group open? A group with a gate is open when its Yes/No
 * question is shown and answered Yes. A group without a gate is always open.
 */
function groupGateOpen(cfg, group, flat) {
  if (!group) return false;
  if (!group.gate) return true;
  const gate = indexOf(cfg).byId.get(group.gate);
  return !!gate && isVisibleIn(cfg, gate, flat, null) && flat[group.gate] === true;
}

function evalCondition(cfg, c, flat, entry) {
  if (c.all) return c.all.every((x) => evalCondition(cfg, x, flat, entry));
  if (c.any) return c.any.some((x) => evalCondition(cfg, x, flat, entry));
  if (c.not) return !evalCondition(cfg, c.not, flat, entry);
  const target = indexOf(cfg).byId.get(c.q);
  // A condition on a hidden or unknown question is never met.
  if (!target || !isVisibleIn(cfg, target, flat, entry)) return false;
  const value = scopeGet(flat, entry, c.q);
  if ('eq' in c) return value === c.eq;
  if ('in' in c) return c.in.includes(value);
  return false;
}

function isVisibleIn(cfg, q, flat, entry) {
  if (q.group) {
    const g = indexOf(cfg).groups.get(q.group);
    if (!groupGateOpen(cfg, g, flat)) return false;
  }
  if (q.showWhen && !evalCondition(cfg, q.showWhen, flat, entry)) return false;
  return true;
}

/**
 * Is the question shown, given the answers so far? For a question inside a
 * repeating group pass the entry being edited as `entry`.
 */
function isVisible(cfg, questionId, answers, entry) {
  const q = getQuestion(cfg, questionId);
  if (!q) throw new Error(`Unknown question: ${questionId}`);
  return isVisibleIn(cfg, q, answers || {}, entry || null);
}

/**
 * Questions of a section the applicant should see. Members of a repeating
 * group are included when the group's gate is Yes; their own showWhen is
 * evaluated per entry with isVisible(..., entry).
 */
function getVisibleQuestions(cfg, sectionId, answers) {
  const flat = answers || {};
  const idx = indexOf(cfg);
  return cfg.questions.filter((q) => {
    if (q.section !== sectionId) return false;
    if (q.group) return groupGateOpen(cfg, idx.groups.get(q.group), flat);
    return isVisibleIn(cfg, q, flat, null);
  });
}

/**
 * Is the section shown at all? A section is hidden when none of its questions
 * is visible (for example 4A when 2.13 does not indicate a spouse or partner).
 * Its answers are pruned by pruneAnswers like any other hidden answer.
 */
function isSectionVisible(cfg, sectionId, answers) {
  if (!indexOf(cfg).sections.has(sectionId)) throw new Error(`Unknown section: ${sectionId}`);
  return getVisibleQuestions(cfg, sectionId, answers).length > 0;
}

/** The sections the applicant has to complete, in form order. */
function getVisibleSections(cfg, answers) {
  return cfg.sections.filter((s) => isSectionVisible(cfg, s.id, answers));
}

function resolveOptionsIn(cfg, q, flat, entry) {
  const o = q.options;
  if (Array.isArray(o)) return o;
  if (q.type === 'CTRY' || (o && o.from === 'countries')) {
    return countries.map((c) => ({ value: c.code, label: c.name }));
  }
  if (o && o.from === 'answers') {
    const idx = indexOf(cfg);
    const seen = new Set();
    const out = [];
    for (const id of o.questions) {
      const src = idx.byId.get(id);
      if (!src || !isVisibleIn(cfg, src, flat, entry)) continue;
      const v = scopeGet(flat, entry, id);
      if (typeof v === 'string' && v && !seen.has(v)) {
        seen.add(v);
        out.push({ value: v, label: v });
      }
    }
    return out;
  }
  return [];
}

/** Option list for a SEL/CHK/CTRY question given the answers so far. */
function resolveOptions(cfg, questionId, answers, entry) {
  const q = getQuestion(cfg, questionId);
  if (!q) throw new Error(`Unknown question: ${questionId}`);
  return resolveOptionsIn(cfg, q, answers || {}, entry || null);
}

/**
 * Drops answers to hidden or unknown questions across the whole application,
 * including whole repeating groups whose gate is no longer Yes.
 * Returns { answers, removed } where removed lists question and group ids.
 */
function pruneAnswers(cfg, answers) {
  const flat = answers || {};
  const idx = indexOf(cfg);
  const out = {};
  const removed = [];

  for (const q of cfg.questions) {
    if (q.group) continue;
    const has = flat[q.id] !== undefined;
    if (isVisibleIn(cfg, q, flat, null)) {
      if (has) out[q.id] = flat[q.id];
    } else if (has) {
      removed.push(q.id);
    }
  }

  for (const g of idx.groups.values()) {
    const has = flat[g.id] !== undefined;
    if (!has) continue;
    if (!groupGateOpen(cfg, g, flat)) {
      removed.push(g.id);
      continue;
    }
    const entries = Array.isArray(flat[g.id]) ? flat[g.id] : [];
    out[g.id] = entries.filter(isPlainObject).map((entry) => {
      const kept = {};
      for (const qid of g.questions) {
        const mq = idx.byId.get(qid);
        if (entry[qid] !== undefined && isVisibleIn(cfg, mq, flat, entry)) kept[qid] = entry[qid];
      }
      return kept;
    });
  }

  return { answers: out, removed };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Shape check for one answer. Cross-field and option checks run separately. */
function typeSchema(z, cfg, q) {
  const lim = cfg.limits || {};
  const rules = q.rules || {};
  const str = (max) =>
    z.string().trim().min(1, REQUIRED_MSG).max(max, `Must be ${max} characters or fewer`);

  switch (q.type) {
    case 'TXT':
      return str(rules.maxLen || lim.txtMax || 200);
    case 'LNG':
      return str(rules.maxLen || lim.lngMax || 5000);
    case 'DATE':
      return z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a full date')
        .refine(isRealDate, 'Enter a real date');
    case 'MY':
      return z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'Enter a month and year')
        .refine(isRealMonth, 'Enter a real month and year');
    case 'NUM':
      return z
        .number()
        .refine(Number.isInteger, 'Enter a whole number')
        .min(rules.min !== undefined ? rules.min : 0, 'Number is too small')
        .max(rules.max !== undefined ? rules.max : 1000, 'Number is too large');
    case 'DUR': {
      const mode = rules.durationMode || 'single';
      const units = rules.units || DURATION_UNITS;
      const shape = {};
      units.forEach((u) => {
        shape[u] = z.number().refine(Number.isInteger, 'Enter a whole number').min(0, 'Cannot be negative')
          .max(DURATION_MAX[u], 'Number is too large').optional();
      });
      return z
        .strictObject(shape)
        .refine(
          (v) => {
            const n = Object.keys(v).length;
            return mode === 'parts' ? n === units.length : n === 1;
          },
          mode === 'parts' ? `Enter ${units.join(' and ')}` : 'Enter a number and a unit'
        )
        .refine((v) => mode === 'parts' || Object.values(v).every((x) => x >= 1), 'Enter a number above zero')
        .refine(
          (v) => !(v.years !== undefined && v.months !== undefined && v.months > 11),
          'Months must be 11 or fewer when years are given'
        );
    }
    case 'AMT': {
      const currencies = rules.currencies || ['GBP'];
      return z.strictObject({
        amount: z
          .number()
          .min(0, 'Cannot be negative')
          .max(1e9, 'Amount is too large')
          .refine((a) => Math.abs(a * 100 - Math.round(a * 100)) < 1e-6, 'Use at most two decimal places'),
        currency: z.enum(currencies),
      });
    }
    case 'YN':
      return z.boolean();
    case 'CTRY':
      return z.string().min(1, REQUIRED_MSG).refine((c) => COUNTRY_CODES.has(c), 'Choose a country from the list');
    case 'SEL':
      return z.string().min(1, REQUIRED_MSG).max(254);
    case 'CHK':
      return z
        .array(z.string().min(1).max(254))
        .min(1, REQUIRED_MSG)
        .max(50)
        .refine((a) => new Set(a).size === a.length, 'Each choice can only be selected once');
    case 'ADDR':
      return z.strictObject({
        line1: str(100),
        line2: str(100).optional(),
        town: str(100),
        region: str(100).optional(),
        postcode: str(20).optional(),
        country: z.string().min(1, REQUIRED_MSG).refine((c) => COUNTRY_CODES.has(c), 'Choose a country from the list'),
      });
    case 'TEL':
      return z.strictObject({
        countryCode: z.string().trim().regex(/^\+[1-9]\d{0,3}$/, 'Enter a country code such as +44'),
        number: z
          .string()
          .trim()
          .regex(/^[0-9 ()\-]+$/, 'Use digits, spaces, brackets and hyphens only')
          .refine((n) => {
            const digits = n.replace(/\D/g, '').length;
            return digits >= 4 && digits <= 15;
          }, 'Enter a valid telephone number'),
      });
    case 'EML':
      return z
        .string()
        .trim()
        .min(1, REQUIRED_MSG)
        .max(254, 'Email address is too long')
        .toLowerCase()
        .pipe(z.email('Enter a valid email address'));
    case 'ACK':
      return z.boolean().refine((v) => v === true, 'You must tick this box to continue');
    default:
      throw new Error(`No answer schema for question type ${q.type}`);
  }
}

/** Option-list, `after` and `notFuture` checks. Returns [{ path, message }]. */
function relationalIssues(cfg, q, value, flat, entry, today) {
  const idx = indexOf(cfg);
  const rules = q.rules || {};
  const issues = [];

  if (q.type === 'SEL' || q.type === 'CHK') {
    const allowed = new Set(resolveOptionsIn(cfg, q, flat, entry).map((o) => o.value));
    const vals = Array.isArray(value) ? value : [value];
    if (!vals.every((v) => allowed.has(v))) issues.push({ path: [], message: 'Choose from the listed options' });
  }

  if (rules.after) {
    const refs = Array.isArray(rules.after) ? rules.after : [rules.after];
    for (const refId of refs) {
      const ref = idx.byId.get(refId);
      if (!ref || !isVisibleIn(cfg, ref, flat, entry)) continue;
      const other = scopeGet(flat, entry, refId);
      if (typeof other === 'string' && typeof value === 'string' && value <= other) {
        issues.push({ path: [], message: `Must be after the date in question ${ref.number}` });
      }
    }
  }

  if (rules.notFuture && typeof value === 'string') {
    const limit = q.type === 'MY' ? today.slice(0, 7) : today;
    if (value > limit) issues.push({ path: [], message: 'Cannot be in the future' });
  }

  return issues;
}

function addZodErrors(errors, baseKey, zerr, input) {
  for (const issue of zerr.issues) {
    const key = [baseKey, ...issue.path.map(String)].join('.');
    if (errors[key]) continue;
    if (valueAt(input, issue.path) === undefined) errors[key] = REQUIRED_MSG;
    else errors[key] = issue.code === 'invalid_type' ? 'Enter a valid answer' : issue.message;
  }
}

/**
 * Validate one section.
 *
 * `incoming` is the full new state of the section: any of the section's
 * questions that are missing from it are treated as unanswered. `existing` is
 * the application's current answers; the section's own keys in `existing` are
 * ignored, the rest are used for conditions and cross-section rules.
 *
 * Returns { success, data, errors, removed, unknownKeys }.
 *  - data: normalised answers for the visible questions of this section
 *    (trimmed, emails lower-cased). Persist it only when success is true.
 *  - errors: { [questionId or "questionId.field" or "groupId.index.questionId"]: message }
 *  - removed: ids of this section's questions/groups that are hidden and must
 *    be unset from the stored answers.
 *  - unknownKeys: keys sent that do not belong to the section.
 * Answer values are never included in error messages.
 */
function validateSection(z, cfg, sectionId, incoming, existing, opts) {
  const idx = indexOf(cfg);
  if (!idx.sections.has(sectionId)) throw new Error(`Unknown section: ${sectionId}`);

  const today = (opts && opts.today) || todayIso();
  const body = isPlainObject(incoming) ? incoming : {};
  const stored = isPlainObject(existing) ? existing : {};

  const topQs = cfg.questions.filter((q) => q.section === sectionId && !q.group);
  const groupsHere = (cfg.groups || []).filter((g) => g.section === sectionId);
  const sectionKeys = new Set([...topQs.map((q) => q.id), ...groupsHere.map((g) => g.id)]);

  const unknownKeys = Object.keys(body).filter((k) => !sectionKeys.has(k));

  const others = {};
  for (const k of Object.keys(stored)) if (!sectionKeys.has(k) && !UNSAFE_KEYS.has(k)) others[k] = stored[k];
  const cleaned = {};
  for (const k of sectionKeys) {
    const v = cleanEmpty(body[k]);
    if (v !== undefined) cleaned[k] = v;
  }
  const merged = Object.assign({}, others, cleaned);

  const errors = {};
  const data = {};
  const removed = [];

  const checkField = (q, raw, store, key) => {
    const res = typeSchema(z, cfg, q).safeParse(raw);
    if (res.success) store[q.id] = res.data;
    else addZodErrors(errors, key, res.error, raw);
  };

  // Pass 1: shape of each visible answer.
  for (const q of topQs) {
    if (!isVisibleIn(cfg, q, merged, null)) {
      if (cleaned[q.id] !== undefined || stored[q.id] !== undefined) removed.push(q.id);
      continue;
    }
    if (q.type === 'FILE') continue; // uploads are handled by the document endpoints
    if (cleaned[q.id] === undefined) {
      if (q.required) errors[q.id] = REQUIRED_MSG;
      continue;
    }
    checkField(q, cleaned[q.id], data, q.id);
  }

  for (const g of groupsHere) {
    if (!groupGateOpen(cfg, g, merged)) {
      if (cleaned[g.id] !== undefined || stored[g.id] !== undefined) removed.push(g.id);
      continue;
    }
    const raw = cleaned[g.id];
    const max = Math.min(g.max || Infinity, (cfg.limits && cfg.limits.groupMax) || Infinity);
    const min = g.min || 1;
    if (!Array.isArray(raw) || raw.length < min) {
      errors[g.id] = min === 1 ? 'Add at least one entry' : `Add at least ${min} entries`;
      continue;
    }
    if (raw.length > max) {
      errors[g.id] = `You can add up to ${max} entries`;
      continue;
    }
    data[g.id] = [];
    raw.forEach((rawEntry, i) => {
      const entryData = {};
      data[g.id].push(entryData);
      if (!isPlainObject(rawEntry)) {
        errors[`${g.id}.${i}`] = 'Enter a valid answer';
        return;
      }
      const entry = {};
      for (const k of Object.keys(rawEntry)) {
        if (UNSAFE_KEYS.has(k)) continue;
        if (!g.questions.includes(k)) {
          unknownKeys.push(`${g.id}.${i}.${k}`);
          continue;
        }
        const v = cleanEmpty(rawEntry[k]);
        if (v !== undefined) entry[k] = v;
      }
      for (const qid of g.questions) {
        const mq = idx.byId.get(qid);
        if (!isVisibleIn(cfg, mq, merged, entry)) continue;
        if (entry[qid] === undefined) {
          if (mq.required) errors[`${g.id}.${i}.${qid}`] = REQUIRED_MSG;
          continue;
        }
        checkField(mq, entry[qid], entryData, `${g.id}.${i}.${qid}`);
      }
    });
  }

  // Pass 2: options, countries, date ordering, using the normalised values.
  const merged2 = Object.assign({}, others, data);
  for (const q of topQs) {
    if (data[q.id] === undefined) continue;
    for (const issue of relationalIssues(cfg, q, data[q.id], merged2, null, today)) {
      const key = [q.id, ...issue.path].join('.');
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  for (const g of groupsHere) {
    if (!Array.isArray(data[g.id])) continue;
    data[g.id].forEach((entryData, i) => {
      for (const qid of g.questions) {
        if (entryData[qid] === undefined) continue;
        const mq = idx.byId.get(qid);
        for (const issue of relationalIssues(cfg, mq, entryData[qid], merged2, entryData, today)) {
          const key = [`${g.id}.${i}.${qid}`, ...issue.path].join('.');
          if (!errors[key]) errors[key] = issue.message;
        }
      }
    });
  }

  return {
    success: Object.keys(errors).length === 0 && unknownKeys.length === 0,
    data,
    errors,
    removed,
    unknownKeys,
  };
}

// ---------------------------------------------------------------------------
// Release gate and config check
// ---------------------------------------------------------------------------

/**
 * Sections that still carry a `tbc` flag on a question or group. A section
 * with any blocker must not be released to applicants.
 * Returns [{ sectionId, items: [{ id, number, tbc }] }].
 */
function getReleaseBlockers(cfg) {
  const bySection = new Map();
  const add = (sectionId, item) => {
    if (!bySection.has(sectionId)) bySection.set(sectionId, []);
    bySection.get(sectionId).push(item);
  };
  for (const g of cfg.groups || []) if (g.tbc) add(g.section, { id: g.id, number: null, tbc: g.tbc });
  for (const q of cfg.questions) if (q.tbc) add(q.section, { id: q.id, number: q.number, tbc: q.tbc });
  return cfg.sections
    .filter((s) => bySection.has(s.id))
    .map((s) => ({ sectionId: s.id, items: bySection.get(s.id) }));
}

function isSectionReleasable(cfg, sectionId) {
  return !getReleaseBlockers(cfg).some((b) => b.sectionId === sectionId);
}

/** Structural check of a config. Returns a list of problems (empty = valid). */
function validateConfig(cfg) {
  const errs = [];
  const err = (m) => errs.push(m);
  if (!cfg || typeof cfg !== 'object') return ['Config must be an object'];

  if (typeof cfg.version !== 'string' || !cfg.version) err('version must be a non-empty string');
  const lim = cfg.limits || {};
  for (const k of ['txtMax', 'lngMax', 'groupMax']) {
    if (!Number.isInteger(lim[k]) || lim[k] < 1) err(`limits.${k} must be a positive integer`);
  }
  if (!Array.isArray(cfg.parts) || !Array.isArray(cfg.sections) || !Array.isArray(cfg.questions)) {
    return errs.concat('parts, sections and questions must be arrays');
  }

  const partIds = new Set();
  for (const p of cfg.parts) {
    if (!p.id || !p.title) err(`Part needs id and title: ${JSON.stringify(p)}`);
    if (partIds.has(p.id)) err(`Duplicate part id ${p.id}`);
    partIds.add(p.id);
  }
  const sectionIds = new Set();
  for (const s of cfg.sections) {
    if (!s.id || !s.title) err(`Section needs id and title: ${s.id}`);
    if (sectionIds.has(s.id)) err(`Duplicate section id ${s.id}`);
    sectionIds.add(s.id);
    if (!partIds.has(s.part)) err(`Section ${s.id} refers to unknown part ${s.part}`);
  }

  const order = new Map();
  const byId = new Map();
  cfg.questions.forEach((q, i) => {
    if (byId.has(q.id)) err(`Duplicate question id ${q.id}`);
    byId.set(q.id, q);
    order.set(q.id, i);
  });
  const groups = new Map();
  for (const g of cfg.groups || []) {
    if (groups.has(g.id)) err(`Duplicate group id ${g.id}`);
    groups.set(g.id, g);
  }

  const checkCondition = (c, q, where) => {
    if (!c || typeof c !== 'object') return err(`${where}: condition must be an object`);
    const forms = ['all', 'any', 'not', 'q'].filter((k) => k in c);
    if (forms.length !== 1) return err(`${where}: condition needs exactly one of all, any, not, q`);
    if (c.all || c.any) {
      const list = c.all || c.any;
      if (!Array.isArray(list) || !list.length) return err(`${where}: all/any needs a non-empty array`);
      return list.forEach((x) => checkCondition(x, q, where));
    }
    if (c.not) return checkCondition(c.not, q, where);
    if (!('eq' in c) === !('in' in c)) return err(`${where}: condition on ${c.q} needs exactly one of eq, in`);
    if ('in' in c && !Array.isArray(c.in)) err(`${where}: "in" must be an array`);
    if (!byId.has(c.q)) return err(`${where}: refers to unknown question ${c.q}`);
    if (order.get(c.q) >= order.get(q.id)) err(`${where}: must refer to an earlier question than itself (${c.q})`);
  };

  for (const q of cfg.questions) {
    const w = q.id;
    if (!/^q\d+_\d+[a-z]?$/.test(q.id)) err(`${w}: id must look like q2_3 or q2_3a`);
    else if (q.number !== q.id.slice(1).replace('_', '.')) err(`${w}: number ${q.number} does not match id`);
    if (!sectionIds.has(q.section)) err(`${w}: unknown section ${q.section}`);
    if (!q.label) err(`${w}: label is required`);
    if (!TYPES.includes(q.type)) err(`${w}: unknown type ${q.type}`);
    if (typeof q.required !== 'boolean') err(`${w}: required must be true or false`);
    if (q.sensitive !== undefined && typeof q.sensitive !== 'boolean') err(`${w}: sensitive must be a boolean`);
    if (q.tbc !== undefined && (typeof q.tbc !== 'string' || !q.tbc)) err(`${w}: tbc must be a non-empty string`);

    const o = q.options;
    if (q.type === 'SEL' || q.type === 'CHK') {
      if (Array.isArray(o)) {
        if (!o.length) err(`${w}: options is empty`);
        const seen = new Set();
        for (const opt of o) {
          if (!opt.value || !opt.label) err(`${w}: every option needs value and label`);
          if (seen.has(opt.value)) err(`${w}: duplicate option value ${opt.value}`);
          seen.add(opt.value);
        }
      } else if (o && o.from === 'countries') {
        // ok
      } else if (o && o.from === 'answers') {
        if (!Array.isArray(o.questions) || !o.questions.length) err(`${w}: options.questions is required`);
        else for (const id of o.questions) {
          if (!byId.has(id)) err(`${w}: options refer to unknown question ${id}`);
          else if (order.get(id) >= order.get(q.id)) err(`${w}: options must come from earlier questions (${id})`);
        }
      } else {
        err(`${w}: ${q.type} needs options`);
      }
    } else if (o !== undefined && q.type !== 'CTRY') {
      err(`${w}: options are only allowed on SEL, CHK and CTRY`);
    }

    if (q.showWhen) checkCondition(q.showWhen, q, `${w}.showWhen`);

    const r = q.rules || {};
    if (r.after !== undefined) {
      if (q.type !== 'DATE' && q.type !== 'MY') err(`${w}: rules.after needs a DATE or MY question`);
      for (const id of Array.isArray(r.after) ? r.after : [r.after]) {
        const ref = byId.get(id);
        if (!ref) err(`${w}: rules.after refers to unknown question ${id}`);
        else {
          if (ref.type !== q.type) err(`${w}: rules.after ${id} must have the same type (${q.type})`);
          if (order.get(id) >= order.get(q.id)) err(`${w}: rules.after must refer to an earlier question (${id})`);
        }
      }
    }
    if (r.notFuture !== undefined && q.type !== 'DATE' && q.type !== 'MY') err(`${w}: rules.notFuture needs a DATE or MY question`);
    if (r.units !== undefined) {
      if (q.type !== 'DUR') err(`${w}: rules.units is only for DUR`);
      else if (!Array.isArray(r.units) || !r.units.length || !r.units.every((u) => DURATION_UNITS.includes(u))) {
        err(`${w}: rules.units must be a list of ${DURATION_UNITS.join(', ')}`);
      }
    }
    if (r.durationMode !== undefined && !['single', 'parts'].includes(r.durationMode)) err(`${w}: rules.durationMode must be single or parts`);

    if (q.group !== undefined) {
      const g = groups.get(q.group);
      if (!g) err(`${w}: unknown group ${q.group}`);
      else {
        if (!g.questions.includes(q.id)) err(`${w}: group ${g.id} does not list it as a member`);
        if (g.section !== q.section) err(`${w}: must be in the same section as group ${g.id}`);
      }
    }
  }

  for (const g of groups.values()) {
    const w = `group ${g.id}`;
    if (!sectionIds.has(g.section)) err(`${w}: unknown section ${g.section}`);
    if (!g.entryLabel) err(`${w}: entryLabel is required`);
    if (!Number.isInteger(g.max) || g.max < 1 || g.max > (lim.groupMax || 0)) err(`${w}: max must be an integer from 1 to limits.groupMax`);
    if (!Array.isArray(g.questions) || !g.questions.length) err(`${w}: needs member questions`);
    if (g.tbc !== undefined && (typeof g.tbc !== 'string' || !g.tbc)) err(`${w}: tbc must be a non-empty string`);
    if (g.min !== undefined && (!Number.isInteger(g.min) || g.min < 1 || g.min > g.max)) err(`${w}: min must be an integer from 1 to max`);
    // A group without a gate is always open. Count-based groups are not supported yet.
    const gate = g.gate === undefined ? undefined : byId.get(g.gate);
    if (g.gate !== undefined && !gate) err(`${w}: unknown gate ${g.gate}`);
    else if (gate) {
      if (gate.type !== 'YN') err(`${w}: gate ${g.gate} must be a YN question`);
      if (gate.section !== g.section) err(`${w}: gate must be in the same section`);
      if (gate.group) err(`${w}: gate cannot be a group member`);
    }
    for (const id of g.questions || []) {
      const m = byId.get(id);
      if (!m) err(`${w}: unknown member ${id}`);
      else {
        if (m.group !== g.id) err(`${w}: member ${id} does not point back to the group`);
        if (gate && order.get(gate.id) >= order.get(id)) err(`${w}: gate must come before member ${id}`);
      }
    }
  }

  return errs;
}

module.exports = {
  config,
  getCountries,
  getQuestion,
  isVisible,
  getVisibleQuestions,
  isSectionVisible,
  getVisibleSections,
  resolveOptions,
  pruneAnswers,
  validateSection,
  getReleaseBlockers,
  isSectionReleasable,
  validateConfig,
};
