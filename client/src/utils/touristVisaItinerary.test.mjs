// Run with: npm run test:unit   (from client/). The itinerary panel's logic and words, the four service calls, and what the component
// does (read from its source). All made-up data.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aiLine,
  AI_CAVEAT,
  blockerMessage,
  canSaveItinerary,
  checkNoticeFor,
  createdMessage,
  DEFAULT_MAX_ITINERARY,
  describeItineraryError,
  fallbackMessage,
  itineraryActions,
  itineraryCounter,
  PLAN_NOTICE,
  savedMessage,
  sourceBadge,
  STALE_BANNER,
  STALE_HELP,
  versionTitle,
} from "./touristVisaItinerary.ts";
import { describeActivity, describeAdminError, jumpLinks } from "./touristVisaAdmin.ts";
import { touristVisaService, TouristVisaApiError } from "../services/touristVisaService.ts";

const admin = { id: "a1", name: "Alex Auditor" };
const version = (n, extra = {}) => ({ version: n, text: `Itinerary text ${n}`, source: "ai", model: "m", createdAt: "2026-11-03T10:00:00Z", createdBy: admin, status: "draft", ...extra });
const MISTAKES = /mistake/i;
const ALL_CODES = [
  "AI_DISABLED", "AI_NOT_CONFIGURED", "AI_TERMS_NOT_CONFIRMED", "AI_CIRCUIT_OPEN", "AI_DAILY_LIMIT", "AI_ADMIN_LIMIT", "AI_RATE_LIMITED", "AI_TIMEOUT", "AI_NETWORK", "AI_PROVIDER_REJECTED", "AI_PROVIDER_ERROR", "AI_BAD_RESPONSE", "AI_TRUNCATED",
  "ITINERARY_BAD_JSON", "ITINERARY_WRONG_COUNT", "ITINERARY_BAD_ENTRY", "ITINERARY_FORBIDDEN_CONTENT", "ITINERARY_BANNED_PHRASE", "ITINERARY_PLACE_NOT_NAMED", "ITINERARY_PLACE_ORDER",
];

test("badges: the three sources read AI draft, Template draft and Edited by admin", () => {
  assert.deepEqual(["ai", "template", "admin"].map((s) => sourceBadge(s).label), ["AI draft", "Template draft", "Edited by admin"]);
  assert.equal(versionTitle(version(3)), "Version 3, AI draft");
  assert.equal(versionTitle(version(2, { source: "admin", status: "approved" })), "Version 2, Edited by admin, approved");
});

test("a plain message for every reason the AI was not used (every code the server can store), and none shows the code or what the AI said", () => {
  for (const code of ALL_CODES) {
    const words = fallbackMessage(code);
    assert.match(words, /template itinerary was created/, code);
    assert.equal(/AI_|ITINERARY_/.test(words), false, `${code} must not show the code`);
  }
  assert.equal(fallbackMessage("AI_NETWORK"), "The AI was not available, so a template itinerary was created.");
  assert.equal(fallbackMessage(undefined), "The AI was not available, so a template itinerary was created.");
  assert.match(fallbackMessage("AI_DAILY_LIMIT"), /limit/);
  assert.match(fallbackMessage("ITINERARY_BANNED_PHRASE"), /wording that is not allowed, even after a second try/);
  assert.match(fallbackMessage("ITINERARY_BAD_JSON"), /not in the form needed/);
  assert.match(fallbackMessage("ITINERARY_PLACE_ORDER"), /did not match what the applicant described/);
});

test("what is said after Generate: an AI draft with the notice, or the reason for a template", () => {
  assert.match(createdMessage({ version: 2, source: "ai" }), /^AI draft created \(version 2\)\. This is a proposed plan, not a booking\./);
  assert.equal(createdMessage({ version: 1, source: "template", fallbackReason: "AI_DISABLED" }), "The AI is switched off, so a template itinerary was created. (Version 1.)");
  assert.match(createdMessage({ version: 4, source: "template", fallbackReason: "AI_TIMEOUT" }), /took too long/);
  assert.equal(PLAN_NOTICE, "This is a proposed plan, not a booking. Check it against the application's answers before approving.");
  assert.equal(PLAN_NOTICE.includes("AI"), false, "a template or hand-written plan is not called an AI plan");
});

