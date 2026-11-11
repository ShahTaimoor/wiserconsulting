/**
 * The rules of an admin correction (step 8f), as pure functions: no database, no logging, no clock but the
 * `today` it is given. The service puts the stored answers and the config the application was submitted under in,
 * and gets back either what must be fixed (section ids and counts, never a value) or the new answers and the list
 * of what changed.
 *
 * The same shared engine that checks the applicant's own save checks an admin's change:
 *  - every section the change touches is validated as a whole, exactly like a normal save of that section;
 *  - answers that the change hides are pruned (including whole repeating groups);
 *  - a section the change makes newly necessary, or a rule it newly breaks in a section it did not touch, is
 *    refused, so the questions that become required must be answered in the same request.
 */

const engine = require("../shared/tourist-visa/engine");
const { describeValue, correctionKey } = require("../shared/tourist-visa/view");
const { AppError } = require("../middleware/errorHandler");

const MAX_CHANGES = 30;
const MIN_REASON = 10;
const MAX_REASON = 1000;
const MAX_INDEX = 99;

const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";
const fail = (status, code, message) => new AppError(message, status, code);
const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** Same value? (key order does not matter). */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/**
 * Things an admin can never change through this route, by the name a request might use for them, each with its own
 * code so the refusal is clear. (Questions of the Part 9 ticks are refused by type, below.)
 */
const NOT_EDITABLE = new Map([
  ["status", ["NOT_EDITABLE_STATUS", "The status cannot be changed here. Use the status buttons."]],
  ["reference", ["NOT_EDITABLE_REFERENCE", "The reference cannot be changed."]],
  ["submittedAt", ["NOT_EDITABLE_SUBMITTED_AT", "The date of submission cannot be changed."]],
  ["documents", ["NOT_EDITABLE_DOCUMENTS", "Documents cannot be changed here."]],
  ["applicant", ["NOT_EDITABLE_IDENTITY", "Who the application belongs to cannot be changed."]],
  ["applicantId", ["NOT_EDITABLE_IDENTITY", "Who the application belongs to cannot be changed."]],
  ["user", ["NOT_EDITABLE_IDENTITY", "Who the application belongs to cannot be changed."]],
  ["userId", ["NOT_EDITABLE_IDENTITY", "Who the application belongs to cannot be changed."]],
  ["declarations", ["NOT_EDITABLE_DECLARATION", "The applicant's declarations cannot be changed."]],
  ["declarations.submit", ["NOT_EDITABLE_DECLARATION", "The applicant's declarations cannot be changed."]],
  ["declaration", ["NOT_EDITABLE_DECLARATION", "The applicant's declarations cannot be changed."]],
]);

/** The refusal for a reserved name, or null when the name is not one of them. */
function notEditable(name) {
  const found = typeof name === "string" ? NOT_EDITABLE.get(name) : undefined;
  return found ? fail(400, found[0], found[1]) : null;
}

/** Lookups over a config. */
function indexOf(cfg) {
  const questions = new Map(cfg.questions.map((q) => [q.id, q]));
  const groups = new Map((cfg.groups || []).map((g) => [g.id, g]));
  const groupOfMember = new Map();
  for (const g of groups.values()) for (const id of g.questions) groupOfMember.set(id, g);
  const sectionIndex = new Map(cfg.sections.map((s, i) => [s.id, i]));
  return { questions, groups, groupOfMember, sectionIndex };
}

/** The answer keys that belong to a section: its questions (not files) and its repeating groups. */
function sectionKeys(cfg, sectionId) {
  return [
    ...cfg.questions.filter((q) => q.section === sectionId && !q.group && q.type !== "FILE").map((q) => q.id),
    ...(cfg.groups || []).filter((g) => g.section === sectionId).map((g) => g.id),
  ];
}

const slice = (answers, keys) => {
  const out = {};
  for (const key of keys) if (answers[key] !== undefined) out[key] = answers[key];
  return out;
};

// ---------------------------------------------------------------------------
// Reading the request
// ---------------------------------------------------------------------------

