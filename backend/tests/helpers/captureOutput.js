'use strict';

const util = require('node:util');

/**
 * Collects everything written through console.* so a test can assert that no
 * answer text reached a log line. Call restore() in a finally block.
 */
function captureOutput() {
  const lines = [];
  const originals = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[method] = console[method];
    console[method] = (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 8 })).join(' '));
  }
  return {
    text: () => lines.join('\n'),
    restore: () => Object.assign(console, originals),
  };
}

module.exports = captureOutput;
