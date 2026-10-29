// Run with: npm run test:unit   (from client/)

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { touristVisaService, TouristVisaApiError, describeError } from "./touristVisaService.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const application = { id: "a1", status: "draft", currentSection: "1", sectionStatus: {}, answers: {} };

/** Replaces fetch with a stub that records the call and answers with the given status and body. */
function stubFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (body === undefined) throw new SyntaxError("not json");
        return body;
      },
    };
  };
  return calls;
}

test("getMyApplication sends the Bearer token to GET /applications/me", async () => {
  const calls = stubFetch(200, { success: true, data: { application } });
  const result = await touristVisaService.getMyApplication("test-token");
  assert.deepEqual(result, application);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/tourist-visa\/applications\/me$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
});

test("a JSON 404 from GET /applications/me means 'not started' and returns null", async () => {
  stubFetch(404, { success: false, message: "You have not started a Tourist Visa application yet." });
  assert.equal(await touristVisaService.getMyApplication("t"), null);
});

test("a bare 404 (no JSON body) is an error, not 'not started'", async () => {
  stubFetch(404, undefined);
  await assert.rejects(() => touristVisaService.getMyApplication("t"), (e) => e instanceof TouristVisaApiError && e.status === 404);
});

test("startApplication POSTs with the Bearer token; 201 means created, 200 means it already existed", async () => {
  let calls = stubFetch(201, { success: true, data: { application } });
  assert.deepEqual(await touristVisaService.startApplication("test-token"), { application, created: true });
  assert.match(calls[0].url, /\/tourist-visa\/applications$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");

  stubFetch(200, { success: true, data: { application } });
  assert.equal((await touristVisaService.startApplication("t")).created, false);
});

test("error statuses keep their code and the server's message", async () => {
  stubFetch(401, { success: false, message: "Invalid or expired token." });
  await assert.rejects(() => touristVisaService.getMyApplication("t"), (e) => e.status === 401 && e.message === "Invalid or expired token.");

  stubFetch(503, { success: false, message: "Secure storage is not configured (FIELD_ENCRYPTION_KEY is missing)." });
  await assert.rejects(() => touristVisaService.startApplication("t"), (e) => e.status === 503);

  stubFetch(500, undefined);
  await assert.rejects(() => touristVisaService.startApplication("t"), (e) => e.status === 500 && /status 500/.test(e.message));
});

test("a success response without an application is treated as an error", async () => {
  stubFetch(200, { success: true, data: {} });
  await assert.rejects(() => touristVisaService.getMyApplication("t"), (e) => e.status === 502);
});

test("a network failure becomes status 0", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(() => touristVisaService.getMyApplication("t"), (e) => e instanceof TouristVisaApiError && e.status === 0);
});

