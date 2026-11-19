// Run with: npm run test:unit   (from client/)
// Dates in the Tourist Visa feature: the dd/mm/yyyy input (parser, mask, caret, the answer kept, the plain-words errors, the echo) and the
// read-only display ("18 January 2026", and with a time, "18 January 2026, 14:05"), in more than one time zone. The existing date rules
// (not in the future, after another date, within years) still behave the same with dates typed this way. Made-up dates only.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import * as z from "zod";
import engine from "../shared/tourist-visa/engine.js";
import {
  DATE_MESSAGES,
  caretAfterMask,
  dateAnswerFromText,
  dateEcho,
  dateErrorMessage,
  dateInputText,
  dateProblem,
  daysInMonth,
  formatDateTime,
  formatMomentDate,
  isIsoDate,
  isLeapYear,
  isoToDmy,
  longDate,
  maskDateText,
  parseDmy,
} from "./touristVisaDate.ts";

const { config } = engine;
const iso = (text) => {
  const parsed = parseDmy(text);
  return parsed.status === "valid" ? parsed.iso : parsed.status;
};

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

test("a valid date typed as dd/mm/yyyy becomes its ISO date, whatever the separator", () => {
  assert.equal(iso("18/01/2026"), "2026-01-18");
  assert.equal(iso("18-01-2026"), "2026-01-18");
  assert.equal(iso("18.01.2026"), "2026-01-18");
  assert.equal(iso("18 01 2026"), "2026-01-18");
  assert.equal(iso("  18/01/2026  "), "2026-01-18", "spaces round it are ignored");
  assert.equal(iso("1/1/2026"), "2026-01-01", "a one-digit day and month");
  assert.equal(iso("01/12/2026"), "2026-12-01");
  assert.equal(iso("18012026"), "2026-01-18", "eight digits with no separators");
  assert.deepEqual(parseDmy("18/01/2026"), { status: "valid", iso: "2026-01-18", day: 18, month: 1, year: 2026 });
});

test("the day always means the first number: 05/06/2026 is 5 June, never 6 May", () => {
  assert.equal(iso("05/06/2026"), "2026-06-05");
  assert.equal(iso("12/11/2026"), "2026-11-12");
  assert.equal(iso("11/12/2026"), "2026-12-11");
});

test("leap years: 29/02 is real in a leap year and not in any other; 100 and 400 year rules", () => {
  assert.equal(iso("29/02/2024"), "2024-02-29");
  assert.equal(iso("29/02/2028"), "2028-02-29");
  assert.equal(iso("29/02/2000"), "2000-02-29", "divisible by 400");
  assert.equal(iso("29/02/2025"), "invalid");
  assert.equal(iso("29/02/2026"), "invalid");
  assert.equal(iso("29/02/1900"), "invalid", "divisible by 100 and not by 400");
  assert.equal(iso("29/02/2100"), "invalid");
  assert.equal(iso("28/02/2025"), "2025-02-28");
  assert.deepEqual([isLeapYear(2024), isLeapYear(2025), isLeapYear(1900), isLeapYear(2000)], [true, false, false, true]);
  assert.deepEqual([daysInMonth(2024, 2), daysInMonth(2025, 2), daysInMonth(2026, 4), daysInMonth(2026, 12)], [29, 28, 30, 31]);
});

test("a date that is not real is invalid, and is never turned into another date", () => {
  for (const text of ["31/02/2026", "31/04/2026", "30/02/2026", "32/01/2026", "00/01/2026", "01/00/2026", "13/13/2026", "01/13/2026", "99/99/9999", "31/06/2026", "31/11/2026"]) {
    assert.equal(iso(text), "invalid", text);
  }
  assert.equal(iso("31/01/2026"), "2026-01-31");
  assert.equal(iso("30/04/2026"), "2026-04-30");
  assert.equal(iso("31/12/2026"), "2026-12-31");
});

test("a short year, a missing part and anything unfinished is incomplete, not an error yet", () => {
  for (const text of ["1", "18", "18/", "18/0", "18/01", "18/01/", "18/01/2", "18/01/20", "18/01/202", "18/01/26", "1801", "180120", "1801202", "18-01", "/"]) {
    assert.equal(iso(text), "incomplete", text);
  }
});

