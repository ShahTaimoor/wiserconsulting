// Run with: npm run test:unit   (from client/). Step 8g: the cover letter panel's logic and words, the four service calls, and
// what the component does (read from its source). All made-up data.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aiLine,
  canSaveLetter,
  CHECK_NOTICE,
  CHECK_NOTICE_SHORT,
  createdMessage,
  DEFAULT_MAX_LETTER,
  describeLetterError,
  fallbackMessage,
  hasGaps,
  letterActions,
  letterCounter,
  sourceBadge,
  checkNoticeFor,
  savedMessage,
  STALE_BANNER,
  STALE_HELP,
  versionTitle,
} from "./touristVisaCoverLetter.ts";
import { describeActivity, describeAdminError, jumpLinks } from "./touristVisaAdmin.ts";
import { touristVisaService, TouristVisaApiError } from "../services/touristVisaService.ts";

const admin = { id: "a1", name: "Alex Auditor" };
const version = (n, extra = {}) => ({ version: n, text: `Letter text ${n}`, source: "ai", model: "m", createdAt: "2026-11-03T10:00:00Z", createdBy: admin, status: "draft", ...extra });

test("badges: the three sources read AI draft, Template draft and Edited by admin", () => {
  assert.deepEqual(["ai", "template", "admin"].map((s) => sourceBadge(s).label), ["AI draft", "Template draft", "Edited by admin"]);
  assert.equal(versionTitle(version(3)), "Version 3, AI draft");
  assert.equal(versionTitle(version(2, { source: "admin", status: "approved" })), "Version 2, Edited by admin, approved");
});

