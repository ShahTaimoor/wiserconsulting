/**
 * Pure logic behind the Tourist Visa section form: which questions to render, the
 * starting values, the payload to send, how server errors map to fields, and whether
 * anything changed since the last save.
 *
 * No React, no storage, no logging: answers pass through these functions and nowhere
 * else. They take the config as an argument and use the shared engine for visibility,
 * so what the form shows is decided by the same rules as the server.
 *
 * The engine is imported by its file name (engine.js) so `node --test` can load this
 * file for the unit tests; Next.js and TypeScript resolve it the same way.
 */

import { isSectionVisible, isVisible, resolveOptions } from "../shared/tourist-visa/engine.js";
import type { Answers, GroupEntry, Question, RepeatGroup, TouristVisaConfig } from "../shared/tourist-visa/engine.js";

export type FormValues = Record<string, unknown>;

export type RenderItem =
  | { kind: "question"; question: Question }
  | { kind: "group"; group: RepeatGroup; members: Question[] };

export interface ErrorItem {
  /** The key as the server sent it, e.g. "q2_24.line1". */
  key: string;
  message: string;
  /** What to call the field in the error summary. */
  label: string;
  /** DOM id of the control to focus. */
  targetId: string;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  Object.prototype.toString.call(v) === "[object Object]";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// The engine types answers precisely; the form holds them as unknown until they are validated.
const asAnswers = (value: Record<string, unknown>) => value as Answers;
const asEntry = (value: Record<string, unknown>) => value as GroupEntry;

// ---------------------------------------------------------------------------
// What to render
// ---------------------------------------------------------------------------

/** Answer keys that belong to a section: its questions and its repeating groups. */
export function sectionKeys(cfg: TouristVisaConfig, sectionId: string): string[] {
  return [
    ...cfg.questions.filter((q) => q.section === sectionId && !q.group).map((q) => q.id),
    ...cfg.groups.filter((g) => g.section === sectionId).map((g) => g.id),
  ];
}

/**
 * The section's content in form order. A repeating group appears once, where its
 * first member is in the config (right after its Yes/No question).
 */
export function sectionItems(cfg: TouristVisaConfig, sectionId: string): RenderItem[] {
  const items: RenderItem[] = [];
  const placed = new Set<string>();
  for (const question of cfg.questions) {
    if (question.section !== sectionId) continue;
    if (!question.group) {
      items.push({ kind: "question", question });
      continue;
    }
    if (placed.has(question.group)) continue;
    const group = cfg.groups.find((g) => g.id === question.group);
    if (!group) continue;
    placed.add(group.id);
    const members = group.questions
      .map((id) => cfg.questions.find((q) => q.id === id))
      .filter((q): q is Question => q !== undefined);
    items.push({ kind: "group", group, members });
  }
  return items;
}

/**
 * The section after this one. When `answers` are given, sections that do not apply
 * (none of their questions is visible, such as 4A without a partner) are skipped.
 */
export function nextSectionId(cfg: TouristVisaConfig, sectionId: string, answers?: Record<string, unknown>): string | null {
  const index = cfg.sections.findIndex((s) => s.id === sectionId);
  if (index < 0) return null;
  for (let i = index + 1; i < cfg.sections.length; i += 1) {
    if (!answers || isSectionVisible(cfg, cfg.sections[i].id, asAnswers(answers))) return cfg.sections[i].id;
  }
  return null;
}

/** The section before this one, skipping sections that do not apply when `answers` are given. */
export function previousSectionId(cfg: TouristVisaConfig, sectionId: string, answers?: Record<string, unknown>): string | null {
  const index = cfg.sections.findIndex((s) => s.id === sectionId);
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!answers || isSectionVisible(cfg, cfg.sections[i].id, asAnswers(answers))) return cfg.sections[i].id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * Treats '', whitespace-only strings, null, undefined, NaN, [] and empty objects as
 * "not answered" and drops them, the same rule the server applies. Real values
 * (including false and 0) are kept as they are.
 */
export function cleanValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (typeof value === "number") return Number.isNaN(value) ? undefined : value;
  if (Array.isArray(value)) return value.length > 0 ? value : undefined;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (UNSAFE_KEYS.has(key)) continue;
      const cleaned = cleanValue(value[key]);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/**
 * Starting values for a section: the saved answers, a copy so editing never touches
 * the context's copy. A question with a prefill hint takes the account value only
 * when nothing is saved for it. A group that is open (its Yes/No is Yes, or it has no Yes/No
 * question) always has at least its minimum number of entries to fill in.
 */
export function initialValues(
  cfg: TouristVisaConfig,
  sectionId: string,
  saved: Record<string, unknown>,
  account: { email?: string } = {}
): FormValues {
  const values: FormValues = {};
  for (const key of sectionKeys(cfg, sectionId)) {
    if (saved[key] !== undefined) values[key] = clone(saved[key]);
  }
  for (const question of cfg.questions) {
    if (question.section !== sectionId || question.group) continue;
    if (values[question.id] === undefined && question.prefill === "account.email" && account.email) {
      values[question.id] = account.email;
    }
  }
  for (const group of cfg.groups) {
    if (group.section !== sectionId) continue;
    const entries = values[group.id];
    const open = group.gate === undefined || values[group.gate] === true;
    if (open && !(Array.isArray(entries) && entries.length > 0)) {
      values[group.id] = Array.from({ length: group.min ?? 1 }, () => ({}));
    }
  }
  return values;
}

/** The whole application's answers as the engine should see them: other sections as saved, this one as edited. */
export function mergedAnswers(
  cfg: TouristVisaConfig,
  sectionId: string,
  saved: Record<string, unknown>,
  values: FormValues
): Record<string, unknown> {
  const own = new Set(sectionKeys(cfg, sectionId));
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(saved)) if (!own.has(key)) merged[key] = value;
  for (const key of own) {
    const cleaned = cleanValue(values[key]);
    if (cleaned !== undefined) merged[key] = cleaned;
  }
  return merged;
}

