// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

import type { TouristVisaConfig } from './engine';

export interface FactSpec {
  key: string;
  section: string;
  label: string;
  kind: 'value' | 'text' | 'part' | 'count' | 'list' | 'stay' | 'since' | 'token';
  id?: string;
  ids?: string[];
  gate?: string;
  group?: string;
  part?: 'town' | 'country';
  token?: 'NAME' | 'EMPLOYER' | 'SCHOOL';
  max?: number;
  inline?: boolean;
  newestFirstBy?: string;
  withholdIf?: { id: string; value: string };
  fields?: Array<{ id: string; label: string }>;
}

export interface FactItem {
  key: string;
  label: string;
  value: string | string[];
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
export function validateAllowlist(specs?: ReadonlyArray<FactSpec>, cfg?: TouristVisaConfig): string[];
export function buildFacts(cfg: TouristVisaConfig, answers: Record<string, unknown>, options?: { submittedAt?: Date | string }): Facts;
export function tokenValues(cfg: TouristVisaConfig, answers: Record<string, unknown>): Facts['tokens'];
export function cleanFreeText(text: string, tokens: Facts['tokens']): string;
export function renderFacts(sections: Facts['sections'], tokens: Facts['tokens']): string;
