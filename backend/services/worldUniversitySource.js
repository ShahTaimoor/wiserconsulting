/**
 * The public world list of universities (Hipo "university-domains-list" on GitHub: name, country, website). It has no entry
 * requirements, so everything read from it is stored with requirementsUnknown: true.
 *
 * The address is a constant (never taken from a request), a redirect is an error, the answer is size-capped, and it is kept
 * in memory for a while so that loading the list in parts downloads it only once. `fetchImpl` can be replaced in tests.
 */
const { readCappedText } = require("../utils/cappedBody");

const SOURCE_URL = "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30000;
const KEEP_MS = 30 * 60 * 1000;

const state = { fetchImpl: (...args) => globalThis.fetch(...args), now: () => Date.now(), cache: null };

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 300) : "";
  } catch {
    return "";
  }
}

/** Raw entries -> University rows. Entries without a name or country are dropped, and so is a second entry with the same name and country. */
function mapWorldList(entries) {
  const seen = new Set();
  const rows = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const name = String((entry && entry.name) || "").trim().slice(0, 200);
    const country = String((entry && entry.country) || "").trim().slice(0, 100);
    if (!name || !country) continue;
    const key = `${name}|${country}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const website = safeUrl(Array.isArray(entry.web_pages) ? entry.web_pages[0] : "");
    rows.push({
      name,
      country,
      city: String(entry["state-province"] || "").trim().slice(0, 100),
      website,
      applyUrl: website,
      notes: "From the world list: no requirements added yet. Check the official website.",
      requirementsUnknown: true,
      needsVerification: true,
    });
  }
  return rows;
}

async function download() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await state.fetchImpl(SOURCE_URL, { redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error("The world list could not be downloaded");
    return JSON.parse(await readCappedText(response, MAX_BYTES));
  } finally {
    clearTimeout(timer);
  }
}

async function getWorldRows() {
  if (state.cache && state.now() - state.cache.at < KEEP_MS) return state.cache.rows;
  let entries;
  try {
    entries = await download();
  } catch {
    throw new Error("The world list could not be downloaded right now. Try again in a minute.");
  }
  const rows = mapWorldList(entries);
  if (rows.length === 0) throw new Error("The world list was empty");
  state.cache = { at: state.now(), rows };
  return rows;
}

module.exports = { getWorldRows, mapWorldList, SOURCE_URL, _state: state };
