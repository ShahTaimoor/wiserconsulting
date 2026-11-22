// The logo is shown in the navbar, footer, sign-in pages and the browser tab, so only a picture may be saved as the logo,
// and the old picture is removed only after the new one is saved. No database: the repository and the storage are replaced.
const test = require('node:test');
const assert = require('node:assert/strict');

const repo = require('../repositories/siteSettingsRepository');
const upload = require('../config/upload');
const fileStorage = require('../middleware/fileStorage');

const calls = [];
repo.updateLogo = async (url, id) => { calls.push(['save', url, id]); return { logoUrl: url, logoPublicId: id }; };
let failUpload = false;
upload.uploadLocalToR2 = async () => {
  if (failUpload) throw new Error('storage down');
  calls.push(['upload']);
  return { secure_url: 'https://cdn.example.test/site-settings/new.png', public_id: 'site-settings/new.png' };
};
fileStorage.deleteFromR2 = async (key) => { calls.push(['delete', key]); };

const service = require('../services/siteSettingsService');
test.beforeEach(() => { calls.length = 0; failUpload = false; });

test('a PDF or Word file is refused as a logo, and nothing is stored', async () => {
  await assert.rejects(() => service.uploadLogo({ mimetype: 'application/pdf', path: '/nonexistent' }, {}), (e) => e.statusCode === 400);
  assert.deepEqual(calls, []);
});

test('the old logo is deleted only after the new one is saved', async () => {
  const result = await service.uploadLogo({ mimetype: 'image/png', path: '/nonexistent' }, { logoPublicId: 'site-settings/old.png' });
  assert.equal(result.logoUrl, 'https://cdn.example.test/site-settings/new.png');
  assert.deepEqual(calls.map((c) => c[0]), ['upload', 'save', 'delete']);
  assert.equal(calls[2][1], 'site-settings/old.png');
});

test('a failed upload leaves the current logo untouched', async () => {
  failUpload = true;
  await assert.rejects(() => service.uploadLogo({ mimetype: 'image/jpeg', path: '/nonexistent' }, { logoPublicId: 'site-settings/old.png' }), (e) => e.statusCode === 500);
  assert.deepEqual(calls, []);
});
