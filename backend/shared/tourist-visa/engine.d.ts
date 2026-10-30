// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

type ZodModule = typeof import('zod');

export type AnswerType =
  | 'TXT' | 'LNG' | 'DATE' | 'MY' | 'NUM' | 'DUR' | 'AMT' | 'YN'
  | 'SEL' | 'CTRY' | 'CHK' | 'ADDR' | 'TEL' | 'EML' | 'ACK' | 'FILE';

/** Declarative, JSON-safe condition. A condition on a hidden question is never met. */
export type Condition =
  | { q: string; eq: string | boolean | number }
  | { q: string; in: Array<string | boolean | number> }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface QuestionOption {
  value: string;
  label: string;
}

export type OptionsSpec =
  | QuestionOption[]
  | { from: 'countries' }
  | { from: 'answers'; questions: string[] };

export interface QuestionRules {
  /** DATE/MY must be later than the answer(s) to these earlier questions. */
  after?: string | string[];
  /** DATE/MY must be the same day as, or later than, the answer(s) to these earlier questions. */
  onOrAfter?: string | string[];
  /** DATE/MY must be the same day as, or earlier than, the answer(s) to these earlier questions. */
  onOrBefore?: string | string[];
  /** DATE/MY must not be later than today. */
  notFuture?: boolean;
  /** DATE/MY must not be earlier than this many years before today ("in the past 10 years"). */
  withinYears?: number;
  /** DUR: which units are asked, and whether all of them ('parts') or exactly one ('single'). */
  units?: Array<'years' | 'months' | 'weeks' | 'days'>;
  durationMode?: 'single' | 'parts';
  /** AMT: accepted currencies (default GBP). */
  currencies?: string[];
  /** TXT/LNG: overrides limits.txtMax / limits.lngMax. */
  maxLen?: number;
  /** NUM: inclusive bounds (default 0..1000). */
  min?: number;
  /** NUM: inclusive upper bound. AMT: largest amount accepted (default 1,000,000,000; never negative). */
  max?: number;
}

export interface Question {
  /** Storage key, e.g. "q2_3a". Dots are avoided because Mongo reads them as paths. */
  id: string;
  /** Number shown to the applicant and used in the spec, e.g. "2.3a". */
  number: string;
  /** Section (one page, one "Save and continue"), e.g. "2A". */
  section: string;
  label: string;
  type: AnswerType;
  /** Required whenever the question is shown. */
  required: boolean;
  showWhen?: Condition;
  options?: OptionsSpec;
  /** Id of the repeating group this question belongs to. */
  group?: string;
  rules?: QuestionRules;
  /** Short items shown as a bulleted list under the question text. */
  items?: string[];
  /** Encrypt at rest (passport and ID numbers, Part 9, Part 10A). */
  sensitive?: boolean;
  /** Pre-fill hint for the client only. */
  prefill?: 'account.email';
  help?: string;
  /** Developer note from the spec; never shown to applicants. */
  note?: string;
  /** Open gap from the spec. Any tbc blocks release of the section. */
  tbc?: string;
  /**
   * A default we chose (an option list, follow-up questions or a rule) that needs senior review.
   * The note says what the default is. It is listed separately from tbc items, and it keeps the
   * client's own gate closed until it is removed.
   */
  draft?: string;
}

export interface RepeatGroup {
  id: string;
  section: string;
  entryLabel: string;
  /**
   * Yes/No question that opens the group. Yes means at least `min` entries.
   * Leave it out for a group that is always shown.
   */
  gate?: string;
  /** Fewest entries when the group is open (default 1). */
  min?: number;
  /**
   * NUM question in the same section that says how many entries there are. The group then
   * has exactly that many entries, and the applicant cannot add or remove any.
   * Needs a gate; the count question needs rules.min of at least 1 and rules.max within `max`.
   */
  count?: string;
  max: number;
  questions: string[];
  /** A default we chose for this group (gate, fields or limits) that needs senior review. */
  draft?: string;
  /**
   * Two DATE members that give each entry a date range. Ranges of different
   * entries may touch but not overlap.
   */
  noOverlap?: { start: string; end: string };
  tbc?: string;
}