test("a plain message for every reason the AI was not used, and none shows what the AI said", () => {
  const codes = ["AI_DISABLED", "AI_NOT_CONFIGURED", "AI_TERMS_NOT_CONFIRMED", "AI_CIRCUIT_OPEN", "AI_DAILY_LIMIT", "AI_ADMIN_LIMIT", "AI_RATE_LIMITED", "AI_TIMEOUT", "AI_NETWORK", "AI_PROVIDER_REJECTED", "AI_PROVIDER_ERROR", "AI_BAD_RESPONSE", "AI_TRUNCATED", "LETTER_EMPTY", "LETTER_LENGTH", "LETTER_LINK", "LETTER_UNKNOWN_TOKEN", "LETTER_MISSING_TOKEN", "LETTER_NUMBER_NOT_IN_FACTS", "LETTER_DATE_NOT_IN_FACTS", "AI_BANNED_PHRASE"];
  for (const code of codes) {
    const words = fallbackMessage(code);
    assert.match(words, /template letter was created/, code);
    assert.equal(/AI_|LETTER_/.test(words), false, `${code} must not show the code`);
  }
  assert.equal(fallbackMessage("AI_NETWORK"), "The AI was not available, so a template letter was created.");
  assert.equal(fallbackMessage(undefined), "The AI was not available, so a template letter was created.");
  assert.match(fallbackMessage("AI_DAILY_LIMIT"), /limit/);
  assert.equal(fallbackMessage("AI_BANNED_PHRASE"), "The AI's letter used wording that is not allowed, even after a second try, so a template letter was created instead.");
  assert.match(fallbackMessage("LETTER_NUMBER_NOT_IN_FACTS"), /did not match the application's answers/);
});

test("what is said after Generate: an AI draft with the check notice, or the reason for a template", () => {
  assert.match(createdMessage({ version: 2, source: "ai" }), /^AI draft created \(version 2\)\. Check every fact/);
  assert.equal(createdMessage({ version: 1, source: "template", fallbackReason: "AI_DISABLED" }), "The AI is switched off, so a template letter was created. (Version 1.)");
  assert.match(createdMessage({ version: 4, source: "template", fallbackReason: "AI_TIMEOUT" }), /took too long/);
  assert.equal(CHECK_NOTICE_SHORT, "Check every fact in this letter against the application's answers before approving.");
  assert.equal(CHECK_NOTICE_SHORT.includes("AI"), false, "a template or hand-written letter is not called an AI letter");
  assert.match(CHECK_NOTICE, /^Check every fact in this letter against the application's answers before approving/);
});

test("the AI line before generating says whether the AI will be used, and that names are not sent", () => {
  assert.match(aiLine({ available: true }), /written by the AI.*Names and contact details are not sent/);
  assert.equal(aiLine({ available: false, code: "AI_DISABLED" }), "The AI is switched off. A new version will be a template letter.");
  assert.match(aiLine({ available: false, code: "AI_CIRCUIT_OPEN" }), /paused after repeated problems/);
  assert.match(aiLine({ available: false }), /not available right now/);
});

test("the counter: words, characters and the limit; over the limit is flagged", () => {
  assert.deepEqual(letterCounter("one two  three"), { characters: 14, words: 3, over: false, label: "3 words, 14 of 8,000 characters" });
  assert.equal(letterCounter("").label, "0 words, 0 of 8,000 characters");
  assert.equal(letterCounter("word").label, "1 word, 4 of 8,000 characters");
  assert.equal(letterCounter("a".repeat(8001)).over, true);
  assert.equal(letterCounter("a".repeat(8000)).over, false);
  assert.equal(letterCounter("a\r\nb").characters, 3, "a line break counts once, as the server stores it");
  assert.equal(letterCounter("abc", 2).over, true);
  assert.equal(DEFAULT_MAX_LETTER, 8000);
});

test("saving: needs words, fits, and must differ from the newest version", () => {
  assert.deepEqual(canSaveLetter("", null), { ok: false, message: "Write the letter first." });
  assert.deepEqual(canSaveLetter("   \n ", "x"), { ok: false, message: "Write the letter first." });
  assert.equal(canSaveLetter("a".repeat(8001), null).ok, false);
  assert.match(canSaveLetter("a".repeat(8001), null).message, /at most 8,000 characters/);
  assert.equal(canSaveLetter("Hand written", null).ok, true, "a first letter by hand");
  assert.equal(canSaveLetter("Same text\r\n", "Same text").ok, false, "unchanged is not a new version");
  assert.equal(canSaveLetter("Same text, changed", "Same text").ok, true);
});

test("which buttons are on: save only for a real change, approve only for a clean, current, complete draft", () => {
  const draft = version(2);
  const base = { latest: draft, text: draft.text, stale: false, busy: false };
  let a = letterActions(base);
  assert.deepEqual([a.canGenerate, a.canSave, a.canApprove, a.approveHint], [true, false, true, ""]);

  a = letterActions({ ...base, text: "Edited text" });
  assert.deepEqual([a.canSave, a.canApprove], [true, false]);
  assert.match(a.approveHint, /Save your changes as a new version first/);

  a = letterActions({ ...base, stale: true });
  assert.equal(a.canApprove, false);
  assert.match(a.approveHint, /new version/);

  const approved = version(2, { status: "approved" });
  a = letterActions({ ...base, latest: approved, text: approved.text });
  assert.equal(a.canApprove, false);
  assert.equal(a.approveHint, "This version is approved.");

  const gaps = version(2, { text: "I will arrive on [not provided: planned arrival date]." });
  a = letterActions({ ...base, latest: gaps, text: gaps.text });
  assert.equal(a.canApprove, false);
  assert.match(a.approveHint, /gaps/);
  assert.equal(hasGaps(gaps.text), true);
  assert.equal(hasGaps("Nothing missing [NAME]"), false);

  a = letterActions({ ...base, busy: true, text: "Edited" });
  assert.deepEqual([a.canGenerate, a.canSave, a.canApprove], [false, false, false], "nothing while a request is running");

  a = letterActions({ latest: null, text: "A first letter", stale: false, busy: false });
  assert.deepEqual([a.canGenerate, a.canSave, a.canApprove], [true, true, false], "no letter yet: generate, or write one by hand");
  assert.equal(STALE_BANNER, "Answers used by the letter have changed.");
});

test("a plain sentence for every way a letter call can fail, never the code or anything the server holds", () => {
  const codes = ["LETTER_NOT_AVAILABLE", "LETTER_CHANGED", "LETTER_NOT_LATEST", "ALREADY_APPROVED", "LETTER_STALE", "LETTER_HAS_PLACEHOLDERS", "LETTER_NOT_FOUND", "LETTER_UNREADABLE", "COVER_LETTER_UNAVAILABLE", "INVALID_TEXT", "INVALID_REQUEST"];
  const seen = new Set();
  for (const code of codes) {
    const words = describeLetterError({ status: 409, code }, describeAdminError);
    assert.equal(/[A-Z]{3,}_[A-Z_]+/.test(words), false, code);
    assert.ok(words.length > 20, code);
    seen.add(words);
  }
  assert.ok(seen.size >= 9, "different words for different problems");
  assert.match(describeLetterError({ status: 409, code: "LETTER_CHANGED" }, describeAdminError), /changed by someone else/);
  assert.match(describeLetterError({ status: 409, code: "LETTER_HAS_PLACEHOLDERS" }, describeAdminError), /\[not provided: \.\.\.\] gaps/);
  // Anything else falls back to the ordinary admin wording.
  assert.equal(describeLetterError({ status: 0 }, describeAdminError), "We couldn't reach the server. Check your internet connection and try again.");
  assert.equal(describeLetterError({ status: 403 }, describeAdminError), "You do not have access to this page.");
  assert.equal(describeLetterError({ status: 404, code: "APPLICATION_NOT_FOUND" }, describeAdminError), "That application could not be found. It may not have been submitted.");
  assert.equal(describeLetterError({ status: 404, closed: true }, describeAdminError), "The Tourist Visa application isn't open right now.");
});

test("the Activity panel and the jump list know the cover letter", () => {
  assert.deepEqual(describeActivity({ action: "cover_letter_view", admin }), { who: "Alex Auditor", what: "read the cover letter" });
  assert.deepEqual(describeActivity({ action: "cover_letter_generate", admin, letterVersion: 2, letterSource: "ai" }), { who: "Alex Auditor", what: "created version 2 of the cover letter (written by the AI)" });
  assert.deepEqual(describeActivity({ action: "cover_letter_generate", admin, letterVersion: 1, letterSource: "template" }), { who: "Alex Auditor", what: "created version 1 of the cover letter (from the template)" });
  assert.deepEqual(describeActivity({ action: "cover_letter_edit", admin, letterVersion: 3, letterSource: "admin" }), { who: "Alex Auditor", what: "saved version 3 of the cover letter after editing it" });
  assert.deepEqual(describeActivity({ action: "cover_letter_approve", admin, letterVersion: 3 }), { who: "Alex Auditor", what: "approved version 3 of the cover letter" });
  assert.ok(jumpLinks({ parts: [] }).some((l) => l.href === "#cover-letter"));
});

// ---------------------------------------------------------------------------
// The four service calls
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });
function stubFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new SyntaxError("x"); return body; } };
  };
  return calls;
}
const letterBody = { success: true, data: { versions: [version(1)], latest: 1, stale: false, ai: { available: false, code: "AI_DISABLED" }, maxLength: 8000 } };