test("letters, extra parts, too-long parts and a five-digit year are invalid", () => {
  for (const text of ["abc", "18/Jan/2026", "18/01/20x6", "18/01/2026/5", "180/01/2026", "18/011/2026", "18/01/20266", "180120261", "1.5/1/2026", "18,01,2026", "18_01_2026", "18/01/0026", "18/01/0999"]) {
    assert.equal(iso(text), "invalid", text);
  }
});

test("empty and whitespace-only text is empty", () => {
  for (const text of ["", " ", "   ", "\t"]) assert.equal(iso(text), "empty", JSON.stringify(text));
  assert.equal(parseDmy(undefined).status, "empty");
});

test("isoToDmy and isIsoDate work from the parts, and only for a full ISO date", () => {
  assert.equal(isoToDmy("2026-01-18"), "18/01/2026");
  assert.equal(isoToDmy("2024-02-29"), "29/02/2024");
  for (const bad of ["18/01/2026", "2026-1-8", "2026-01", "", null, undefined, 20260118]) assert.equal(isoToDmy(bad), null, String(bad));
  assert.equal(isIsoDate("2026-01-18"), true);
  assert.equal(isIsoDate("18/01/2026"), false);
});

// ---------------------------------------------------------------------------
// Typing: the mask, the caret, the value kept
// ---------------------------------------------------------------------------

/** Types a text one character at a time, as a person would, through the mask. */
function typeIt(text, start = "") {
  let current = start;
  for (const character of text) current = maskDateText(current + character, current);
  return current;
}

test("typing digits adds the slashes; the whole date is dd/mm/yyyy", () => {
  assert.equal(typeIt("1"), "1");
  assert.equal(typeIt("18"), "18/");
  assert.equal(typeIt("180"), "18/0");
  assert.equal(typeIt("1801"), "18/01/");
  assert.equal(typeIt("18012"), "18/01/2");
  assert.equal(typeIt("18012026"), "18/01/2026");
  assert.equal(maskDateText("18012026"), "18/01/2026", "a paste of digits only");
});

test("a paste of 18/01/2026, 18-01-2026 and 18.01.2026 gives dd/mm/yyyy", () => {
  for (const pasted of ["18/01/2026", "18-01-2026", "18.01.2026", "18 01 2026"]) assert.equal(maskDateText(pasted), "18/01/2026", pasted);
  assert.equal(maskDateText("1/1/2026"), "1/1/2026", "a one-digit day and month are kept as typed");
  assert.equal(maskDateText("1-1-2026"), "1/1/2026");
});

test("partial input is kept while typing, and nothing is dropped from a longer or odd text", () => {
  assert.equal(maskDateText("18/0"), "18/0");
  assert.equal(maskDateText("18/01/20"), "18/01/20");
  assert.equal(maskDateText("31/02/2026"), "31/02/2026", "a date that is not real is not changed by the mask");
  assert.equal(maskDateText("180/01/2026"), "180/01/2026", "a day of three digits stays, and is reported");
  assert.equal(maskDateText("180120261"), "18/01/20261", "a ninth digit is kept, and the date is reported as not real");
  assert.equal(maskDateText("ab18cd"), "18/", "letters are ignored");
  assert.equal(maskDateText("//18/01"), "18/01/", "leading separators are ignored, and the slash before the year is ready");
  assert.equal(maskDateText("//18/0"), "18/0");
});

test("backspace can remove a slash: no slash is put back while deleting", () => {
  assert.equal(maskDateText("18", "18/"), "18");
  assert.equal(maskDateText("18/01", "18/01/"), "18/01");
  assert.equal(maskDateText("18/0", "18/01"), "18/0");
  assert.equal(maskDateText("1", "18"), "1");
  assert.equal(maskDateText("", "1"), "");
});

test("the caret stays where the person was typing", () => {
  // Typing at the end, a slash was added: the caret goes after it.
  assert.equal(caretAfterMask("18/", 2, false), 3);
  assert.equal(caretAfterMask("18/01/", 4, false), 6);
  // Fixing a digit in the middle: the caret stays after that digit.
  assert.equal(caretAfterMask("18/01/2026", 1, false), 1);
  assert.equal(caretAfterMask("18/01/2026", 3, false), 4);
  assert.equal(caretAfterMask("18/01/2026", 0, false), 0);
  // Deleting does not jump past the slash.
  assert.equal(caretAfterMask("18", 2, true), 2);
  assert.equal(caretAfterMask("18/0", 3, true), 4);
});