export interface TouristVisaConfig {
  version: string;
  limits: { txtMax: number; lngMax: number; groupMax: number; note?: string };
  parts: Array<{ id: string; title: string }>;
  sections: Array<{ id: string; part: string; title: string; intro?: string }>;
  groups: RepeatGroup[];
  questions: Question[];
}

/** Value shapes by answer type. */
export type Address = {
  line1: string; line2?: string; town: string; region?: string; postcode?: string;
  /** ISO 3166-1 alpha-2 code from countries.json. */
  country: string;
};
export type Telephone = { countryCode: string; number: string };
export type Duration = Partial<Record<'years' | 'months' | 'weeks' | 'days', number>>;
export type Amount = { amount: number; currency: string };
/** DATE is "YYYY-MM-DD", MY is "YYYY-MM", CTRY is an ISO alpha-2 code. */
export type AnswerValue =
  | string | number | boolean | string[] | Address | Telephone | Duration | Amount;
export type GroupEntry = Record<string, AnswerValue>;
export type Answers = Record<string, AnswerValue | GroupEntry[]>;

export interface SectionResult {
  success: boolean;
  /** Normalised answers for the visible questions. Persist only when success is true. */
  data: Answers;
  /** Keyed by "qid", "qid.field" or "groupId.index.qid". Messages never contain answer values. */
  errors: Record<string, string>;
  /** Question/group ids of this section that are hidden and must be unset. */
  removed: string[];
  /** Keys sent that do not belong to the section. */
  unknownKeys: string[];
}

export interface ReleaseBlocker {
  sectionId: string;
  items: Array<{ id: string; number: string | null; tbc: string }>;
}

export interface DraftItems {
  sectionId: string;
  /** number is null for a repeating group. */
  items: Array<{ id: string; number: string | null; draft: string }>;
}

export interface HeldSection {
  sectionId: string;
  /** Open tbc items (real unknowns). */
  tbc: number;
  /** Draft items awaiting senior review. */
  draft: number;
}

export const config: TouristVisaConfig;

export function getCountries(): Array<{ code: string; name: string }>;
export function getQuestion(cfg: TouristVisaConfig, id: string): Question | undefined;

export function isVisible(
  cfg: TouristVisaConfig, questionId: string, answers: Answers, entry?: GroupEntry | null
): boolean;

export function getVisibleQuestions(
  cfg: TouristVisaConfig, sectionId: string, answers: Answers
): Question[];

/** A section is shown when at least one of its questions is visible. */
export function isSectionVisible(
  cfg: TouristVisaConfig, sectionId: string, answers: Answers
): boolean;

/** The sections the applicant has to complete, in form order. */
export function getVisibleSections(
  cfg: TouristVisaConfig, answers: Answers
): TouristVisaConfig['sections'];

export function resolveOptions(
  cfg: TouristVisaConfig, questionId: string, answers: Answers, entry?: GroupEntry | null
): QuestionOption[];

export function pruneAnswers(
  cfg: TouristVisaConfig, answers: Answers
): { answers: Answers; removed: string[] };

/**
 * `incoming` is the full new state of the section. `existing` is the stored
 * application answers (the section's own keys in it are ignored).
 * Pass the caller's own zod module as `z`.
 */
export function validateSection(
  z: ZodModule,
  cfg: TouristVisaConfig,
  sectionId: string,
  incoming: unknown,
  existing?: Answers,
  opts?: { today?: string }
): SectionResult;

export function getReleaseBlockers(cfg: TouristVisaConfig): ReleaseBlocker[];
/** Questions with a draft option list, by section, for the release check. */
export function getDraftItems(cfg: TouristVisaConfig): DraftItems[];
/** Sections still carrying a tbc flag or a draft marker. The client opens the form only when this is empty. */
export function getHeldSections(cfg: TouristVisaConfig): HeldSection[];
export function isSectionReleasable(cfg: TouristVisaConfig, sectionId: string): boolean;
export function validateConfig(cfg: unknown): string[];
