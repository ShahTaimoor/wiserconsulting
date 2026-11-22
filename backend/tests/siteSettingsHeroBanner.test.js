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
const added = [];
repository.addHeroImage = async (device, url, publicId, legacy) => {
  added.push({ device, url, publicId, legacy });
  return {};
};
const pulled = [];
repository.removeHeroImage = async (device, imageId) => {
  pulled.push({ device, imageId });
  return {};
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
  added.length = 0;
  pulled.length = 0;
});

test('a desktop banner goes to the PUBLIC bucket under hero-banners/, keeps its size up to 2560 px, and the temp file is removed', async () => {
  const file = await tempImage({ width: 3200, height: 1800 });
  await service.uploadHeroBanner('desktop', { path: file, mimetype: 'image/jpeg' }, {});
  const put = sent.find((c) => c.constructor.name === 'PutObjectCommand');
  assert.equal(put.input.Bucket, 'test-public');
  assert.match(put.input.Key, /^hero-banners\/[0-9a-f]{32}\.jpg$/);
  const meta = await sharp(put.input.Body).metadata();
  assert.equal(meta.width, 2560, 'wider than 2560 is reduced to 2560, not to the 1000 px used for other pictures');
  assert.equal(added[0].device, 'desktop');
  assert.match(added[0].url, /^https:\/\/cdn\.example\.test\/hero-banners\/[0-9a-f]{32}\.jpg$/);
  assert.equal(added[0].publicId, put.input.Key);
  assert.equal(added[0].legacy, null);
  assert.equal(fs.existsSync(file), false);
});

test('a smaller picture is never enlarged', async () => {
  const file = await tempImage({ width: 800, height: 1200, ext: 'png' });
  await service.uploadHeroBanner('mobile', { path: file, mimetype: 'image/png' }, {});
  const put = sent.find((c) => c.constructor.name === 'PutObjectCommand');
  const meta = await sharp(put.input.Body).metadata();
  assert.deepEqual([meta.width, meta.height], [800, 1200]);
});

test('a new picture is ADDED: the old ones are kept (nothing is deleted from the bucket)', async () => {
  const file = await tempImage({ width: 1000, height: 600 });
  const current = { heroTabletImages: [{ _id: 'a1', url: 'u1', publicId: 'hero-banners/one.jpg' }] };
  await service.uploadHeroBanner('tablet', { path: file, mimetype: 'image/jpeg' }, current);
  assert.equal(sent.some((c) => c.constructor.name === 'DeleteObjectCommand'), false);
  assert.equal(added.length, 1);
  assert.equal(added[0].legacy, null);
});

test('the older single picture becomes the first item of the list when a second one is added', async () => {
  const file = await tempImage({ width: 1000, height: 600 });
  const current = { heroDesktopUrl: 'https://cdn.example.test/hero-banners/old.jpg', heroDesktopPublicId: 'hero-banners/old.jpg' };
  await service.uploadHeroBanner('desktop', { path: file, mimetype: 'image/jpeg' }, current);
  assert.deepEqual(added[0].legacy, { _id: 'legacy', url: 'https://cdn.example.test/hero-banners/old.jpg', publicId: 'hero-banners/old.jpg' });
  assert.equal(sent.some((c) => c.constructor.name === 'DeleteObjectCommand'), false, 'the old file is kept, it is now in the list');
});

test('a size holds at most 10 pictures: the 11th is refused, nothing is stored and the temp file is removed', async () => {
  const file = await tempImage({ width: 400, height: 300 });
  const ten = Array.from({ length: 10 }, (_, i) => ({ _id: `i${i}`, url: `u${i}`, publicId: `hero-banners/${i}.jpg` }));
  await assert.rejects(() => service.uploadHeroBanner('mobile', { path: file, mimetype: 'image/jpeg' }, { heroMobileImages: ten }), (e) => e.statusCode === 400);
  assert.equal(fs.existsSync(file), false);
  assert.equal(sent.length, 0);
  assert.equal(added.length, 0);
});

test('removing one picture deletes only that file; an unknown id is a 404', async () => {
  const current = { heroMobileImages: [{ _id: 'a1', url: 'u1', publicId: 'hero-banners/one.jpg' }, { _id: 'a2', url: 'u2', publicId: 'hero-banners/two.jpg' }] };
  await service.removeHeroImage('mobile', 'a2', current);
  const del = sent.filter((c) => c.constructor.name === 'DeleteObjectCommand');
  assert.deepEqual(del.map((c) => c.input.Key), ['hero-banners/two.jpg']);
  assert.deepEqual(pulled, [{ device: 'mobile', imageId: 'a2' }]);
  await assert.rejects(() => service.removeHeroImage('mobile', 'zzz', current), (e) => e.statusCode === 404);
  await assert.rejects(() => service.removeHeroImage('watch', 'a1', current), (e) => e.statusCode === 400);
});

test('the older single picture can be removed with the id "legacy"', async () => {
  await service.removeHeroImage('desktop', 'legacy', { heroDesktopUrl: 'u', heroDesktopPublicId: 'hero-banners/d.jpg' });
  assert.equal(sent.find((c) => c.constructor.name === 'DeleteObjectCommand').input.Key, 'hero-banners/d.jpg');
  assert.deepEqual(pulled, [{ device: 'desktop', imageId: 'legacy' }]);
});

test('removing all the pictures of a size deletes every file and clears the size', async () => {
  await service.removeHeroBanner('mobile', { heroMobileImages: [{ _id: 'a', publicId: 'hero-banners/m.jpg' }, { _id: 'b', publicId: 'hero-banners/n.jpg' }] });
  const del = sent.filter((c) => c.constructor.name === 'DeleteObjectCommand');
  assert.deepEqual(del.map((c) => c.input.Key), ['hero-banners/m.jpg', 'hero-banners/n.jpg']);
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
  assert.equal(added.length, 0);
});