/** Whether a repeating group is open: its Yes/No question is shown and answered Yes, or it has no Yes/No question. */
export function isGroupOpen(cfg: TouristVisaConfig, group: RepeatGroup, merged: Record<string, unknown>): boolean {
  if (group.gate === undefined) return true;
  return merged[group.gate] === true && isVisible(cfg, group.gate, asAnswers(merged));
}

/** A choice answer is only valid while it is one of the options currently offered. */
function keepOffered(question: Question, value: unknown, offered: string[]): unknown {
  if (question.type === "CHK") {
    const kept = Array.isArray(value) ? value.filter((v) => typeof v === "string" && offered.includes(v)) : [];
    return kept.length > 0 ? kept : undefined;
  }
  if (question.type === "SEL" || question.type === "CTRY") {
    return typeof value === "string" && offered.includes(value) ? value : undefined;
  }
  return value;
}

/**
 * The request body for "Save and continue": the complete state of the section.
 * Hidden questions and empty answers are left out, so the server can tell what is
 * unanswered. A choice that is no longer on offer (for example an email address that
 * was edited after it was picked in 2.9) is left out too, so it shows as unanswered
 * and not as a confusing "not in the list". Repeating-group entries keep their
 * position, blank ones included, so server errors line up with what is on screen.
 * File questions are skipped; documents have their own step.
 */
export function buildPayload(
  cfg: TouristVisaConfig,
  sectionId: string,
  values: FormValues,
  saved: Record<string, unknown>
): { answers: Record<string, unknown> } {
  const merged = mergedAnswers(cfg, sectionId, saved, values);
  const answers: Record<string, unknown> = {};

  for (const item of sectionItems(cfg, sectionId)) {
    if (item.kind === "question") {
      const { question } = item;
      if (question.type === "FILE" || !isVisible(cfg, question.id, asAnswers(merged))) continue;
      const offered = resolveOptions(cfg, question.id, asAnswers(merged)).map((o) => o.value);
      const value = keepOffered(question, cleanValue(values[question.id]), offered);
      if (value !== undefined) answers[question.id] = value;
      continue;
    }

    if (!isGroupOpen(cfg, item.group, merged)) continue;
    const raw = values[item.group.id];
    const entries = Array.isArray(raw) ? raw : [];
    answers[item.group.id] = entries.map((rawEntry) => {
      const entry = isPlainObject(rawEntry) ? rawEntry : {};
      const cleanedEntry: Record<string, unknown> = {};
      for (const member of item.members) {
        const cleaned = cleanValue(entry[member.id]);
        if (cleaned !== undefined) cleanedEntry[member.id] = cleaned;
      }
      const out: Record<string, unknown> = {};
      for (const member of item.members) {
        if (member.type === "FILE" || !isVisible(cfg, member.id, asAnswers(merged), asEntry(cleanedEntry))) continue;
        const offered = resolveOptions(cfg, member.id, asAnswers(merged), asEntry(cleanedEntry)).map((o) => o.value);
        const value = keepOffered(member, cleanedEntry[member.id], offered);
        if (value !== undefined) out[member.id] = value;
      }
      return out;
    });
  }

  return { answers };
}

