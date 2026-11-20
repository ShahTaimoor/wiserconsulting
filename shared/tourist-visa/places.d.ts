/** The well-known UK places of a fixed list, and a function that finds the ones a text names (only list names are returned). */
export const PLACES: ReadonlyArray<string>;
/** Names that are also ordinary words: only a capital letter counts. */
export const CAPITAL_ONLY: ReadonlySet<string>;
/** The places from PLACES that a text names, each once, in the order they first appear. */
export function placesIn(text: string): string[];
/** A plain town: letters, spaces, apostrophes and hyphens only, 2 to 40 characters. */
export const PLAIN_TOWN: RegExp;
/** The place a town stands for: a list name when it names one, else the plain town as typed, else null (not a place we can name). */
export function placeOfTown(town: string): string | null;