test("the AI line before generating says whether the AI will be used, and that names and money are not sent", () => {
  assert.match(aiLine({ available: true }), /drafted by the AI.*Names, contact details and money are not sent/);
  assert.equal(aiLine({ available: false, code: "AI_DISABLED" }), "The AI is switched off. A new version will be a template itinerary.");
  assert.match(aiLine({ available: false, code: "AI_CIRCUIT_OPEN" }), /paused after repeated problems/);
  assert.match(aiLine({ available: false }), /not available right now/);
});

test("the counter: words, characters and the limit; over the limit is flagged", () => {
  assert.deepEqual(itineraryCounter("one two  three"), { characters: 14, words: 3, over: false, label: "3 words, 14 of 8,000 characters" });
  assert.equal(itineraryCounter("").label, "0 words, 0 of 8,000 characters");
  assert.equal(itineraryCounter("word").label, "1 word, 4 of 8,000 characters");
  assert.equal(itineraryCounter("a".repeat(8001)).over, true);
  assert.equal(itineraryCounter("a".repeat(8000)).over, false);
  assert.equal(itineraryCounter("a\r\nb").characters, 3, "a line break counts once, as the server stores it");
  assert.equal(itineraryCounter("abc", 2).over, true);
  assert.equal(DEFAULT_MAX_ITINERARY, 8000);
});

test("saving: needs words, fits, and must differ from the newest version", () => {
  assert.deepEqual(canSaveItinerary("", null), { ok: false, message: "Write the itinerary first." });
  assert.deepEqual(canSaveItinerary("   \n ", "x"), { ok: false, message: "Write the itinerary first." });
  assert.equal(canSaveItinerary("a".repeat(8001), null).ok, false);
  assert.match(canSaveItinerary("a".repeat(8001), null).message, /at most 8,000 characters/);
  assert.equal(canSaveItinerary("Hand written", null).ok, true, "a first itinerary by hand");
  assert.equal(canSaveItinerary("Same text\r\n", "Same text").ok, false, "unchanged is not a new version");
  assert.equal(canSaveItinerary("Same text, changed", "Same text").ok, true);
});

test("which buttons are on: save only for a real change, approve only for a clean, current draft, generate not while the dates block it", () => {
  const draft = version(2);
  const base = { latest: draft, text: draft.text, stale: false, busy: false, blocked: false };
  let a = itineraryActions(base);
  assert.deepEqual([a.canGenerate, a.canSave, a.canApprove, a.approveHint], [true, false, true, ""]);

  a = itineraryActions({ ...base, text: "Edited text" });
  assert.deepEqual([a.canSave, a.canApprove], [true, false]);
  assert.match(a.approveHint, /Save your changes as a new version first/);

  a = itineraryActions({ ...base, stale: true });
  assert.equal(a.canApprove, false);
  assert.match(a.approveHint, /new version/);

  const approved = version(2, { status: "approved" });
  a = itineraryActions({ ...base, latest: approved, text: approved.text });
  assert.equal(a.canApprove, false);
  assert.equal(a.approveHint, "This version is approved.");

  a = itineraryActions({ ...base, busy: true, text: "Edited" });
  assert.deepEqual([a.canGenerate, a.canSave, a.canApprove], [false, false, false], "nothing while a request is running");

  a = itineraryActions({ latest: null, text: "A first itinerary", stale: false, busy: false, blocked: false });
  assert.deepEqual([a.canGenerate, a.canSave, a.canApprove], [true, true, false], "no itinerary yet: generate, or write one by hand");

  // Missing dates: generating is off, but writing and saving by hand still work, and so does approving a current draft.
  a = itineraryActions({ latest: null, text: "By hand", stale: false, busy: false, blocked: true });
  assert.deepEqual([a.canGenerate, a.canSave], [false, true]);
  a = itineraryActions({ ...base, blocked: true });
  assert.deepEqual([a.canGenerate, a.canApprove], [false, true]);
  assert.equal(STALE_BANNER, "Answers used by the itinerary have changed.");
  assert.match(STALE_HELP, /new version/);
});