// ---------------------------------------------------------------------------
// Unsaved changes
// ---------------------------------------------------------------------------

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** True when two sets of form values mean the same thing (empty answers count as absent). */
export function valuesEqual(a: FormValues, b: FormValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (stable(cleanValue(a[key])) !== stable(cleanValue(b[key]))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Server errors -> fields
// ---------------------------------------------------------------------------

/** DOM id of the control an error key points at: "q2_24.line1" -> "field-q2_24-line1". */
export function errorTargetId(key: string): string {
  return `field-${key.replace(/\./g, "-")}`;
}

/** Errors for the parts of one compound answer: { "q2_24.line1": "..." } -> { line1: "..." }. */
export function subErrors(errors: Record<string, string>, questionId: string): Record<string, string> {
  const prefix = `${questionId}.`;
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = message;
  }
  return out;
}

/** Drops every error that belongs to a question (its own message and any sub-field messages). */
export function withoutErrorsFor(errors: Record<string, string>, questionId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (key !== questionId && !key.startsWith(`${questionId}.`)) out[key] = message;
  }
  return out;
}

/** Drops the errors of one repeating-group entry's question: "otherNames.1.q2_3a". */
export function withoutEntryErrors(errors: Record<string, string>, groupId: string, index: number, questionId: string): Record<string, string> {
  const base = `${groupId}.${index}.${questionId}`;
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (key !== base && !key.startsWith(`${base}.`)) out[key] = message;
  }
  return out;
}

/**
 * The server's field errors as a list for the error summary, in form order, each with
 * a readable name and the id of the control to focus. Keys the form does not recognise
 * are kept (named after the section) so nothing the server reported is lost.
 */
export function collectErrors(cfg: TouristVisaConfig, sectionId: string, errors: Record<string, string>): ErrorItem[] {
  const order = new Map<string, number>();
  sectionItems(cfg, sectionId).forEach((item, index) => {
    if (item.kind === "question") order.set(item.question.id, index);
    else order.set(item.group.id, index);
  });

  const describe = (key: string): { label: string; rank: number } => {
    const [first, second, third] = key.split(".");
    const question = cfg.questions.find((q) => q.id === first);
    if (question) return { label: `${question.number} ${question.label}`, rank: order.get(first) ?? Number.MAX_SAFE_INTEGER };
    const group = cfg.groups.find((g) => g.id === first);
    if (group) {
      const rank = order.get(first) ?? Number.MAX_SAFE_INTEGER;
      const entry = second !== undefined && /^\d+$/.test(second) ? `${group.entryLabel} ${Number(second) + 1}` : group.entryLabel;
      const member = third ? cfg.questions.find((q) => q.id === third) : undefined;
      return { label: member ? `${entry}: ${member.label}` : entry, rank: rank + (second !== undefined && /^\d+$/.test(second) ? Number(second) / 1000 : 0) };
    }
    return { label: "This section", rank: Number.MAX_SAFE_INTEGER };
  };

  return Object.entries(errors)
    .map(([key, message]) => ({ key, message, targetId: errorTargetId(key), ...describe(key) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ key, message, label, targetId }) => ({ key, message, label, targetId }));
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

/** A short hint under the label, built from the question's own rules. */
export function hintFor(cfg: TouristVisaConfig, question: Question): string | undefined {
  const parts: string[] = [];
  if (question.help) parts.push(question.help);
  const dateRules = [
    ["after", "after"],
    ["onOrAfter", "on or after"],
    ["onOrBefore", "on or before"],
  ] as const;
  for (const [key, words] of dateRules) {
    const ref = question.rules?.[key];
    if (!ref) continue;
    const numbers = (Array.isArray(ref) ? ref : [ref])
      .map((id) => cfg.questions.find((q) => q.id === id)?.number)
      .filter((n): n is string => Boolean(n));
    if (numbers.length === 1) parts.push(`Must be ${words} the date in question ${numbers[0]}.`);
    else if (numbers.length > 1) parts.push(`Must be ${words} the dates in questions ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}.`);
  }
  if (question.rules?.notFuture) parts.push("Cannot be in the future.");
  if (question.type === "TEL") parts.push("Include the country code, for example +44.");
  return parts.length > 0 ? parts.join(" ") : undefined;
}
