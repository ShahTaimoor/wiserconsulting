/**
 * How the questions of a section are laid out on a wide screen. A generic rule for every section, not a setting of one question: short answers
 * (a line of text, a date, a choice, an amount, a Yes/No) sit two to a row from 1024 px up; long ones (a long text, a list of ticks, an address, a
 * declaration, a file, a repeating group, anything with a block of its own under it) take the whole row. On a phone there is one column, as before.
 *
 * The reading order is the order of the questions (left to right, then down), so the tab order is the same. The box that asks for the words of an
 * "Other" answer stays directly under its question, in the same cell.
 *
 * Plain functions, so they can be unit tested with `node --test`.
 */

import type { Question } from "../shared/tourist-visa/engine.js";

/** The types that always take a whole row: they are long, or made of several fields, or are not a plain field at all. */
export const WIDE_TYPES: ReadonlySet<string> = new Set(["LNG", "CHK", "ADDR", "ACK", "FILE"]);

/** The grid of the questions of a section or of an entry: one column, two from 1024 px. */
export const GRID_CLASS = "grid grid-cols-1 gap-y-6 lg:grid-cols-2 lg:gap-x-8";
/** The same, inside the card of one entry of a repeating group (a little closer together). */
export const ENTRY_GRID_CLASS = "grid grid-cols-1 gap-y-4 lg:grid-cols-2 lg:gap-x-8";
/** A cell that takes the whole row on a wide screen. */
export const WIDE_CELL_CLASS = "lg:col-span-2";

/** Does this question take a whole row? */
export function isWideQuestion(question: Pick<Question, "type" | "helper" | "items" | "helpCountries">): boolean {
  if (WIDE_TYPES.has(question.type)) return true;
  // A block of its own goes with the question (the amounts to look for, a list inside the question text, the countries note).
  return Boolean(question.helper || question.items || question.helpCountries);
}

export interface LayoutCell {
  /** The question (never the box of an Other answer). */
  question: Question;
  /** The box that asks for the words of an Other answer, shown directly under the question in the same cell. */
  companion?: Question;
  wide: boolean;
}

/**
 * The cells of a list of questions, in order: a question and the box of its Other answer are ONE cell, so the written answer is never separated from its
 * question. A box whose question is not in the list gets a cell of its own.
 */
export function layoutCells(questions: ReadonlyArray<Question>): LayoutCell[] {
  const cells: LayoutCell[] = [];
  const byId = new Map<string, LayoutCell>();
  for (const question of questions) {
    const owner = question.otherOf ? byId.get(question.otherOf) : undefined;
    if (owner) {
      owner.companion = question;
      continue;
    }
    const cell: LayoutCell = { question, wide: isWideQuestion(question) };
    cells.push(cell);
    byId.set(question.id, cell);
  }
  return cells;
}

/** The classes of a cell: it may shrink inside its grid column, and a wide one spans the row on a wide screen. */
export function cellClass(cell: Pick<LayoutCell, "wide">, extra = ""): string {
  return `min-w-0 ${cell.wide ? WIDE_CELL_CLASS : ""} ${extra}`.replace(/\s+/g, " ").trim();
}
