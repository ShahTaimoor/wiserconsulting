#!/usr/bin/env node
/**
 * Release gate: lists every Tourist Visa section that still has a `tbc` flag
 * and exits 1 if there is any. Run it before releasing the form to applicants.
 *
 * Output: the config version, then each part with its sections (BLOCKED with the number of
 * open tbc items, or releasable), a count, and the open items of every blocked section.
 * A section that only applies to some applicants (such as 4A) is listed like any other:
 * it still has to be confirmed before release.
 */

const { config, getReleaseBlockers, validateConfig } = require('../shared/tourist-visa/engine');

const configProblems = validateConfig(config);
if (configProblems.length) {
  console.error('Invalid config:\n  ' + configProblems.join('\n  '));
  process.exit(1);
}

const blockers = getReleaseBlockers(config);
const openItems = new Map(blockers.map((b) => [b.sectionId, b.items.length]));

console.log(`Tourist Visa config ${config.version}`);
for (const part of config.parts) {
  console.log(`  Part ${part.id}: ${part.title}`);
  for (const section of config.sections.filter((s) => s.part === part.id)) {
    const open = openItems.get(section.id);
    const state = open ? `BLOCKED (${open} open tbc item${open === 1 ? '' : 's'})` : 'releasable';
    console.log(`    section ${section.id}: ${section.title}: ${state}`);
  }
}

const total = config.sections.length;
const releasable = total - blockers.length;
console.log(`\n${releasable} of ${total} sections releasable.`);

if (blockers.length) {
  console.error('\nSections blocked by open tbc items:');
  for (const b of blockers) {
    console.error(`\n  Section ${b.sectionId}`);
    for (const item of b.items) console.error(`    ${item.number || item.id}: ${item.tbc}`);
  }
  process.exit(1);
}
console.log('\nAll sections are releasable.');
