#!/usr/bin/env node
/**
 * Release gate for the Tourist Visa form. Two kinds of open item are reported separately:
 *
 *  - tbc: a real unknown in the spec (for example the follow-up of a Yes answer). The section
 *    is BLOCKED until it is settled.
 *  - draft: a default we chose (an option list, follow-up questions or a rule), with a note saying
 *    what it is. The form works with it, so the section is not BLOCKED, but it NEEDS SENIOR
 *    REVIEW before release. Nothing is ever confirmed silently: a draft stays listed until
 *    someone removes its `draft` line.
 *
 * Output: the config version, each part with its sections and their state, a count, then the
 * open tbc items and the drafts of every section that has them.
 *
 * Declaration wording that is not a question (the final submit declaration) is listed on its own and counts as a
 * draft too.
 *
 * Exit code: 1 while any section is blocked, 2 when nothing is blocked but drafts or wording still need
 * review, 0 when everything is clear. The client form opens to applicants only at exit code 0
 * (a build with NEXT_PUBLIC_TOURIST_VISA_PREVIEW=true excepted).
 *
 * A section that only applies to some applicants (such as 4A) is listed like any other:
 * it still has to be confirmed before release.
 */

const fs = require('fs');
const engine = require('../shared/tourist-visa/engine');

const { getReleaseBlockers, getDraftItems, getWordingDrafts, validateConfig } = engine;
// Checks the real config, or the questions.json file given as the first argument (used by the tests).
const config = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : engine.config;

const configProblems = validateConfig(config);
if (configProblems.length) {
  console.error('Invalid config:\n  ' + configProblems.join('\n  '));
  process.exit(1);
}

const blockers = getReleaseBlockers(config);
const drafts = getDraftItems(config);
const wording = getWordingDrafts(config);
const openTbc = new Map(blockers.map((b) => [b.sectionId, b.items.length]));
const openDrafts = new Map(drafts.map((d) => [d.sectionId, d.items.length]));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

console.log(`Tourist Visa config ${config.version}`);
for (const part of config.parts) {
  console.log(`  Part ${part.id}: ${part.title}`);
  for (const section of config.sections.filter((s) => s.part === part.id)) {
    const tbc = openTbc.get(section.id) || 0;
    const draft = openDrafts.get(section.id) || 0;
    const notes = [];
    if (tbc) notes.push(`${plural(tbc, 'open tbc item')}`);
    if (draft) notes.push(`${plural(draft, 'draft')}`);
    let state = 'releasable';
    if (tbc) state = `BLOCKED (${notes.join(', ')})`;
    else if (draft) state = `NEEDS SENIOR REVIEW (${notes.join(', ')})`;
    console.log(`    section ${section.id}: ${section.title}: ${state}`);
  }
}

const total = config.sections.length;
const reviewOnly = [...openDrafts.keys()].filter((id) => !openTbc.has(id)).length;
const clean = total - blockers.length - reviewOnly;
console.log(`\n${total} sections: ${blockers.length} blocked, ${reviewOnly} need senior review only, ${clean} clean.`);

if (blockers.length) {
  console.error('\nBlocked: sections with open tbc items (real unknowns in the spec):');
  for (const b of blockers) {
    console.error(`\n  Section ${b.sectionId}`);
    for (const item of b.items) console.error(`    ${item.number || item.id}: ${item.tbc}`);
  }
}

if (drafts.length) {
  console.error('\nNeeds senior review: drafts (defaults we chose; the form works with them, but they are not final):');
  for (const d of drafts) {
    console.error(`\n  Section ${d.sectionId}`);
    for (const item of d.items) console.error(`    ${item.number || item.id}: ${item.draft}`);
  }
}

if (wording.length) {
  console.error('\nNeeds senior approval: declaration wording (not a question; kept in the config under "declarations"):');
  for (const w of wording) console.error(`\n    ${w.id}: ${w.draft}`);
}

if (blockers.length) process.exit(1);
if (drafts.length || wording.length) {
  console.log('\nNothing is blocked, but drafts still need senior review. The client form stays closed until they are signed off.');
  process.exit(2);
}
console.log('\nAll sections are releasable.');
