// Run with: npm run test:unit   (from client/). The client follows the SERVER's Tourist Visa switch: what it asks, how it
// reads the answer (anything but a clear "open" is closed), how long it remembers it, and how that combines with this
// build's own hold. All made-up data; no network.

import test from "node:test";
import assert from "node:assert/strict";
import { createOpenChecker, readStatusAnswer, DEFAULT_TTL_MS, DEFAULT_ERROR_TTL_MS, DEFAULT_TIMEOUT_MS } from "./touristVisaOpen.ts";
import { availabilityOf, isFormOpen } from "./touristVisaChecklist.ts";
import { fetchServerStatus } from "../services/touristVisaService.ts";
import { readFileSync } from "node:fs";

/** A fake clock and a fake server that counts how often it was asked. */
function rig({ answers, ...options } = {}) {
  let time = 1_000_000;
  const queue = [...(answers ?? [])];
  const calls = { n: 0, signals: [] };
  const fetchStatus = async (signal) => {
    calls.n += 1;
    calls.signals.push(signal);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof next === "function") return next(signal);
    if (next instanceof Error) throw next;
    return next;
  };
  const checker = createOpenChecker({ fetchStatus, now: () => time, ...options });
  return { checker, calls, advance: (ms) => { time += ms; } };
}
const OPEN = { status: 200, json: { open: true } };
const CLOSED = { status: 200, json: { open: false } };

test("readStatusAnswer: open only for a 200 whose body has open exactly true; everything else is closed", () => {
  assert.equal(readStatusAnswer(200, { open: true }), "open");
  assert.equal(readStatusAnswer(200, { open: false }), "closed");
  for (const json of [null, undefined, "open", "true", 1, true, [], [true], {}, { open: "true" }, { open: 1 }, { open: null }, { Open: true }, { opened: true }, { data: { open: true } }]) {
    assert.equal(readStatusAnswer(200, json), "closed", JSON.stringify(json));
  }
  for (const status of [0, 201, 204, 301, 304, 400, 401, 403, 404, 429, 500, 502, 503]) assert.equal(readStatusAnswer(status, { open: true }), "closed", String(status));
});

test("the checker: open and closed answers come through", async () => {
  assert.equal(await rig({ answers: [OPEN] }).checker.check(), "open");
  assert.equal(await rig({ answers: [CLOSED] }).checker.check(), "closed");
});

test("the checker: a network error is closed, and never rejects", async () => {
  const { checker } = rig({ answers: [new TypeError("Failed to fetch")] });
  assert.equal(await checker.check(), "closed");
});

test("the checker: an odd answer (a 500, a 404, an HTML page, a wrong shape) is closed", async () => {
  for (const answer of [{ status: 500, json: { open: true } }, { status: 404, json: { success: false, code: "FEATURE_CLOSED" } }, { status: 200, json: null }, { status: 200, json: "<html>" }, { status: 200, json: { open: "yes" } }]) {
    assert.equal(await rig({ answers: [answer] }).checker.check(), "closed", JSON.stringify(answer));
  }
});

test("the checker: a server that never answers is closed after the timeout, and the ask is aborted", async () => {
  const hang = (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const { checker, calls } = rig({ answers: [hang], timeoutMs: 30 });
  const started = Date.now();
  assert.equal(await checker.check(), "closed");
  assert.ok(Date.now() - started < 2000, "it did not wait for ever");
  assert.equal(calls.signals[0].aborted, true, "the request was cancelled");
});

test("the checker: even a fetcher that ignores the abort cannot hold it up", async () => {
  const deaf = () => new Promise(() => {});
  assert.equal(await rig({ answers: [deaf], timeoutMs: 30 }).checker.check(), "closed");
});

test("the checker: a late answer after the timeout does not turn closed into open", async () => {
  const slow = () => new Promise((resolve) => setTimeout(() => resolve(OPEN), 120));
  const { checker } = rig({ answers: [slow], timeoutMs: 30 });
  assert.equal(await checker.check(), "closed");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(checker.peek(), "closed");
});

test("caching: an answer is reused while fresh, so one page load asks once", async () => {
  const { checker, calls, advance } = rig({ answers: [OPEN] });
  assert.equal(checker.peek(), "unknown", "before any answer it is unknown, never open");
  assert.equal(await checker.check(), "open");
  assert.equal(checker.peek(), "open");
  advance(DEFAULT_TTL_MS - 1);
  assert.equal(await checker.check(), "open");
  assert.equal(await checker.check(), "open");
  assert.equal(calls.n, 1);
});

test("caching: it asks again once the answer has expired, and a changed answer is picked up", async () => {
  const { checker, calls, advance } = rig({ answers: [OPEN, CLOSED] });
  assert.equal(await checker.check(), "open");
  advance(DEFAULT_TTL_MS);
  assert.equal(checker.peek(), "unknown", "an expired answer is not shown");
  assert.equal(await checker.check(), "closed");
  assert.equal(calls.n, 2);
});

test("caching: several components asking at the same moment share one ask", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { checker, calls } = rig({ answers: [() => gate.then(() => OPEN)] });
  const asks = [checker.check(), checker.check(), checker.check()];
  release();
  assert.deepEqual(await Promise.all(asks), ["open", "open", "open"]);
  assert.equal(calls.n, 1);
});

test("caching: a failed ask is remembered only briefly, so a recovered server is noticed soon", async () => {
  const { checker, calls, advance } = rig({ answers: [new TypeError("offline"), OPEN] });
  assert.equal(await checker.check(), "closed");
  assert.equal(await checker.check(), "closed");
  assert.equal(calls.n, 1, "not asked again straight away");
  advance(DEFAULT_ERROR_TTL_MS);
  assert.equal(await checker.check(), "open");
  assert.ok(DEFAULT_ERROR_TTL_MS < DEFAULT_TTL_MS);
  assert.equal(DEFAULT_TIMEOUT_MS > 0, true);
});

