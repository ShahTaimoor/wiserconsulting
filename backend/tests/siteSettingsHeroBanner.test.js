// Hero banner pictures (mobile / tablet / desktop) in the public R2 bucket. No database and no network:
// the repository is replaced by a fake and the S3 client's send() records what would be sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.R2_ACCOUNT_ID = 'acc123';
process.env.R2_ACCESS_KEY_ID = 'AKIATESTKEY0000000001';
process.env.R2_SECRET_ACCESS_KEY = 'test-only-secret-not-real';
process.env.R2_PUBLIC_BUCKET = 'test-public';
process.env.R2_PRIVATE_BUCKET = 'test-private';
process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.test/';

const sharp = require('sharp');
const { S3Client } = require('@aws-sdk/client-s3');
const repository = require('../repositories/siteSettingsRepository');
const service = require('../services/siteSettingsService');

const sent = [];
S3Client.prototype.send = async function send(command) {
  sent.push(command);
  return {};
};

const calls = [];
repository.updateHeroBanner = async (device, url, publicId) => {
  calls.push({ device, url, publicId });
  return { [`hero${device[0].toUpperCase()}${device.slice(1)}Url`]: url };
};

async function tempImage({ width, height, ext = 'jpg' }) {
  const file = path.join(os.tmpdir(), `hero-test-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`);
  const image = sharp({ create: { width, height, channels: 3, background: '#336699' } });
  fs.writeFileSync(file, await (ext === 'png' ? image.png() : image.jpeg()).toBuffer());
  return file;
}

test.beforeEach(() => {
  sent.length = 0;
  calls.length = 0;
});

test('a desktop banner goes to the PUBLIC bucket under hero-banners/, keeps its size up to 2560 px, and the temp file is removed', async () => {
  const file = await tempImage({ width: 3200, height: 1800 });
  await service.uploadHeroBanner('desktop', { path: file, mimetype: 'image/jpeg' }, {});
  const put = sent.find((c) => c.constructor.name === 'PutObjectCommand');
  assert.equal(put.input.Bucket, 'test-public');
  assert.match(put.input.Key, /^hero-banners\/[0-9a-f]{32}\.jpg$/);
  const meta = await sharp(put.input.Body).metadata();
  assert.equal(meta.width, 2560, 'wider than 2560 is reduced to 2560, not to the 1000 px used for other pictures');
  assert.equal(calls[0].device, 'desktop');
  assert.match(calls[0].url, /^https:\/\/cdn\.example\.test\/hero-banners\/[0-9a-f]{32}\.jpg$/);
  assert.equal(calls[0].publicId, put.input.Key);
  assert.equal(fs.existsSync(file), false);
});

test('a smaller picture is never enlarged', async () => {
  const file = await tempImage({ width: 800, height: 1200, ext: 'png' });
  await service.uploadHeroBanner('mobile', { path: file, mimetype: 'image/png' }, {});
  const put = sent.find((c) => c.constructor.name === 'PutObjectCommand');
  const meta = await sharp(put.input.Body).metadata();
  assert.deepEqual([meta.width, meta.height], [800, 1200]);
});

test('replacing a picture removes the old one from the public bucket', async () => {
  const file = await tempImage({ width: 1000, height: 600 });
  await service.uploadHeroBanner('tablet', { path: file, mimetype: 'image/jpeg' }, { heroTabletPublicId: 'hero-banners/old.jpg' });
  const del = sent.find((c) => c.constructor.name === 'DeleteObjectCommand');
  assert.equal(del.input.Bucket, 'test-public');
  assert.equal(del.input.Key, 'hero-banners/old.jpg');
});

test('removing a picture deletes the file and clears both fields', async () => {
  await service.removeHeroBanner('mobile', { heroMobilePublicId: 'hero-banners/m.jpg' });
  const del = sent.find((c) => c.constructor.name === 'DeleteObjectCommand');
  assert.equal(del.input.Key, 'hero-banners/m.jpg');
  assert.deepEqual(calls[0], { device: 'mobile', url: null, publicId: null });
});

test('only JPG and PNG are accepted, an unknown size is refused, and nothing is stored or left on disk', async () => {
  const gif = path.join(os.tmpdir(), `hero-test-${Date.now()}.gif`);
  fs.writeFileSync(gif, 'GIF89a');
  await assert.rejects(() => service.uploadHeroBanner('desktop', { path: gif, mimetype: 'image/gif' }, {}), (e) => e.statusCode === 400);
  assert.equal(fs.existsSync(gif), false);

  const jpg = await tempImage({ width: 100, height: 100 });
  await assert.rejects(() => service.uploadHeroBanner('watch', { path: jpg, mimetype: 'image/jpeg' }, {}), (e) => e.statusCode === 400);
  await assert.rejects(() => service.removeHeroBanner('watch', {}), (e) => e.statusCode === 400);
  assert.equal(sent.length, 0);
  assert.equal(calls.length, 0);
});
