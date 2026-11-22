const test = require('node:test');
const assert = require('node:assert/strict');
const escapeHtml = require('../utils/escapeHtml');

test('text typed by a visitor can no longer become tags or links in an e-mail', () => {
  assert.equal(escapeHtml('<a href="https://evil">Pay</a> & \'x\''), '&lt;a href=&quot;https://evil&quot;&gt;Pay&lt;/a&gt; &amp; &#39;x&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});