test("reset forgets the answer", async () => {
  const { checker, calls } = rig({ answers: [OPEN] });
  await checker.check();
  checker.reset();
  assert.equal(checker.peek(), "unknown");
  await checker.check();
  assert.equal(calls.n, 2);
});

test("availabilityOf: open only when the server says open AND this build's hold passes (or preview is on); unknown is loading, never open", () => {
  // server open
  assert.equal(availabilityOf("open", 0, false), "open");
  assert.equal(availabilityOf("open", 3, false), "closed", "a section is held by a tbc or draft: closed even though the server is open");
  assert.equal(availabilityOf("open", 3, true), "open", "preview mode overrides the hold, as before");
  assert.equal(availabilityOf("open", 0, true), "open");
  // server closed
  for (const [held, preview] of [[0, false], [3, false], [0, true], [3, true]]) assert.equal(availabilityOf("closed", held, preview), "closed", `closed server, held ${held}, preview ${preview}`);
  // server not answered yet
  assert.equal(availabilityOf("unknown", 0, false), "loading");
  assert.equal(availabilityOf("unknown", 0, true), "loading");
  assert.equal(availabilityOf("unknown", 3, true), "loading");
  assert.equal(availabilityOf("unknown", 3, false), "closed", "the build's own hold closes it at once, without waiting");
  // the old rule is still there and unchanged
  assert.equal(isFormOpen(0, false), true);
  assert.equal(isFormOpen(3, false), false);
  assert.equal(isFormOpen(3, true), true);
});

test("availabilityOf: nothing but a clear open ever gives open (every combination)", () => {
  for (const server of ["unknown", "open", "closed"]) {
    for (const held of [0, 1, 5]) {
      for (const preview of [false, true]) {
        const result = availabilityOf(server, held, preview);
        const expected = server === "open" && (held === 0 || preview);
        assert.equal(result === "open", expected, `${server} held ${held} preview ${preview} -> ${result}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The call itself
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test("fetchServerStatus: a plain GET of /tourist-visa/status with no token, never cached by the browser", async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { status: 200, json: async () => ({ open: true }) }; };
  const controller = new AbortController();
  assert.deepEqual(await fetchServerStatus(controller.signal), { status: 200, json: { open: true } });
  assert.match(seen.url, /\/tourist-visa\/status$/);
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.cache, "no-store");
  assert.equal(seen.init.signal, controller.signal);
  assert.equal(seen.init.headers, undefined, "no Authorization and no other header");
  assert.equal(seen.init.body, undefined);
});

test("fetchServerStatus: a body that is not JSON gives a null body (so the answer is closed); a network error rejects", async () => {
  globalThis.fetch = async () => ({ status: 200, json: async () => { throw new SyntaxError("x"); } });
  const result = await fetchServerStatus();
  assert.deepEqual(result, { status: 200, json: null });
  assert.equal(readStatusAnswer(result.status, result.json), "closed");
  globalThis.fetch = async () => { throw new TypeError("network"); };
  await assert.rejects(() => fetchServerStatus(), TypeError);
});

// ---------------------------------------------------------------------------
// The pages: what is mounted while closed or unknown (read from the source, because the components need a browser)
// ---------------------------------------------------------------------------

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the Tourist Visa layout mounts the provider (which calls the API) only in the open branch, after the loading and closed branches", () => {
  const layout = source("../app/tourist-visa/layout.tsx");
  const loading = layout.indexOf('availability === "loading"');
  const closed = layout.indexOf('availability === "closed"');
  const provider = layout.indexOf("<TouristVisaProvider>");
  assert.ok(loading > -1 && closed > loading && provider > closed, "loading, then closed, then the provider");
  assert.equal(layout.split("<TouristVisaProvider>").length - 1, 1, "the provider is mounted in exactly one place");
  assert.match(layout, /if \(availability !== "open" \|\| !mounted \|\| user\) return;/, "nobody is sent to log in for a feature that is not available");
});

test("the admin pages ask nothing of the Tourist Visa API until the feature is open, and show the same closed notice", () => {
  for (const file of ["../app/admin/tourist-visa/page.tsx", "../app/admin/tourist-visa/[id]/page.tsx"]) {
    const page = source(file);
    assert.match(page, /availability !== "open"\) return;/, `${file}: effects wait for open`);
    assert.match(page, /<ClosedNotice /, `${file}: shows the closed notice`);
    assert.match(page, /<AvailabilityLoading \/>/, `${file}: shows a neutral wait`);
    assert.equal(/isFormOpen|countHeldSections/.test(page), false, `${file}: no separate client-only gate`);
  }
});

test("the admin menu has the Tourist Visa entry only when the feature is open: not while loading, not when closed", () => {
  const sidebar = source("../components/shadcn-space/blocks/sidebar-06/app-sidebar.tsx");
  assert.match(sidebar, /itemsForSidebar\(useTouristVisaAvailability\(\) === "open"\)/);
  assert.match(sidebar, /function itemsForSidebar\(touristVisaOpen: boolean\)[\s\S]*if \(!touristVisaOpen\) return navData;/);
});

test("the hook that step 8i reuses is exported from one place", () => {
  const hook = source("../hooks/useTouristVisaOpen.ts");
  assert.match(hook, /export function useTouristVisaOpen\(\): ServerOpenState/);
  assert.match(hook, /export function useTouristVisaAvailability\(\): Availability/);
});