test("the dates that block an itinerary: the panel says which questions to fix, with the numbers the server sent", () => {
  assert.equal(
    blockerMessage({ code: "ITINERARY_DATES_MISSING", questions: ["1.6", "1.7"] }),
    "An itinerary cannot be made yet: question 1.6 (the arrival date) and question 1.7 (the departure date) have no answer. Add them with the Edit button of section 1 below, then create the itinerary."
  );
  assert.match(blockerMessage({ code: "ITINERARY_DATES_MISSING", questions: ["1.7"] }), /question 1\.7 \(the departure date\) has no answer\. Add it with/);
  assert.match(blockerMessage({ code: "ITINERARY_DATES_INVALID", questions: ["1.6", "1.7"] }), /departure must not be before the arrival.*at most six months.*question 1\.6.*question 1\.7/);
  assert.equal(/ITINERARY_/.test(blockerMessage({ code: "ITINERARY_DATES_INVALID", questions: ["1.6", "1.7"] })), false);
});

test("a plain sentence for every way an itinerary call can fail, never the code or anything the server holds", () => {
  const codes = ["ITINERARY_NOT_AVAILABLE", "ITINERARY_DATES_MISSING", "ITINERARY_DATES_INVALID", "ITINERARY_CHANGED", "ITINERARY_NOT_LATEST", "ALREADY_APPROVED", "ITINERARY_STALE", "ITINERARY_NOT_FOUND", "ITINERARY_UNREADABLE", "ITINERARY_UNAVAILABLE", "INVALID_TEXT", "INVALID_REQUEST"];
  const seen = new Set();
  for (const code of codes) {
    const words = describeItineraryError({ status: 409, code }, describeAdminError);
    assert.equal(/[A-Z]{3,}_[A-Z_]+/.test(words), false, code);
    assert.ok(words.length > 20, code);
    seen.add(words);
  }
  assert.ok(seen.size >= 9, "different words for different problems");
  assert.match(describeItineraryError({ status: 409, code: "ITINERARY_CHANGED" }, describeAdminError), /changed by someone else/);
  assert.match(describeItineraryError({ status: 422, code: "ITINERARY_DATES_MISSING", questions: ["1.7"] }, describeAdminError), /question 1\.7/);
  // Anything else falls back to the ordinary admin wording.
  assert.equal(describeItineraryError({ status: 0 }, describeAdminError), "We couldn't reach the server. Check your internet connection and try again.");
  assert.equal(describeItineraryError({ status: 403 }, describeAdminError), "You do not have access to this page.");
  assert.equal(describeItineraryError({ status: 404, code: "APPLICATION_NOT_FOUND" }, describeAdminError), "That application could not be found. It may not have been submitted.");
  assert.equal(describeItineraryError({ status: 404, closed: true }, describeAdminError), "The Tourist Visa application isn't open right now.");
});