/** The reason: text of 10 to 1000 characters once trimmed. Returns the trimmed text. */
function checkReason(reason) {
  if (typeof reason !== "string") throw fail(400, "INVALID_REASON", "Give the reason for the change.");
  const text = reason.trim();
  if (text.length < MIN_REASON) throw fail(400, "INVALID_REASON", `The reason must be at least ${MIN_REASON} characters.`);
  if (text.length > MAX_REASON) throw fail(400, "INVALID_REASON", `The reason must be at most ${MAX_REASON} characters.`);
  return text;
}

/**
 * Checks the list of changes and gives each a definite meaning:
 *   { kind: "field", question, key }                  one answer
 *   { kind: "member", question, group, index, key }   one answer inside a repeating group's entry
 *   { kind: "group", group, key }                     a whole repeating group (entries added or removed)
 * `value` null clears an answer. Nothing is applied here.
 */
function parseChanges(cfg, changes) {
  const idx = indexOf(cfg);
  if (!Array.isArray(changes) || changes.length === 0) throw fail(400, "INVALID_REQUEST", "Send at least one change.");
  if (changes.length > MAX_CHANGES) throw fail(400, "TOO_MANY_CHANGES", `At most ${MAX_CHANGES} changes can be sent at once.`);

  const parsed = [];
  const seen = new Set();
  const groupsReplaced = new Set();
  const groupsEdited = new Set();
  for (const change of changes) {
    if (!isPlainObject(change) || Object.keys(change).some((k) => !["questionId", "index", "value"].includes(k)) || !Object.hasOwn(change, "value")) {
      throw fail(400, "INVALID_CHANGE", "Each change must be { questionId, index?, value }.");
    }
    const { questionId, index, value } = change;
    if (typeof questionId !== "string" || questionId.length === 0 || questionId.length > 100) throw fail(400, "INVALID_CHANGE", "Each change needs a question id.");
    const refusal = notEditable(questionId);
    if (refusal) throw refusal;
    if (index !== undefined && (!Number.isInteger(index) || index < 0 || index > MAX_INDEX)) throw fail(400, "INVALID_CHANGE", "The entry number is not valid.");

    const question = idx.questions.get(questionId);
    const group = idx.groups.get(questionId);
    if (!question && !group) throw fail(400, "UNKNOWN_QUESTION", "That question does not exist.");

    let item;
    if (group) {
      if (index !== undefined) throw fail(400, "INVALID_CHANGE", "A repeating group is replaced as a whole, without an entry number.");
      if (value !== null && (!Array.isArray(value) || value.length > MAX_INDEX + 1 || !value.every(isPlainObject))) throw fail(400, "INVALID_CHANGE", "The entries of a repeating group must be a list of entries.");
      item = { kind: "group", group, value, key: group.id, sectionId: group.section };
      groupsReplaced.add(group.id);
    } else {
      if (question.type === "ACK") throw fail(400, "NOT_EDITABLE_DECLARATION", "The applicant's declarations cannot be changed.");
      if (question.type === "FILE") throw fail(400, "NOT_EDITABLE_DOCUMENTS", "Documents cannot be changed here.");
      const memberOf = idx.groupOfMember.get(question.id);
      if (memberOf) {
        if (index === undefined) throw fail(400, "INVALID_CHANGE", "An answer inside a repeating group needs the entry number.");
        item = { kind: "member", question, group: memberOf, index, value, key: correctionKey(question.id, index), sectionId: question.section };
        groupsEdited.add(memberOf.id);
      } else {
        if (index !== undefined) throw fail(400, "INVALID_CHANGE", "This question is not inside a repeating group.");
        item = { kind: "field", question, value, key: question.id, sectionId: question.section };
      }
    }
    if (seen.has(item.key)) throw fail(400, "DUPLICATE_CHANGE", "The same answer is changed twice.");
    seen.add(item.key);
    parsed.push(item);
  }
  for (const id of groupsReplaced) if (groupsEdited.has(id)) throw fail(400, "DUPLICATE_CHANGE", "A repeating group is changed twice.");
  return parsed;
}