test("the service calls: path, method, token and body", async () => {
  let calls = stubFetch(200, letterBody);
  const loaded = await touristVisaService.adminCoverLetter("tok", "a/1");
  assert.equal(loaded.latest, 1);
  assert.match(calls[0].url, /\/admin\/applications\/a%2F1\/cover-letter$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");

  calls = stubFetch(201, letterBody);
  await touristVisaService.adminGenerateCoverLetter("tok", "a1");
  assert.match(calls[0].url, /\/admin\/applications\/a1\/cover-letter\/generate$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, undefined, "generating sends nothing about the application");

  calls = stubFetch(201, letterBody);
  await touristVisaService.adminSaveCoverLetter("tok", "a1", { text: "New text", basedOnVersion: 1 });
  assert.match(calls[0].url, /\/admin\/applications\/a1\/cover-letter$/);
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: "New text", basedOnVersion: 1 });

  calls = stubFetch(200, letterBody);
  await touristVisaService.adminApproveCoverLetter("tok", "a1", 1);
  assert.match(calls[0].url, /\/admin\/applications\/a1\/cover-letter\/approve$/);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { version: 1 });
});

test("the service calls keep the server's status and code on a refusal, and reject a strange answer", async () => {
  stubFetch(409, { success: false, code: "LETTER_STALE", message: "x" });
  await assert.rejects(touristVisaService.adminApproveCoverLetter("t", "a", 1), (e) => e instanceof TouristVisaApiError && e.status === 409 && e.code === "LETTER_STALE");
  stubFetch(404, { success: false, code: "FEATURE_CLOSED" });
  await assert.rejects(touristVisaService.adminCoverLetter("t", "a"), (e) => e.status === 404);
  for (const call of [
    () => touristVisaService.adminCoverLetter("t", "a"),
    () => touristVisaService.adminGenerateCoverLetter("t", "a"),
    () => touristVisaService.adminSaveCoverLetter("t", "a", { text: "x", basedOnVersion: 0 }),
    () => touristVisaService.adminApproveCoverLetter("t", "a", 1),
  ]) {
    for (const data of [{}, { versions: "no", stale: false }, { versions: [], stale: "no" }]) {
      stubFetch(200, { success: true, data });
      await assert.rejects(call(), (e) => e.status === 502);
    }
  }
});