test("the Activity panel and the jump list know the itinerary", () => {
  assert.deepEqual(describeActivity({ action: "itinerary_view", admin }), { who: "Alex Auditor", what: "read the itinerary" });
  // Rows written with the plain names (version, source).
  assert.deepEqual(describeActivity({ action: "itinerary_generate", admin, version: 2, source: "ai" }), { who: "Alex Auditor", what: "created version 2 of the itinerary (written by the AI)" });
  assert.deepEqual(describeActivity({ action: "itinerary_generate", admin, version: 1, source: "template" }), { who: "Alex Auditor", what: "created version 1 of the itinerary (from the template)" });
  assert.deepEqual(describeActivity({ action: "itinerary_edit", admin, version: 3, source: "admin" }), { who: "Alex Auditor", what: "saved version 3 of the itinerary after editing it" });
  assert.deepEqual(describeActivity({ action: "itinerary_approve", admin, version: 3 }), { who: "Alex Auditor", what: "approved version 3 of the itinerary" });
  // Rows already in the database, written with the old names (letterVersion, letterSource), read the same.
  assert.deepEqual(describeActivity({ action: "itinerary_generate", admin, letterVersion: 2, letterSource: "ai" }), { who: "Alex Auditor", what: "created version 2 of the itinerary (written by the AI)" });
  assert.deepEqual(describeActivity({ action: "itinerary_generate", admin, letterVersion: 1, letterSource: "template" }), { who: "Alex Auditor", what: "created version 1 of the itinerary (from the template)" });
  assert.deepEqual(describeActivity({ action: "itinerary_edit", admin, letterVersion: 3, letterSource: "admin" }), { who: "Alex Auditor", what: "saved version 3 of the itinerary after editing it" });
  assert.deepEqual(describeActivity({ action: "itinerary_approve", admin, letterVersion: 3 }), { who: "Alex Auditor", what: "approved version 3 of the itinerary" });
  // The plain names win when a row has both, and a row with neither still has a line.
  assert.deepEqual(describeActivity({ action: "itinerary_generate", admin, version: 4, source: "admin", letterVersion: 9, letterSource: "ai" }), { who: "Alex Auditor", what: "created version 4 of the itinerary (written by hand)" });
  assert.deepEqual(describeActivity({ action: "itinerary_generate", admin }), { who: "Alex Auditor", what: "created the itinerary" });
  // The cover letter's rows are read exactly as they were, by their own names only.
  assert.deepEqual(describeActivity({ action: "cover_letter_generate", admin, letterVersion: 2, letterSource: "ai" }), { who: "Alex Auditor", what: "created version 2 of the cover letter (written by the AI)" });
  assert.deepEqual(describeActivity({ action: "cover_letter_generate", admin, version: 2, source: "ai" }), { who: "Alex Auditor", what: "created the cover letter" });
  const links = jumpLinks({ parts: [] }).map((l) => l.href);
  assert.ok(links.indexOf("#itinerary") === links.indexOf("#cover-letter") + 1, "the Itinerary link is right after the Cover letter");
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
const itineraryBody = { success: true, data: { versions: [version(1)], latest: 1, stale: false, ai: { available: false, code: "AI_DISABLED" }, maxLength: 8000, blocker: null } };

test("the service calls: path, method, token and body", async () => {
  let calls = stubFetch(200, itineraryBody);
  const loaded = await touristVisaService.adminItinerary("tok", "a/1");
  assert.equal(loaded.latest, 1);
  assert.equal(loaded.blocker, null);
  assert.match(calls[0].url, /\/admin\/applications\/a%2F1\/itinerary$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");

  calls = stubFetch(201, itineraryBody);
  await touristVisaService.adminGenerateItinerary("tok", "a1");
  assert.match(calls[0].url, /\/admin\/applications\/a1\/itinerary\/generate$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, undefined, "generating sends nothing about the application");

  calls = stubFetch(201, itineraryBody);
  await touristVisaService.adminSaveItinerary("tok", "a1", { text: "New text", basedOnVersion: 1 });
  assert.match(calls[0].url, /\/admin\/applications\/a1\/itinerary$/);
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: "New text", basedOnVersion: 1 });

  calls = stubFetch(200, itineraryBody);
  await touristVisaService.adminApproveItinerary("tok", "a1", 1);
  assert.match(calls[0].url, /\/admin\/applications\/a1\/itinerary\/approve$/);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { version: 1 });

  // The blocker the server sends is kept, and a view without one is "not blocked".
  stubFetch(200, { success: true, data: { ...itineraryBody.data, blocker: { code: "ITINERARY_DATES_MISSING", questions: ["1.6"] } } });
  assert.deepEqual((await touristVisaService.adminItinerary("t", "a")).blocker, { code: "ITINERARY_DATES_MISSING", questions: ["1.6"] });
  const withoutBlocker = { ...itineraryBody.data };
  delete withoutBlocker.blocker;
  stubFetch(200, { success: true, data: withoutBlocker });
  assert.equal((await touristVisaService.adminItinerary("t", "a")).blocker, null);
});

