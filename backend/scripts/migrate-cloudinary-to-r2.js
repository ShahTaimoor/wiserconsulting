#!/usr/bin/env node
/**
 * One-time migration: copies every file that is still on Cloudinary to Cloudflare R2 and updates the database.
 *
 *   node scripts/migrate-cloudinary-to-r2.js            dry run: lists what would be copied, changes nothing
 *   node scripts/migrate-cloudinary-to-r2.js --apply    copies the files and updates the database
 *
 * What moves where:
 *   - assessment documents (passports, bank statements ...)   -> PRIVATE bucket, stored as r2://private/<key>
 *   - site logo, admin logo and favicon, testimonial photos,
 *     approved-visa photos and flags                          -> PUBLIC bucket, stored as <R2_PUBLIC_BASE_URL>/<key>
 *
 * The files are read from the Cloudinary URLs already stored in the database, so no Cloudinary key is needed.
 * It is safe to run again: a record whose address no longer points at Cloudinary is skipped, and a record that
 * fails is left untouched (the old Cloudinary file stays valid). Nothing is deleted from Cloudinary: keep the
 * account until you have checked the site, then delete it by hand.
 * Tourist Visa documents are not handled here (they were private "authenticated" files); the feature was closed
 * in production, so there should be none. Check the TouristVisaApplication collection before closing Cloudinary.
 *
 * Exit code: 0 done (or dry run finished), 1 some records failed, 2 wrong use or missing settings.
 */

const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const REQUIRED_ENV = ['MONGODB_URI', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BUCKET', 'R2_PRIVATE_BUCKET', 'R2_PUBLIC_BASE_URL'];

const isCloudinary = (value) => typeof value === 'string' && /^https?:\/\/[^/]*cloudinary\.com\//i.test(value);

function extensionOf(url, mimetype, r2) {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  return fromUrl || r2.extensionFor(mimetype || '');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const unknown = process.argv.slice(2).filter((a) => a !== '--apply');
  if (unknown.length) {
    console.error('Usage: node scripts/migrate-cloudinary-to-r2.js [--apply]');
    return 2;
  }

  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const missing = REQUIRED_ENV.filter((n) => !process.env[n] || !process.env[n].trim());
  if (missing.length) {
    console.error(`These settings are missing (names only): ${missing.join(', ')}`);
    return 2;
  }

  const mongoose = require('mongoose');
  const r2 = require('../config/r2');
  const FormSubmission = require('../models/FormSubmission');
  const SiteSettings = require('../models/SiteSettings');
  const AdminSettings = require('../models/AdminSettings');
  const Testimonial = require('../models/Testimonial');
  const ApprovedVisa = require('../models/ApprovedVisa');

  const stats = { found: 0, copied: 0, failed: 0 };

  async function copyOne({ url, folder, visibility, mimetype }) {
    stats.found += 1;
    const ext = extensionOf(url, mimetype, r2);
    const key = `${folder}/${crypto.randomBytes(16).toString('hex')}${ext}`;
    if (!apply) {
      console.log(`  would copy -> ${visibility}:${key}`);
      return null;
    }
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    const contentType = mimetype || response.headers['content-type'] || r2.contentTypeFor(key);
    await r2.putObject({ visibility, key, body: Buffer.from(response.data), contentType });
    stats.copied += 1;
    return { key, url: visibility === 'private' ? r2.privateReference(key) : r2.publicUrl(key) };
  }

  async function guarded(label, fn) {
    try {
      await fn();
    } catch (error) {
      stats.failed += 1;
      console.error(`  FAILED ${label}: ${error.message}`);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(apply ? 'APPLY mode: files will be copied and the database updated.' : 'DRY RUN: nothing will be changed. Use --apply to migrate.');

  // 1. Assessment documents -> private bucket
  console.log('Assessment documents ...');
  for await (const submission of FormSubmission.find({ 'documents.cloudinaryUrl': { $regex: 'cloudinary\\.com' } })) {
    for (const doc of submission.documents) {
      if (doc.uploadType === 'local' || !isCloudinary(doc.cloudinaryUrl)) continue;
      await guarded(`submission ${submission._id} document ${doc._id}`, async () => {
        const moved = await copyOne({ url: doc.cloudinaryUrl, folder: 'visa-assessments/migrated', visibility: 'private', mimetype: doc.mimetype });
        if (!moved) return;
        await FormSubmission.updateOne(
          { _id: submission._id, 'documents._id': doc._id },
          { $set: { 'documents.$.cloudinaryUrl': moved.url, 'documents.$.cloudinaryPublicId': moved.key, 'documents.$.cloudinaryId': moved.key, 'documents.$.uploadType': 'r2' } },
        );
      });
    }
  }

  // 2. Single-image records -> public bucket
  const imageJobs = [
    { label: 'site settings logo', Model: SiteSettings, url: 'logoUrl', id: 'logoPublicId', folder: 'site-settings' },
    { label: 'admin settings logo', Model: AdminSettings, url: 'siteLogo', id: 'logoPublicId', folder: 'admin-settings' },
    { label: 'admin settings favicon', Model: AdminSettings, url: 'favicon', id: 'faviconPublicId', folder: 'admin-settings' },
    { label: 'testimonial photos', Model: Testimonial, url: 'clientPhotoUrl', id: 'clientPhotoPublicId', folder: 'testimonials' },
    { label: 'approved visa photos', Model: ApprovedVisa, url: 'clientPhotoUrl', id: 'clientPhotoPublicId', folder: 'approved-visas' },
    { label: 'approved visa flags', Model: ApprovedVisa, url: 'countryFlagUrl', id: 'countryFlagPublicId', folder: 'approved-visas' },
  ];
  for (const job of imageJobs) {
    console.log(`${job.label} ...`);
    for await (const record of job.Model.find({ [job.url]: { $regex: 'cloudinary\\.com' } })) {
      const value = record.get(job.url);
      if (!isCloudinary(value)) continue;
      await guarded(`${job.label} ${record._id}`, async () => {
        const moved = await copyOne({ url: value, folder: job.folder, visibility: 'public' });
        if (!moved) return;
        await job.Model.updateOne({ _id: record._id }, { $set: { [job.url]: moved.url, [job.id]: moved.key } });
      });
    }
  }

  console.log(`Done. Found ${stats.found}, copied ${stats.copied}, failed ${stats.failed}.`);
  await mongoose.disconnect();
  return stats.failed ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(`Migration stopped: ${error.message}`);
  process.exit(1);
});