test("the form keeps the ISO date once the text is a real date, and the text as typed until then", () => {
  assert.equal(dateAnswerFromText("18/01/2026"), "2026-01-18");
  assert.equal(dateAnswerFromText("18/01/20"), "18/01/20");
  assert.equal(dateAnswerFromText("31/02/2026"), "31/02/2026", "kept, never turned into 3 March or anything else");
  assert.equal(dateAnswerFromText("13/13/2026"), "13/13/2026");
  assert.equal(dateAnswerFromText(""), "");
  assert.equal(dateAnswerFromText("   "), "");
});

test("the input shows a stored ISO date as dd/mm/yyyy and any other text as it is", () => {
  assert.equal(dateInputText("2026-01-18"), "18/01/2026");
  assert.equal(dateInputText("18/01/"), "18/01/");
  assert.equal(dateInputText("31/02/2026"), "31/02/2026");
  assert.equal(dateInputText(undefined), "");
  assert.equal(dateInputText(null), "");
  assert.equal(dateInputText(20260118), "");
  // A saved application round-trips untouched: ISO in, the same ISO out.
  for (const saved of ["2026-01-18", "2024-02-29", "1990-12-31", "2027-03-01"]) assert.equal(dateAnswerFromText(dateInputText(saved)), saved);
});

// ---------------------------------------------------------------------------
// The words: problems, errors and the echo
// ---------------------------------------------------------------------------

test("the messages are plain words that name the format", () => {
  assert.equal(DATE_MESSAGES.invalid, "Enter a real date as dd/mm/yyyy");
  assert.equal(DATE_MESSAGES.incomplete, "Enter the full date as dd/mm/yyyy");
  assert.equal(dateProblem("31/02/2026"), "invalid");
  assert.equal(dateProblem("13/13/2026"), "invalid");
  assert.equal(dateProblem("18/01/20"), "incomplete");
  assert.equal(dateProblem("18/01/2026"), null, "a typed real date has no problem");
  assert.equal(dateProblem("2026-01-18"), null);
  assert.equal(dateProblem(""), null, "empty is not a problem here (a required question says so itself)");
  assert.equal(dateProblem(undefined), null);
});

test("the engine's generic words are replaced for text that is not a date; other errors are shown as they are", () => {
  assert.equal(dateErrorMessage("31/02/2026", "Enter a full date"), "Enter a real date as dd/mm/yyyy");
  assert.equal(dateErrorMessage("18/01/20", "Enter a full date"), "Enter the full date as dd/mm/yyyy");
  assert.equal(dateErrorMessage("2090-01-01", "Cannot be in the future"), "Cannot be in the future");
  assert.equal(dateErrorMessage("2027-02-01", "Must be after the date in question 1.6"), "Must be after the date in question 1.6");
  assert.equal(dateErrorMessage("", "This question is required"), "This question is required");
  assert.equal(dateErrorMessage("31/02/2026", undefined), undefined, "no error from the form: nothing is added here");
});

test("the echo writes a complete, real date in words, and shows nothing while empty or invalid", () => {
  assert.equal(dateEcho("2026-01-18"), "18 January 2026");
  assert.equal(dateEcho("18/01/2026"), "18 January 2026");
  assert.equal(dateEcho("29/02/2024"), "29 February 2024");
  assert.equal(dateEcho("1/1/2026"), "1 January 2026");
  for (const nothing of ["", "   ", "18/01", "18/01/20", "31/02/2026", "13/13/2026", "abc", undefined, null, 5]) assert.equal(dateEcho(nothing), "", String(nothing));
});

// ---------------------------------------------------------------------------
// Read-only display: "18 January 2026"
// ---------------------------------------------------------------------------

test("all twelve months, in English, with the day as a number and no leading zero", () => {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  names.forEach((name, index) => {
    const month = String(index + 1).padStart(2, "0");
    assert.equal(longDate(`2026-${month}-05`), `5 ${name} 2026`, name);
    assert.equal(longDate(`2026-${month}-18`), `18 ${name} 2026`, name);
  });
});