/** The answers with the changes applied. Not validated, not pruned. */
function applyChanges(existing, parsed) {
  const candidate = clone(existing) || {};
  for (const change of parsed) {
    if (change.kind === "field") {
      if (change.value === null) delete candidate[change.question.id];
      else candidate[change.question.id] = clone(change.value);
    } else if (change.kind === "group") {
      if (change.value === null) delete candidate[change.group.id];
      else candidate[change.group.id] = clone(change.value);
    } else {
      const entries = Array.isArray(candidate[change.group.id]) ? candidate[change.group.id].map((e) => ({ ...e })) : [];
      if (change.index > entries.length) throw fail(400, "INVALID_CHANGE", "Entries must be added one after the other.");
      if (change.index === entries.length) entries.push({});
      if (change.value === null) delete entries[change.index][change.question.id];
      else entries[change.index][change.question.id] = clone(change.value);
      candidate[change.group.id] = entries;
    }
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Checking the result
// ---------------------------------------------------------------------------

/**
 * Every stored answer as { key -> { sectionId, questionId, index?, value } }, one per answer, and the entry count of
 * each repeating group.
 */
function flatten(cfg, answers) {
  const idx = indexOf(cfg);
  const map = new Map();
  for (const q of cfg.questions) {
    if (q.group || q.type === "FILE" || answers[q.id] === undefined) continue;
    map.set(q.id, { sectionId: q.section, questionId: q.id, value: answers[q.id] });
  }
  const counts = new Map();
  for (const g of idx.groups.values()) {
    if (answers[g.id] === undefined) continue;
    const entries = Array.isArray(answers[g.id]) ? answers[g.id] : [];
    counts.set(g.id, entries.length);
    entries.forEach((entry, i) => {
      if (!isPlainObject(entry)) return;
      for (const memberId of g.questions) {
        if (entry[memberId] !== undefined) map.set(correctionKey(memberId, i), { sectionId: g.section, questionId: memberId, index: i, value: entry[memberId] });
      }
    });
  }
  return { map, counts };
}

/**
 * Runs the change against the stored answers. Throws nothing for an answer that does not pass: it returns
 *   { ok: false, sections: [{ id, problems }], errors: { "<engine key>": "<fixed message>" } }
 * (ids, counts and the engine's own fixed messages: never a value), or
 *   { ok: true, answers, items, sections }
 * where `answers` is the whole new set (hidden answers pruned), `items` lists what changed (see below), and
 * `sections` the sections the request touched.
 *
 * An item: { sectionId, questionId, index?, kind: "edited" | "pruned" | "structure", old?, new? } in form order.
 * For "structure" (a repeating group got more or fewer entries) old and new are the entry counts.
 */
function evaluate({ z, cfg, existing, parsed, today }) {
  const idx = indexOf(cfg);
  const opts = today ? { today } : undefined;
  const before = isPlainObject(existing) ? existing : {};
  const candidate = applyChanges(before, parsed);

  const touched = [...new Set(parsed.map((c) => c.sectionId))].sort((a, b) => idx.sectionIndex.get(a) - idx.sectionIndex.get(b));
  const problems = new Map(); // section id -> count
  const errors = {};

  // 1. Every touched section, as a whole, like a normal save.
  const stage = { ...candidate };
  for (const sectionId of touched) {
    const keys = sectionKeys(cfg, sectionId);
    const result = engine.validateSection(z, cfg, sectionId, slice(candidate, keys), candidate, opts);
    const count = Object.keys(result.errors).length + result.unknownKeys.length;
    if (count > 0) {
      problems.set(sectionId, count);
      Object.assign(errors, result.errors);
      continue;
    }
    for (const key of keys) delete stage[key];
    Object.assign(stage, result.data);
  }

  // 2. What the change hides is removed from the whole application.
  const { answers: after } = engine.pruneAnswers(cfg, stage);

  // 3. A section the change did not touch must not have got worse: a newly required question that was not answered in
  //    this request, or a rule the change newly breaks. A section that already had problems before keeps them.
  for (const section of engine.getVisibleSections(cfg, after)) {
    if (touched.includes(section.id) || engine.isFilesOnlySection(cfg, section.id)) continue;
    const keys = sectionKeys(cfg, section.id);
    const now = engine.validateSection(z, cfg, section.id, slice(after, keys), after, opts);
    const was = engine.validateSection(z, cfg, section.id, slice(before, keys), before, opts);
    const fresh = Object.keys(now.errors).filter((key) => !(key in was.errors));
    const count = fresh.length + now.unknownKeys.length;
    if (count > 0) {
      problems.set(section.id, count);
      for (const key of fresh) errors[key] = now.errors[key];
    }
  }

  if (problems.size > 0) {
    const sections = cfg.sections.filter((s) => problems.has(s.id)).map((s) => ({ id: s.id, problems: problems.get(s.id) }));
    return { ok: false, sections, errors };
  }

  return { ok: true, answers: after, items: diff(cfg, before, after, parsed), sections: touched };
}

/** What changed between two sets of answers, in form order. See evaluate. */
function diff(cfg, before, after, parsed) {
  const idx = indexOf(cfg);
  const a = flatten(cfg, before);
  const b = flatten(cfg, after);
  const asked = new Set(parsed.map((c) => c.key));
  const replaced = new Set(parsed.filter((c) => c.kind === "group").map((c) => c.group.id));

  const items = [];
  for (const key of new Set([...a.map.keys(), ...b.map.keys()])) {
    const was = a.map.get(key);
    const now = b.map.get(key);
    if (was && now && stable(was.value) === stable(now.value)) continue;
    const ref = now || was;
    const group = idx.groupOfMember.get(ref.questionId);
    const explicit = asked.has(key) || (group !== undefined && replaced.has(group.id));
    const item = { sectionId: ref.sectionId, questionId: ref.questionId, kind: now === undefined && !explicit ? "pruned" : "edited" };
    if (ref.index !== undefined) item.index = ref.index;
    if (was) item.old = clone(was.value);
    if (now) item.new = clone(now.value);
    items.push(item);
  }
  for (const group of idx.groups.values()) {
    const was = a.counts.get(group.id);
    const now = b.counts.get(group.id);
    if (was === now) continue;
    // A group that is only opened or closed by a gate is not a structure change of its own: its entries are listed.
    if (was !== undefined && now !== undefined) items.push({ sectionId: group.section, questionId: group.id, kind: "structure", old: was, new: now });
  }

  const rank = (item) => {
    const q = idx.questions.get(item.questionId);
    const g = idx.groups.get(item.questionId);
    const position = q ? cfg.questions.indexOf(q) : cfg.questions.findIndex((x) => x.group === g.id);
    return [idx.sectionIndex.get(item.sectionId), position, item.index ?? -1, item.kind === "structure" ? 0 : 1];
  };
  return items.sort((x, y) => {
    const rx = rank(x);
    const ry = rank(y);
    for (let i = 0; i < rx.length; i += 1) if (rx[i] !== ry[i]) return rx[i] - ry[i];
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Showing it
// ---------------------------------------------------------------------------

const entryCountText = (n) => (n === undefined ? "No entries" : `${n} ${n === 1 ? "entry" : "entries"}`);

/** Was the question shown (asked) under these answers? An entry that did not exist yet was not. */
function wasShown(cfg, item, answers) {
  if (item.kind === "structure") return true;
  try {
    const group = indexOf(cfg).groupOfMember.get(item.questionId);
    if (!group) return engine.isVisible(cfg, item.questionId, answers);
    const entries = Array.isArray(answers[group.id]) ? answers[group.id] : [];
    const entry = entries[item.index];
    return isPlainObject(entry) && engine.isVisible(cfg, item.questionId, answers, entry);
  } catch {
    return true;
  }
}

/**
 * The words for one item: its place in the form, its label, and its old and new value as the review shows them.
 * `history` is for an item read back from a change record, where what was asked at the time is no longer known.
 */
function describeItem(cfg, item, oldAnswers, newAnswers, { history = false } = {}) {
  const idx = indexOf(cfg);
  const section = cfg.sections.find((s) => s.id === item.sectionId);
  const base = { sectionId: item.sectionId, sectionTitle: section ? section.title : "", questionId: item.questionId, kind: item.kind };
  if (item.index !== undefined) base.index = item.index;

  if (item.kind === "structure") {
    const group = idx.groups.get(item.questionId);
    return { ...base, number: null, label: `${group.entryLabel} details`, old: entryCountText(item.old), new: entryCountText(item.new) };
  }

  const question = idx.questions.get(item.questionId);
  const group = idx.groupOfMember.get(item.questionId);
  const label = group && item.index !== undefined ? `${group.entryLabel} ${item.index + 1}: ${question.label}` : question.label;
  const entryOf = (answers) => (group && item.index !== undefined && Array.isArray(answers[group.id]) && isPlainObject(answers[group.id][item.index]) ? answers[group.id][item.index] : null);
  const show = (value, answers) => describeValue(cfg, question, value, answers, entryOf(answers));

  // An answer in an entry that did not exist yet is part of a new entry, not a question that became necessary. But when
  // the whole group was closed before (its Yes/No was No), its questions were not asked, so they have just become necessary.
  const entryExisted = history || !group || item.index === undefined || !Array.isArray(oldAnswers[group.id]) || isPlainObject(oldAnswers[group.id][item.index]);
  const shown = history || (entryExisted && wasShown(cfg, item, oldAnswers));

  const out = { ...base, number: question.number, label };
  if (item.old !== undefined) out.old = show(item.old, oldAnswers);
  else if (!entryExisted) out.old = "New entry";
  else out.old = shown ? "Not answered" : "Not asked before";
  if (item.kind === "pruned") out.new = "Removed";
  else out.new = item.new === undefined ? "Cleared" : show(item.new, newAnswers);
  out.newlyAsked = entryExisted && item.old === undefined && !shown;
  out.required = Boolean(question.required);
  return out;
}

/**
 * The preview of a change for the admin, using the review's own wording:
 *   changes   each answer set or cleared: { sectionId, sectionTitle, questionId, index?, number, label, old, new }
 *   removed   answers removed because the change hides them: { ..., old }
 *   required  questions that the change makes necessary and that the request answered: { ..., new }
 */
function buildPreview(cfg, oldAnswers, newAnswers, items) {
  const described = items.map((item) => describeItem(cfg, item, oldAnswers, newAnswers));
  const changes = [];
  const removed = [];
  const required = [];
  for (const d of described) {
    const view = { sectionId: d.sectionId, sectionTitle: d.sectionTitle, questionId: d.questionId, ...(d.index !== undefined ? { index: d.index } : {}), number: d.number, label: d.label };
    if (d.kind === "pruned") removed.push({ ...view, old: d.old });
    else if (d.newlyAsked && d.required && d.kind === "edited") required.push({ ...view, new: d.new });
    else changes.push({ ...view, old: d.old, new: d.new });
  }
  return { changes, removed, required };
}

/**
 * The latest correction time of every answer a team member corrected: { correctionKey -> Date }.
 * `records` are change records, oldest first, with items { questionId, index?, kind } (only these fields are used,
 * so no value is needed). Pruned answers are not marked, and an entry's marks are dropped when its group gets more
 * or fewer entries (the numbers shifted), the group itself being marked instead.
 */
function correctionsOf(cfg, records) {
  const idx = indexOf(cfg);
  const marks = {};
  for (const record of records) {
    for (const item of record.changes || []) {
      if (item.kind === "pruned") continue;
      if (item.kind === "structure") {
        const group = idx.groups.get(item.questionId);
        if (group) for (const memberId of group.questions) for (const key of Object.keys(marks)) if (key.startsWith(`${memberId}[`)) delete marks[key];
        marks[item.questionId] = record.at;
        continue;
      }
      marks[correctionKey(item.questionId, item.index)] = record.at;
    }
  }
  return marks;
}

module.exports = {
  MAX_CHANGES,
  MIN_REASON,
  MAX_REASON,
  stable,
  notEditable,
  sectionKeys,
  checkReason,
  parseChanges,
  applyChanges,
  evaluate,
  diff,
  flatten,
  buildPreview,
  describeItem,
  correctionsOf,
};