test("the service calls keep the server's status and code on a refusal, and reject a strange answer", async () => {
  stubFetch(409, { success: false, code: "ITINERARY_STALE", message: "x" });
  await assert.rejects(touristVisaService.adminApproveItinerary("t", "a", 1), (e) => e instanceof TouristVisaApiError && e.status === 409 && e.code === "ITINERARY_STALE");
  stubFetch(422, { success: false, code: "ITINERARY_DATES_MISSING", message: "x", questions: ["1.6", "1.7"] });
  await assert.rejects(touristVisaService.adminGenerateItinerary("t", "a"), (e) => e.status === 422 && e.code === "ITINERARY_DATES_MISSING");
  stubFetch(404, { success: false, code: "FEATURE_CLOSED" });
  await assert.rejects(touristVisaService.adminItinerary("t", "a"), (e) => e.status === 404);
  for (const call of [
    () => touristVisaService.adminItinerary("t", "a"),
    () => touristVisaService.adminGenerateItinerary("t", "a"),
    () => touristVisaService.adminSaveItinerary("t", "a", { text: "x", basedOnVersion: 0 }),
    () => touristVisaService.adminApproveItinerary("t", "a", 1),
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

test("the panel: states, badges, notices, the plain 'proposed plan' notice and the site's own dialog for approving", () => {
  const panel = source("../components/tourist-visa/ItineraryPanel.tsx");
  assert.match(panel, /ConfirmDialog/);
  assert.ok(panel.includes("onClick={() => setConfirmApprove(true)}"), "the Approve button only opens the question");
  assert.ok(panel.includes("{view.blocker && ("), "the dates message is shown whenever the server sends one");
  assert.match(panel, /title="Approve this itinerary\?"/);
  assert.match(panel, /not a booking: check first that it matches the application's answers/);
  assert.match(panel, /Save as new version/);
  assert.match(panel, /Approve this version/);
  assert.match(panel, /Generate itinerary/);
  assert.match(panel, /Generate new version/);
  assert.match(panel, /STALE_BANNER/, "the stale banner");
  assert.match(panel, /Earlier versions/, "the history");
  assert.match(panel, /sourceBadge\(/, "the source badge");
  assert.match(panel, /checkNoticeFor\(latest\.source\)/, "the notice worded for the source");
  assert.match(panel, /PLAN_NOTICE/, "the proposed-plan notice before the first one is made");
  assert.match(panel, /text: savedMessage\(next\.latest\)/, "what is said after saving the administrator's own text");
  assert.match(panel, /blockerMessage\(view\.blocker\)/, "the dates that block an itinerary are explained");
  assert.match(panel, /blocked = Boolean\(view\?\.blocker\)/);
  assert.match(panel, /itineraryCounter\(/, "the character counter");
  assert.equal(/window\.(alert|confirm|prompt)|\balert\(|\bconfirm\(|\bprompt\(/.test(panel), false, "no native dialog");
  assert.equal(/localStorage|sessionStorage|indexedDB|console\./.test(panel), false, "the itinerary is kept nowhere in the browser");
});

test("the panel: read once per visit, focus goes to the heading after approving and to the text box after the other actions, a failure shows a sentence", () => {
  const panel = source("../components/tourist-visa/ItineraryPanel.tsx");
  assert.match(panel, /started\.current === key/);
  assert.match(panel, /if \(kind === "approve"\) headingRef\.current\?\.focus\(\);\s*else focusText\(\);/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /aria-describedby="tv-itinerary-count"/);
  assert.match(panel, /htmlFor="tv-itinerary-text"/);
  assert.match(panel, /min-h-11/, "tap targets on a phone");
  assert.match(panel, /w-full sm:w-auto/, "full-width buttons at 375 px");
  assert.match(panel, /ITINERARY_CHANGED[\s\S]*ITINERARY_NOT_LATEST[\s\S]*ITINERARY_STALE[\s\S]*ITINERARY_DATES_MISSING[\s\S]*setAttempt/, "the latest itinerary is reloaded after a clash");
  assert.match(panel, /Replace your unsaved changes\?/);
  assert.match(panel, /status === "submitted" \|\| status === "in_review"/);
  assert.match(panel, /id="itinerary"/, "the jump link lands here");
});

test("the Overview mounts the itinerary panel right after the cover letter panel, and the service sends no itinerary anywhere but the four calls", () => {
  const page = source("../app/admin/tourist-visa/[id]/page.tsx");
  assert.match(page, /<ItineraryPanel[^>]*status=\{application\.status\}/);
  assert.ok(page.indexOf("<CoverLetterPanel") < page.indexOf("<ItineraryPanel") && page.indexOf("<ItineraryPanel") < page.indexOf('aria-label="Jump to a section"'));
  const service = source("../services/touristVisaService.ts");
  assert.equal((service.match(/\/itinerary/g) || []).length, 4);
  assert.equal((service.match(/cover-letter/g) || []).length, 4, "the cover letter calls are unchanged");
});

// ---------------------------------------------------------------------------
// The sentence about the AI making mistakes is only for a draft the AI wrote
// ---------------------------------------------------------------------------

test("after saving the administrator's own text the message is plain and says nothing about the AI", () => {
  assert.equal(savedMessage(3), "Saved as version 3. Check it against the application before approving.");
  assert.equal(savedMessage(null), "Saved as a new version. Check it against the application before approving.");
  assert.equal(MISTAKES.test(savedMessage(3)), false);
  assert.equal(/\bAI\b/.test(savedMessage(3)), false);
  assert.equal(createdMessage({ version: 4, source: "admin" }), "Saved as version 4. Check it against the application before approving.");
});

test("the notice above the text: the AI-mistakes sentence for an AI draft only; a template and an edited plan get the plain one", () => {
  assert.equal(checkNoticeFor("ai"), `${PLAN_NOTICE} ${AI_CAVEAT}`);
  assert.match(checkNoticeFor("ai"), /A plan written by the AI can contain mistakes\.$/);
  assert.equal(checkNoticeFor("template"), PLAN_NOTICE);
  assert.equal(checkNoticeFor("admin"), PLAN_NOTICE);
  for (const s of ["template", "admin"]) {
    assert.equal(MISTAKES.test(checkNoticeFor(s)), false, s);
    assert.equal(/\bAI\b/.test(checkNoticeFor(s)), false, s);
  }
});

test("every message the panel can show, in every state: only the AI draft's mention that an AI can make mistakes", () => {
  const withMistakes = [];
  const note = (label, text) => { if (MISTAKES.test(text)) withMistakes.push(label); };
  note("created: ai", createdMessage({ version: 2, source: "ai" }));
  note("created: admin", createdMessage({ version: 2, source: "admin" }));
  for (const code of ALL_CODES) {
    note(`created: template, ${code}`, createdMessage({ version: 2, source: "template", fallbackReason: code }));
    note(`fallback: ${code}`, fallbackMessage(code));
  }
  note("created: template, no reason", createdMessage({ version: 2, source: "template" }));
  note("saved", savedMessage(2));
  note("plan notice", PLAN_NOTICE);
  for (const s of ["ai", "template", "admin"]) note(`notice above the text: ${s}`, checkNoticeFor(s));
  for (const ai of [{ available: true }, { available: false, code: "AI_DISABLED" }, { available: false, code: "AI_NOT_CONFIGURED" }, { available: false, code: "AI_TERMS_NOT_CONFIRMED" }, { available: false, code: "AI_CIRCUIT_OPEN" }, { available: false }]) note(`before generating: ${ai.code ?? (ai.available ? "available" : "none")}`, aiLine(ai));
  note("stale banner", STALE_BANNER);
  note("stale help", STALE_HELP);
  for (const code of ["ITINERARY_DATES_MISSING", "ITINERARY_DATES_INVALID"]) note(`blocker: ${code}`, blockerMessage({ code, questions: ["1.6", "1.7"] }));
  const draft = { version: 2, text: "Text", source: "ai", status: "draft" };
  for (const options of [{ latest: draft, text: "Edited", stale: false }, { latest: draft, text: "Text", stale: true }, { latest: { ...draft, status: "approved" }, text: "Text", stale: false }]) note("approve hint", itineraryActions({ ...options, busy: false, blocked: false }).approveHint);
  for (const code of ["ITINERARY_NOT_AVAILABLE", "ITINERARY_CHANGED", "ITINERARY_NOT_LATEST", "ALREADY_APPROVED", "ITINERARY_STALE", "ITINERARY_NOT_FOUND", "ITINERARY_UNREADABLE", "INVALID_TEXT", "INVALID_REQUEST"]) note(`error: ${code}`, describeItineraryError({ status: 409, code }, () => ""));
  assert.deepEqual(withMistakes.sort(), ["created: ai", "notice above the text: ai"], "only the AI draft's two messages mention mistakes");
});

test("the panel and its words: the only place that says an AI can make mistakes is the AI draft's notice", () => {
  const util = source("./touristVisaItinerary.ts");
  const panel = source("../components/tourist-visa/ItineraryPanel.tsx");
  assert.equal((util.match(/mistake/gi) || []).length, 1, "one sentence, in AI_CAVEAT");
  assert.match(util, /export const AI_CAVEAT = "A plan written by the AI can contain mistakes\."/);
  assert.equal(MISTAKES.test(panel), false, "the component has no such sentence of its own");
  assert.equal(/can contain mistakes|can make mistakes/i.test(source("./touristVisaAdmin.ts")), false);
});

test("the proposed-plan notice never promises or suggests a booking", () => {
  const all = [PLAN_NOTICE, ...ALL_CODES.map(fallbackMessage), aiLine({ available: true }), blockerMessage({ code: "ITINERARY_DATES_MISSING", questions: ["1.6"] })].join(" ");
  assert.equal(/guarantee|confirmed|reserved|ticket|flight|hotel/i.test(all), false);
  assert.match(PLAN_NOTICE, /not a booking/);
});
