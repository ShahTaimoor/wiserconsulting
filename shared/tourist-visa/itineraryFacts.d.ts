// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

import type { TouristVisaConfig } from './engine';
import type { FactRules, FactSpec, Facts } from './coverLetterFacts';

export interface ItineraryFacts extends Facts {
  /** The well-known places named in the trip description, in the order they were named. */
  places: string[];
}

export const SPECS: ReadonlyArray<FactSpec>;
export const PLACES_SPEC: FactSpec;
export const ALLOWED_SECTIONS: ReadonlyArray<string>;
export const EXCLUDED_SECTIONS: Readonly<Record<string, ReadonlyArray<string>>>;
export const EXCLUDED_IDS: Readonly<Record<string, ReadonlyArray<string>>>;
export const ITINERARY_RULES: FactRules;
export const PLACES: ReadonlyArray<string>;
export function placesIn(text: string): string[];
export function allowedIds(specs?: ReadonlyArray<FactSpec>): string[];
export function validateItineraryAllowlist(specs?: ReadonlyArray<FactSpec>, cfg?: TouristVisaConfig): string[];
export function buildItineraryFacts(cfg: TouristVisaConfig, answers: Record<string, unknown>, options?: { submittedAt?: Date | string }): ItineraryFacts;