test("describeError gives the applicant a clear message and never exposes server internals", () => {
  const serverDetail = "Secure storage is not configured (FIELD_ENCRYPTION_KEY is missing).";
  const unavailable = describeError(new TouristVisaApiError(503, serverDetail));
  assert.match(unavailable, /temporarily unavailable/);
  assert.equal(unavailable.includes("FIELD_ENCRYPTION_KEY"), false);

  assert.match(describeError(new TouristVisaApiError(0, "x")), /couldn't reach the server/);
  assert.match(describeError(new TouristVisaApiError(429, "x")), /Too many requests/);
  assert.match(describeError(new TouristVisaApiError(500, "stack trace")), /Something went wrong on our side/);
  assert.equal(describeError(new TouristVisaApiError(409, "This application has been submitted.")), "This application has been submitted.");
  assert.match(describeError(new Error("boom")), /Something went wrong/);
  assert.match(describeError(undefined), /Something went wrong/);
});

// ---------------------------------------------------------------------------
// saveSection
// ---------------------------------------------------------------------------

test("saveSection PUTs { answers } as JSON with the Bearer token and returns the saved application", async () => {
  const calls = stubFetch(200, { success: true, data: { application, needsReview: ["2B"], removed: ["q2_7"] } });
  const answers = { q1_5: "Visit <b>Test</b> City if 2 < 3" };
  const result = await touristVisaService.saveSection("test-token", "1", answers);

  assert.deepEqual(result, { application, needsReview: ["2B"], removed: ["q2_7"] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/tourist-visa\/applications\/me\/sections\/1$/);
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { answers }, "free text goes through unchanged");
});

test("saveSection encodes the section id and defaults the optional result fields", async () => {
  const calls = stubFetch(200, { success: true, data: { application } });
  const result = await touristVisaService.saveSection("t", "2A/../x", {});
  assert.match(calls[0].url, /\/sections\/2A%2F\.\.%2Fx$/);
  assert.deepEqual([result.needsReview, result.removed], [[], []]);
});

test("a 422 carries the per-question errors from the server", async () => {
  const errors = { q1_7: "Must be after the date in question 1.6", "q2_24.line1": "This question is required" };
  stubFetch(422, { success: false, message: "Some answers need attention.", errors });
  await assert.rejects(
    () => touristVisaService.saveSection("t", "1", {}),
    (e) => e instanceof TouristVisaApiError && e.status === 422 && e.message === "Some answers need attention." && JSON.stringify(e.fieldErrors) === JSON.stringify(errors)
  );
});

test("only string messages are accepted as field errors", async () => {
  stubFetch(422, { success: false, message: "x", errors: { q1_7: "ok", q1_6: { nested: true }, q1_5: 5, q1_4: null } });
  await assert.rejects(() => touristVisaService.saveSection("t", "1", {}), (e) => JSON.stringify(e.fieldErrors) === JSON.stringify({ q1_7: "ok" }));

  stubFetch(422, { success: false, message: "x", errors: ["not", "a map"] });
  await assert.rejects(() => touristVisaService.saveSection("t", "1", {}), (e) => e.fieldErrors === undefined);

  stubFetch(422, { success: false, message: "x" });
  await assert.rejects(() => touristVisaService.saveSection("t", "1", {}), (e) => e.fieldErrors === undefined);
});

test("saveSection maps locked, unavailable, unauthorised and unreachable cases", async () => {
  stubFetch(409, { success: false, message: "This application has been submitted and can no longer be edited." });
  await assert.rejects(() => touristVisaService.saveSection("t", "1", {}), (e) => e.status === 409 && describeError(e) === e.message);

  stubFetch(503, { success: false, message: "Secure storage is not configured (FIELD_ENCRYPTION_KEY is missing)." });
  await assert.rejects(() => touristVisaService.saveSection("t", "1", {}), (e) => e.status === 503 && /temporarily unavailable/.test(describeError(e)));

  stubFetch(401, { success: false, message: "Invalid or expired token." });
  await assert.rejects(() => touristVisaService.saveSection("t", "1", {}), (e) => e.status === 401);

  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(() => touristVisaService.saveSection("t", "1", {}), (e) => e.status === 0 && /couldn't reach the server/.test(describeError(e)));
});

test("the service never writes answers to the console or to storage", async () => {
  const seen = [];
  const originals = {};
  for (const m of ["log", "info", "warn", "error", "debug"]) {
    originals[m] = console[m];
    console[m] = (...args) => seen.push(args);
  }
  globalThis.localStorage = { setItem: (...a) => seen.push(a), getItem: () => null };
  try {
    stubFetch(422, { success: false, message: "x", errors: { q1_5: "bad" } });
    await assert.rejects(() => touristVisaService.saveSection("t", "1", { q1_5: "SECRET-ANSWER-TEXT" }));
    stubFetch(200, { success: true, data: { application } });
    await touristVisaService.saveSection("t", "1", { q1_5: "SECRET-ANSWER-TEXT" });
  } finally {
    Object.assign(console, originals);
    delete globalThis.localStorage;
  }
  assert.equal(JSON.stringify(seen).includes("SECRET-ANSWER-TEXT"), false);
  assert.equal(seen.length, 0);
});
