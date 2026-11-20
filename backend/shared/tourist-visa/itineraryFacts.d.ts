// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

import type { TouristVisaConfig } from './engine';
import type { FactRules, FactSpec, Facts } from './coverLetterFacts';

/** One place of stay (6.7): the town of its address (null when it is not a town), the place we can name for it (null when none) and the two dates. */
export interface Stay {
  town: string | null;
  place: string | null;
  /** ISO dates, "2027-03-15". */
  from: string;
  to: string;
  /** The dates in words, "15 March 2027". */
  fromText: string;
  toText: string;
}

export type StayPlan =
  | { mode: 'trip' }
  | { mode: 'stays'; stays: Stay[] }
  | { mode: 'invalid'; questions: string[] };

export interface ItineraryFacts extends Facts {
  /** The well-known places named in the trip description, in the order they were named. */
  places: string[];
  /** The places of stay that have both dates, in the order they were answered. */
  stays: Stay[];
  /** What the stays make of the visit, worked out from the stored dates. */
  stayPlan: StayPlan;
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
/** What the places of stay make of the visit: the trip alone, the stays in date order, or contradictory dates (generation is refused). */
export function planStays(stays: ReadonlyArray<Stay> | undefined, arrival: string | undefined, departure: string | undefined): StayPlan;
/** The stay a day (an ISO date) belongs to, or null; the day one stay leaves and the next arrives belongs to the later one. */
export function stayOnDay(stays: ReadonlyArray<Stay>, iso: string): Stay | null;
/** The lines of the "Staying" row: "London, 15 March to 18 March 2027". */
export function stayLines(stays: ReadonlyArray<Stay>): string[];
/** "15 March to 18 March 2027". */
export function stayRange(from: string, to: string): string;
/** An ISO date as a day number (UTC), or null when it is not a real date. */
export function dayNumber(value: unknown): number | null;
export const STAY_QUESTIONS: ReadonlyArray<string>;
