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
/** Words that make a typed place an address or a stay (street, hotel...). */
export const NOT_A_PLACE_WORDS: ReadonlySet<string>;
/** The most words the name of a town or city may have. */
export const MAX_TOWN_WORDS: number;
/** The places of the list, A to Z, as drop-down options (the value is the name). */
export const PLACE_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }>;
/** Is this typed text the name of a town or city and nothing more? (Plain-town rule, at most three words, no address or hotel words; a place of the list always is.) */
export function isTownName(text: string): boolean;
