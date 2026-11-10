// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

import type { TouristVisaConfig } from './engine';

export interface FactSpec {
  key: string;
  section: string;
  label: string;
  kind: 'value' | 'text' | 'places' | 'part' | 'count' | 'list' | 'stay' | 'since' | 'token';
  id?: string;
  ids?: string[];
  gate?: string;
  group?: string;
  part?: 'town' | 'country';
  token?: 'NAME' | 'EMPLOYER' | 'SCHOOL';
  max?: number;
  inline?: boolean;
  /** For a value: the exact words to use for chosen options (an option's code to its words). */
  words?: Readonly<Record<string, string>>;
  newestFirstBy?: string;
  withholdIf?: { id: string; value: string };
  fields?: Array<{ id: string; label: string }>;
  /** Written as one line, the values joined by semicolons. */
  oneLine?: boolean;
}

export interface FactItem {
  key: string;
  label: string;
  value: string | string[];
  /** Typed by the applicant (free text). */
  free?: true;
  /** Free text, sent inside a delimited data block. */
  data?: true;
}

export interface Facts {
  sections: Array<{ title: string; items: FactItem[] }>;
  values: Record<string, string | string[]>;
  /** The real values of the placeholders. Held by the server and never sent anywhere. */
  tokens: Partial<Record<'NAME' | 'EMPLOYER' | 'SCHOOL', string>>;
  /** The facts as the AI receives them. */
  text: string;
  /** A stable string of everything above, for the hash that detects a change. */
  canonical: string;
}

export const SPECS: ReadonlyArray<FactSpec>;
export const TOKEN_SOURCES: Readonly<Record<'NAME' | 'EMPLOYER' | 'SCHOOL', ReadonlyArray<string>>>;
export const FORBIDDEN_SECTIONS: ReadonlyArray<string>;
export const EXCLUDED_IDS: Readonly<Record<string, ReadonlyArray<string>>>;
export const MONTHS: ReadonlyArray<string>;
export const MONTH_PATTERN: string;
export const MAX_FREE_TEXT: number;
export function allowedIds(specs?: ReadonlyArray<FactSpec>): string[];
export function validateAllowlist(specs?: ReadonlyArray<FactSpec>, cfg?: TouristVisaConfig, rules?: FactRules): string[];
export function buildFacts(cfg: TouristVisaConfig, answers: Record<string, unknown>, options?: { submittedAt?: Date | string }): Facts;

/** What can never be a fact, as rules an allowlist is checked against. */
export interface FactRules {
  forbiddenSections: ReadonlyArray<string>;
  excludedIds: ReadonlySet<string>;
  forbiddenTypes: ReadonlySet<string>;
  addressParts: ReadonlySet<string>;
  /** When set, a question in any other section is refused. */
  allowedSections?: ReadonlyArray<string>;
  /** When set, a placeholder (token) item for a name or employer is refused. */
  noTokenSpecs?: boolean;
}
export const COVER_LETTER_RULES: FactRules;
export const ADDRESS_PARTS: ReadonlySet<string>;
export function buildFactsFor(
  specs: ReadonlyArray<FactSpec>,
  rules: FactRules,
  cfg: TouristVisaConfig,
  answers: Record<string, unknown>,
  options?: { submittedAt?: Date | string; derive?: (api: { values: Record<string, string | string[]>; raw: Record<string, unknown>; add: (spec: FactSpec, value: string | string[]) => void }) => void }
): Facts;
export function tokenValues(cfg: TouristVisaConfig, answers: Record<string, unknown>): Facts['tokens'];
export function cleanFreeText(text: string, tokens: Facts['tokens']): string;
export function renderFacts(sections: Facts['sections'], tokens: Facts['tokens']): string;
