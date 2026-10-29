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
