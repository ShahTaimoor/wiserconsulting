/**
 * University Finder: pure matching, no database. Given a student's marks and a list of universities it says, for each one,
 * whether the student can apply, with or without a scholarship, and why not when they cannot.
 */

// test key -> [university field, label]
const TESTS = {
  ielts: ["minIelts", "IELTS"],
  toefl: ["minToefl", "TOEFL"],
  pte: ["minPte", "PTE"],
  duolingo: ["minDuolingo", "Duolingo"],
  oxford: ["minOxford", "Oxford"],
};

const has = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** A shortfall small enough that a retake or a little more work could fix it. */
function isClose(testKey, gap, required) {
  if (testKey === "ielts") return gap <= 0.5;
  return gap <= required * 0.1;
}

function matchesFilters(university, { country, field }) {
  if (country && !sameText(university.country, country)) return false;
  if (field) {
    const wanted = String(field).trim().toLowerCase();
    const offered = (university.fields || []).map((item) => String(item).toLowerCase());
    if (offered.length > 0 && !offered.some((item) => item.includes(wanted) || wanted.includes(item))) return false;
  }
  return true;
}

function checkFsc(university, fscPercent) {
  const required = university.minFscPercent;
  if (!has(required)) return { required: null, ok: true, gap: 0 };
  const gap = Math.max(0, required - fscPercent);
  return { required, ok: gap === 0, gap };
}

function checkEnglish(university, scores) {
  const wanted = Object.keys(TESTS).filter((key) => has(university[TESTS[key][0]]));
  if (wanted.length === 0) return { state: "not_required", ok: true, accepted: [], close: false };

  const accepted = wanted.map((key) => ({ test: TESTS[key][1], key, required: university[TESTS[key][0]] }));
  const given = accepted.filter((item) => has(scores[item.key]));
  if (given.length === 0) return { state: "missing", ok: false, accepted, close: false };

  const passed = given.find((item) => scores[item.key] >= item.required);
  if (passed) return { state: "passed", ok: true, accepted, via: passed.test, close: false };

  const close = given.some((item) => isClose(item.key, item.required - scores[item.key], item.required));
  return { state: "failed", ok: false, accepted, close };
}

function checkScholarship(university, fscPercent, scores) {
  if (!university.scholarshipAvailable) return { available: false, qualifies: false };
  const base = {
    available: true,
    name: university.scholarshipName || "",
    percent: has(university.scholarshipPercent) ? university.scholarshipPercent : null,
    details: university.scholarshipDetails || "",
    url: university.scholarshipUrl || "",
  };
  let qualifies = true;
  let unknown = false;
  if (has(university.scholarshipMinFscPercent) && fscPercent < university.scholarshipMinFscPercent) qualifies = false;
  if (has(university.scholarshipMinIelts)) {
    if (!has(scores.ielts)) unknown = true;
    else if (scores.ielts < university.scholarshipMinIelts) qualifies = false;
  }
  return {
    ...base,
    minFscPercent: has(university.scholarshipMinFscPercent) ? university.scholarshipMinFscPercent : null,
    minIelts: has(university.scholarshipMinIelts) ? university.scholarshipMinIelts : null,
    qualifies: qualifies && !unknown,
    needsIelts: qualifies && unknown,
  };
}

/** One university against one student. */
function evaluate(university, student) {
  if (university.requirementsUnknown) {
    // From the world list: nothing is known about the entry requirements, so nothing is claimed.
    return {
      university,
      status: "check_official",
      reasons: ["Requirements are not added yet. Check the official website."],
      fsc: { required: null, ok: false, gap: 0 },
      english: { state: "unknown", ok: false, accepted: [], close: false },
      scholarship: { available: false, qualifies: false },
      options: { withoutScholarship: false, withScholarship: false },
    };
  }
  const fscPercent = Number(student.fscPercent);
  const scores = student.tests || {};
  const fsc = checkFsc(university, fscPercent);
  const english = checkEnglish(university, scores);
  const scholarship = checkScholarship(university, fscPercent, scores);

  const reasons = [];
  if (!fsc.ok) reasons.push(`FSc ${fsc.required}% needed, student has ${fscPercent}%`);
  if (english.state === "missing") reasons.push(`English test needed: ${english.accepted.map((item) => `${item.test} ${item.required}`).join(" or ")}`);
  if (english.state === "failed") reasons.push(`English score is below ${english.accepted.map((item) => `${item.test} ${item.required}`).join(" / ")}`);

  let status;
  if (fsc.ok && english.ok) status = "eligible";
  else if (fsc.ok && english.state === "missing") status = "needs_test";
  else if (fsc.gap <= 5 && (english.ok || english.close || english.state === "missing")) status = "close";
  else status = "not_eligible";

  const canApply = status === "eligible";
  return {
    university,
    status,
    reasons,
    fsc,
    english,
    scholarship,
    // the two ways the student can go ahead
    options: {
      withoutScholarship: canApply,
      withScholarship: canApply && scholarship.available && scholarship.qualifies,
    },
  };
}

const ORDER = { eligible: 0, needs_test: 1, close: 2, check_official: 3, not_eligible: 4 };

/** The universities that suit the student, best first. `includeNotEligible` also returns the ones they cannot apply to. */
function matchUniversities(universities, student, { includeNotEligible = false, includeUnknown = false } = {}) {
  const results = universities
    .filter((university) => university.isActive !== false && matchesFilters(university, student))
    .map((university) => evaluate(university, student))
    .filter((result) => (result.status === "check_official" ? includeUnknown : includeNotEligible || result.status !== "not_eligible"));

  results.sort((a, b) => {
    if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
    if (a.options.withScholarship !== b.options.withScholarship) return a.options.withScholarship ? -1 : 1;
    return String(a.university.name).localeCompare(String(b.university.name));
  });
  return results;
}

module.exports = { TESTS, evaluate, matchUniversities, matchesFilters };