// ---------------------------------------------------------------------------
// The component (read from its source)
// ---------------------------------------------------------------------------

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the panel: states, badges, notices and the site's own dialog for approving", () => {
  const panel = source("../components/tourist-visa/CoverLetterPanel.tsx");
  assert.match(panel, /ConfirmDialog/);
  assert.match(panel, /title="Approve this cover letter\?"/);
  assert.match(panel, /Save as new version/);
  assert.match(panel, /Approve this version/);
  assert.match(panel, /Generate cover letter/);
  assert.match(panel, /Generate new version/);
  assert.match(panel, /STALE_BANNER/, "the stale banner");
  assert.match(panel, /Earlier versions/, "the history");
  assert.match(panel, /sourceBadge\(/, "the source badge");
  assert.match(panel, /checkNoticeFor\(latest\.source\)/, "the notice to check every fact, worded for the source");
  assert.match(panel, /text: savedMessage\(next\.latest\)/, "what is said after saving the administrator's own text");
  assert.equal(/\bCHECK_NOTICE\b/.test(panel), false, "the panel never picks the notice itself");
  assert.match(panel, /letterCounter\(/, "the character counter");
  assert.equal(/window\.(alert|confirm|prompt)|\balert\(|\bconfirm\(|\bprompt\(/.test(panel), false, "no native dialog");
  assert.equal(/localStorage|sessionStorage|indexedDB|console\./.test(panel), false, "the letter is kept nowhere in the browser");
});

test("the panel: read once per visit, focus goes to the heading after approving and to the text box after the other actions, a failure shows a sentence", () => {
  const panel = source("../components/tourist-visa/CoverLetterPanel.tsx");
  assert.match(panel, /started\.current === key/);
  assert.match(panel, /if \(kind === "approve"\) headingRef\.current\?\.focus\(\);\s*else focusText\(\);/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /aria-describedby="tv-letter-count"/);
  assert.match(panel, /htmlFor="tv-letter-text"/);
  assert.match(panel, /min-h-11/, "tap targets on a phone");
  assert.match(panel, /w-full sm:w-auto/, "full-width buttons at 375 px");
  assert.match(panel, /LETTER_CHANGED[\s\S]*LETTER_NOT_LATEST[\s\S]*LETTER_STALE[\s\S]*setAttempt/, "the latest letter is reloaded after a clash");
  // The unsaved text is protected before a new version replaces it.
  assert.match(panel, /Replace your unsaved changes\?/);
  // A completed application does not load the letter.
  assert.match(panel, /status === "submitted" \|\| status === "in_review"/);
});

test("the Overview mounts the panel for every application and the service sends no letter anywhere but the four calls", () => {
  const page = source("../app/admin/tourist-visa/[id]/page.tsx");
  assert.match(page, /<CoverLetterPanel[^>]*status=\{application\.status\}/);
  const service = source("../services/touristVisaService.ts");
  assert.equal((service.match(/cover-letter/g) || []).length, 4);
});

// ---------------------------------------------------------------------------
// The message for each state (polish step): the sentence about the AI making mistakes is only for a letter the AI wrote
// ---------------------------------------------------------------------------

const MISTAKES = /mistake/i;
const ALL_CODES = ["AI_DISABLED", "AI_NOT_CONFIGURED", "AI_TERMS_NOT_CONFIRMED", "AI_CIRCUIT_OPEN", "AI_DAILY_LIMIT", "AI_ADMIN_LIMIT", "AI_RATE_LIMITED", "AI_TIMEOUT", "AI_NETWORK", "AI_PROVIDER_REJECTED", "AI_PROVIDER_ERROR", "AI_BAD_RESPONSE", "AI_TRUNCATED", "AI_BANNED_PHRASE", "LETTER_EMPTY", "LETTER_LENGTH", "LETTER_LINK", "LETTER_UNKNOWN_TOKEN", "LETTER_MISSING_TOKEN", "LETTER_NUMBER_NOT_IN_FACTS", "LETTER_DATE_NOT_IN_FACTS"];

test("after saving the administrator's own text the message is plain and says nothing about the AI", () => {
  assert.equal(savedMessage(3), "Saved as version 3. Check every fact before approving.");
  assert.equal(savedMessage(null), "Saved as a new version. Check every fact before approving.");
  assert.equal(MISTAKES.test(savedMessage(3)), false);
  assert.equal(/\bAI\b/.test(savedMessage(3)), false);
  // What Generate reports for a letter that came from an administrator is the same plain message.
  assert.equal(createdMessage({ version: 4, source: "admin" }), "Saved as version 4. Check every fact before approving.");
});

test("the notice above the text: the AI-mistakes sentence for an AI draft only; a template and an edited letter get the plain one", () => {
  assert.match(checkNoticeFor("ai"), /A letter written by the AI can contain mistakes\.$/);
  assert.equal(checkNoticeFor("template"), "Check every fact in this letter against the application's answers before approving.");
  assert.equal(checkNoticeFor("admin"), "Check every fact in this letter against the application's answers before approving.");
  for (const source of ["template", "admin"]) {
    assert.equal(MISTAKES.test(checkNoticeFor(source)), false, source);
    assert.equal(/\bAI\b/.test(checkNoticeFor(source)), false, source);
  }
});

test("every message the panel can show, in every state: only the AI draft's mentions that an AI can make mistakes", () => {
  const withMistakes = [];
  const note = (label, text) => { if (MISTAKES.test(text)) withMistakes.push(label); };
  // After Generate
  note("created: ai", createdMessage({ version: 2, source: "ai" }));
  note("created: admin", createdMessage({ version: 2, source: "admin" }));
  for (const code of ALL_CODES) {
    note(`created: template, ${code}`, createdMessage({ version: 2, source: "template", fallbackReason: code }));
    note(`fallback: ${code}`, fallbackMessage(code));
  }
  note("created: template, no reason", createdMessage({ version: 2, source: "template" }));
  // After saving, and the notice above the text
  note("saved", savedMessage(2));
  for (const source of ["ai", "template", "admin"]) note(`notice above the text: ${source}`, checkNoticeFor(source));
  // Before generating, the banners, the hints and every failure
  for (const ai of [{ available: true }, { available: false, code: "AI_DISABLED" }, { available: false, code: "AI_NOT_CONFIGURED" }, { available: false, code: "AI_TERMS_NOT_CONFIRMED" }, { available: false, code: "AI_CIRCUIT_OPEN" }, { available: false }]) note(`before generating: ${ai.code ?? (ai.available ? "available" : "none")}`, aiLine(ai));
  note("stale banner", STALE_BANNER);
  note("stale help", STALE_HELP);
  const draft = { version: 2, text: "Text", source: "ai", status: "draft" };
  for (const options of [{ latest: draft, text: "Edited", stale: false }, { latest: draft, text: "Text", stale: true }, { latest: { ...draft, status: "approved" }, text: "Text", stale: false }, { latest: { ...draft, text: "[not provided: x]" }, text: "[not provided: x]", stale: false }]) note("approve hint", letterActions({ ...options, busy: false }).approveHint);
  for (const code of ["LETTER_NOT_AVAILABLE", "LETTER_CHANGED", "LETTER_NOT_LATEST", "ALREADY_APPROVED", "LETTER_STALE", "LETTER_HAS_PLACEHOLDERS", "LETTER_NOT_FOUND", "LETTER_UNREADABLE", "COVER_LETTER_UNAVAILABLE", "INVALID_TEXT", "INVALID_REQUEST"]) note(`error: ${code}`, describeLetterError({ status: 409, code }, () => ""));
  assert.deepEqual(withMistakes.sort(), ["created: ai", "notice above the text: ai"], "only the AI draft's two messages mention mistakes");
});

test("the panel and its words: the only place that says an AI can make mistakes is the AI draft's notice", () => {
  const util = source("./touristVisaCoverLetter.ts");
  const panel = source("../components/tourist-visa/CoverLetterPanel.tsx");
  assert.equal((util.match(/mistake/gi) || []).length, 1, "one sentence, in CHECK_NOTICE");
  assert.match(util, /export const CHECK_NOTICE = "[^"]*A letter written by the AI can contain mistakes\."/);
  assert.equal(MISTAKES.test(panel), false, "the component has no such sentence of its own");
  for (const file of ["../components/tourist-visa/CoverLetterPanel.tsx", "./touristVisaAdmin.ts"]) assert.equal(/can contain mistakes|can make mistakes/i.test(source(file)), false, file);
});