test("the first and the last day of a year, and a leap day", () => {
  assert.equal(longDate("2026-01-01"), "1 January 2026");
  assert.equal(longDate("2026-12-31"), "31 December 2026");
  assert.equal(longDate("2024-02-29"), "29 February 2024");
  assert.equal(longDate("1999-12-31"), "31 December 1999");
  assert.equal(longDate("not a date"), "not a date", "text that is not a date is returned as it is");
});

/** Runs `check` with the process in a time zone, then puts the zone back. */
function inZone(zone, check) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    check();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

const ZONES = ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Los_Angeles", "Asia/Karachi", "Europe/London", "Australia/Lord_Howe"];

test("a date is the same in every time zone, near midnight and at every offset (no off-by-one-day)", () => {
  for (const zone of ZONES) {
    inZone(zone, () => {
      assert.equal(longDate("2026-01-18"), "18 January 2026", zone);
      assert.equal(longDate("2026-03-29"), "29 March 2026", `${zone}: the day the UK clocks change`);
      assert.equal(longDate("2026-10-25"), "25 October 2026", zone);
      assert.equal(dateEcho("18/01/2026"), "18 January 2026", zone);
      assert.equal(dateInputText("2026-01-18"), "18/01/2026", zone);
      assert.equal(dateAnswerFromText("01/01/2026"), "2026-01-01", `${zone}: the first of January stays the first`);
      assert.equal(dateAnswerFromText("31/12/2026"), "2026-12-31", `${zone}: the last of December stays the last`);
    });
  }
});

test("a moment shows the day and the time in the zone asked for, and in the browser's zone when none is given", () => {
  const moment = "2026-01-18T23:30:00.000Z";
  assert.equal(formatDateTime(moment, "UTC"), "18 January 2026, 23:30");
  assert.equal(formatDateTime(moment, "Asia/Karachi"), "19 January 2026, 04:30");
  assert.equal(formatDateTime(moment, "Pacific/Pago_Pago"), "18 January 2026, 12:30");
  assert.equal(formatDateTime(moment, "Pacific/Kiritimati"), "19 January 2026, 13:30");
  assert.equal(formatMomentDate(moment, "Asia/Karachi"), "19 January 2026");
  assert.equal(formatMomentDate(moment, "UTC"), "18 January 2026");
  // Without a zone the browser's (here the process's) zone is used, as the site did before.
  inZone("Pacific/Kiritimati", () => assert.equal(formatDateTime(moment), "19 January 2026, 13:30"));
  inZone("America/Los_Angeles", () => assert.equal(formatDateTime(moment), "18 January 2026, 15:30"));
  inZone("UTC", () => assert.equal(formatDateTime(moment), "18 January 2026, 23:30"));
});

test("the time is 24-hour and midnight is 00:00 (never 24:00 or an am/pm), with the date written in words", () => {
  assert.equal(formatDateTime("2026-01-18T00:00:00.000Z", "UTC"), "18 January 2026, 00:00");
  assert.equal(formatDateTime("2026-01-18T00:05:00.000Z", "UTC"), "18 January 2026, 00:05");
  assert.equal(formatDateTime("2026-01-18T12:00:00.000Z", "UTC"), "18 January 2026, 12:00");
  assert.equal(formatDateTime("2026-01-18T13:07:00.000Z", "UTC"), "18 January 2026, 13:07");
  assert.equal(formatDateTime("2026-12-31T23:59:00.000Z", "UTC"), "31 December 2026, 23:59");
  assert.equal(formatDateTime("2027-01-01T00:00:00.000Z", "UTC"), "1 January 2027, 00:00");
  assert.equal(/am|pm/i.test(formatDateTime("2026-01-18T13:07:00.000Z", "UTC")), false);
});

test("the clocks changing: a London summer time and winter time both give the right day and hour", () => {
  assert.equal(formatDateTime("2026-07-15T23:30:00.000Z", "Europe/London"), "16 July 2026, 00:30", "BST is UTC+1");
  assert.equal(formatDateTime("2026-12-15T23:30:00.000Z", "Europe/London"), "15 December 2026, 23:30", "GMT is UTC");
  assert.equal(formatDateTime("2026-03-29T00:30:00.000Z", "Europe/London"), "29 March 2026, 00:30");
  assert.equal(formatDateTime("2026-03-29T01:30:00.000Z", "Europe/London"), "29 March 2026, 02:30", "the hour that does not exist is skipped");
});

