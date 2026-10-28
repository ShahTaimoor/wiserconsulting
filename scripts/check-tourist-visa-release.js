#!/usr/bin/env node
/**
 * Release gate: lists every Tourist Visa section that still has a `tbc` flag
 * and exits 1 if there is any. Run it before releasing the form to applicants.
 */

const { config, getReleaseBlockers, validateConfig } = require('../shared/tourist-visa/engine');

const configProblems = validateConfig(config);
if (configProblems.length) {
  console.error('Invalid config:\n  ' + configProblems.join('\n  '));
  process.exit(1);
}

const blockers = getReleaseBlockers(config);
const sections = config.sections.map((s) => s.id);
const blocked = new Set(blockers.map((b) => b.sectionId));

console.log(`Tourist Visa config ${config.version}`);
for (const id of sections) console.log(`  section ${id}: ${blocked.has(id) ? 'BLOCKED' : 'releasable'}`);

if (blockers.length) {
  console.error('\nSections blocked by open tbc items:');
  for (const b of blockers) {
    console.error(`\n  Section ${b.sectionId}`);
    for (const item of b.items) console.error(`    ${item.number || item.id}: ${item.tbc}`);
  }
  process.exit(1);
}
console.log('\nAll sections are releasable.');