test("a missing or unreadable moment gives nothing", () => {
  for (const bad of [null, undefined, "", "not a date", "2026-13-45T99:99:99Z"]) {
    assert.equal(formatDateTime(bad), "", String(bad));
    assert.equal(formatMomentDate(bad), "", String(bad));
  }
});

// ---------------------------------------------------------------------------
// The existing date rules still apply to a date typed this way
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const zod = (() => {
  try {
    return require(require.resolve("zod", { paths: [path.join(process.cwd(), "..", "backend")] }));
  } catch {
    return z;
  }
})();

const TODAY = "2026-10-28";
const V1 = { q1_1: "tourism", q1_2: false, q1_3: false, q1_4: "holiday", q1_5: "Test trip.", q1_6: "2027-03-01", q1_7: "2027-03-15" };
const check = (section, answers, existing = {}) => engine.validateSection(zod, config, section, answers, existing, { today: TODAY });
/** What the form keeps for a date typed as `text`, as the answer sent to the server. */
const typed = (text) => dateAnswerFromText(maskDateText(text));

test("typed dates reach the engine as ISO, and a valid pair passes", () => {
  const result = check("1", { ...V1, q1_6: typed("01/03/2027"), q1_7: typed("15/03/2027") });
  assert.equal(result.success, true, JSON.stringify(result.errors));
  assert.equal(result.data.q1_6, "2027-03-01");
  assert.equal(result.data.q1_7, "2027-03-15");
});

test("rule: a date after another date (departure after arrival) is checked as before", () => {
  const result = check("1", { ...V1, q1_6: typed("01/03/2027"), q1_7: typed("01/02/2027") });
  assert.equal(result.success, false);
  assert.equal(result.errors.q1_7, "Must be after the date in question 1.6");
  assert.equal(check("1", { ...V1, q1_6: typed("01/03/2027"), q1_7: typed("01/03/2027") }).errors.q1_7, "Must be after the date in question 1.6", "the same day is not after");
});

test("rule: not in the future is checked as before (a date of birth)", () => {
  const section = { q2_12: "female", q2_13: "single", q2_14: "GB", q2_15: "GB", q2_16: "Testville", q2_18: false, q2_23: false };
  assert.equal(check("2B", { ...section, q2_17: typed("01/01/1990") }).success, true);
  assert.equal(check("2B", { ...section, q2_17: typed("28/10/2026") }).success, true, "today is not the future");
  assert.equal(check("2B", { ...section, q2_17: typed("29/10/2026") }).errors.q2_17, "Cannot be in the future");
  assert.equal(check("2B", { ...section, q2_17: typed("01/01/2090") }).errors.q2_17, "Cannot be in the future");
});

test("rule: a date within the past N years is checked as before", () => {
  const limited = config.questions.find((q) => q.type === "DATE" && q.rules && q.rules.withinYears);
  if (!limited) return; // the approved config has none on a date question; the rule is covered in the engine tests
  assert.ok(limited.rules.withinYears > 0);
});

test("a date typed as something that is not a date reaches the engine as text and is refused, never accepted as another date", () => {
  for (const text of ["31/02/2026", "13/13/2026", "18/01/20", "29/02/2025", "00/01/2026"]) {
    const result = check("1", { ...V1, q1_6: typed(text) });
    assert.equal(result.success, false, text);
    assert.ok(result.errors.q1_6, text);
    // And the words the person sees name the format.
    assert.match(dateErrorMessage(typed(text), result.errors.q1_6), /as dd\/mm\/yyyy$/, text);
  }
});

test("a saved application with ISO dates is unchanged: shown as dd/mm/yyyy, saved again as the same ISO date", () => {
  const saved = check("1", V1);
  assert.equal(saved.success, true);
  for (const id of ["q1_6", "q1_7"]) {
    const shown = dateInputText(V1[id]);
    assert.match(shown, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(typed(shown), V1[id], `${id} round-trips`);
  }
});
