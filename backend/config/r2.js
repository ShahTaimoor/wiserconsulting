/**
 * Cloudflare R2 object storage (S3 compatible). Replaces Cloudinary.
 *
 * Two buckets:
 *   - public  (R2_PUBLIC_BUCKET)  : logo, testimonial and approved-visa photos. Served from R2_PUBLIC_BASE_URL
 *                                   (a custom domain or the r2.dev URL of that bucket).
 *   - private (R2_PRIVATE_BUCKET) : passports, bank statements and Tourist Visa documents. Never reachable by a
 *                                   plain URL; read only through a signed, expiring link made here.
 *
 * Private files are stored in the database as the reference "r2://private/<key>" (see PRIVATE_PREFIX). The API
 * turns that reference into a short-lived signed link when it sends a document to the admin screen.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REQUIRED = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BUCKET',
  'R2_PRIVATE_BUCKET',
  'R2_PUBLIC_BASE_URL',
];

const PRIVATE_PREFIX = 'r2://private/';
const DEFAULT_LINK_TTL_SECONDS = 60 * 60; // 1 hour for the admin screen

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

/** Names (never values) of the settings that are missing or empty. */
function missingVariables(env = process.env) {
  return REQUIRED.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
}

function isConfigured(env = process.env) {
  return missingVariables(env).length === 0;
}

let cachedClient = null;
let cachedKey = '';

function getClient(env = process.env) {
  const signature = `${env.R2_ACCOUNT_ID}|${env.R2_ACCESS_KEY_ID}|${env.R2_SECRET_ACCESS_KEY}`;
  if (cachedClient && cachedKey === signature) return cachedClient;
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  cachedKey = signature;
  return cachedClient;
}

function bucketFor(visibility, env = process.env) {
  return visibility === 'private' ? env.R2_PRIVATE_BUCKET : env.R2_PUBLIC_BUCKET;
}

function randomName() {
  return crypto.randomBytes(16).toString('hex');
}

function contentTypeFor(filePath, fallback = 'application/octet-stream') {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || fallback;
}

function extensionFor(mimetype, originalName = '') {
  return EXT_BY_MIME[mimetype] || path.extname(originalName).toLowerCase() || '';
}

/**
 * Resizes a picture to fit inside maxDimension x maxDimension (default 1000, never enlarges) and fixes its rotation, like the old Cloudinary
 * transformation did. PDFs, Word files and GIFs are returned untouched. If the picture cannot be processed the
 * original bytes are used, so an upload never fails because of the optimisation step.
 */
async function optimizeImage(buffer, mimetype, maxDimension = 1000) {
  if (!mimetype || !mimetype.startsWith('image/') || mimetype === 'image/gif') return buffer;
  try {
    const sharp = require('sharp');
    let pipeline = sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true });
    if (mimetype === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
    else if (mimetype === 'image/webp') pipeline = pipeline.webp({ quality: 80 });
    else pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
    return await pipeline.toBuffer();
  } catch {
    return buffer;
  }
}

async function putObject({ visibility = 'public', key, body, contentType }, env = process.env) {
  await getClient(env).send(
    new PutObjectCommand({
      Bucket: bucketFor(visibility, env),
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
}

/** Deleting a key that does not exist is not an error (S3 semantics). Returns true when the call succeeded. */
async function deleteObject(key, visibility = 'public', env = process.env) {
  if (!key) return false;
  await getClient(env).send(new DeleteObjectCommand({ Bucket: bucketFor(visibility, env), Key: key }));
  return true;
}

function publicUrl(key, env = process.env) {
  const base = String(env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/${String(key).split('/').map(encodeURIComponent).join('/')}`;
}

function privateReference(key) {
  return `${PRIVATE_PREFIX}${key}`;
}

function isPrivateReference(value) {
  return typeof value === 'string' && value.startsWith(PRIVATE_PREFIX);
}

function keyFromPrivateReference(value) {
  return value.slice(PRIVATE_PREFIX.length);
}

/** A signed link to a private object that stops working after `ttlSeconds`. */
async function signedUrl(key, { ttlSeconds = DEFAULT_LINK_TTL_SECONDS, downloadName, visibility = 'private' } = {}, env = process.env) {
  const command = new GetObjectCommand({
    Bucket: bucketFor(visibility, env),
    Key: key,
    ...(downloadName
      ? { ResponseContentDisposition: `attachment; filename="${String(downloadName).replace(/[^\w.\- ]/g, '_')}"` }
      : {}),
  });
  return getSignedUrl(getClient(env), command, { expiresIn: Math.max(1, Math.floor(ttlSeconds)) });
}

/**
 * Uploads a file that multer has already written to disk. Same result shape the old Cloudinary helper had
 * (secure_url, public_id, bytes, format), so the services that call it need few changes. The caller removes the
 * local copy. Images are resized; other files are stored as they are.
 */
async function uploadLocalFile(filePath, folder = 'uploads', { visibility = 'public', maxDimension = 1000 } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypeFor(filePath);
  const original = await fs.promises.readFile(filePath);
  const body = await optimizeImage(original, contentType, maxDimension);
  const key = `${folder}/${randomName()}${ext}`;
  await putObject({ visibility, key, body, contentType });
  return {
    secure_url: visibility === 'private' ? privateReference(key) : publicUrl(key),
    public_id: key,
    asset_id: key,
    bytes: body.length,
    format: ext.replace('.', ''),
    visibility,
  };
}

/** Uploads bytes held in memory (multer memory storage). */
async function uploadBuffer(buffer, { folder = 'uploads', mimetype, originalName = '', visibility = 'public', baseName } = {}) {
  const ext = extensionFor(mimetype, originalName);
  const body = await optimizeImage(buffer, mimetype);
  const key = `${folder}/${baseName ? `${baseName}-` : ''}${randomName()}${ext}`;
  await putObject({ visibility, key, body, contentType: mimetype });
  return {
    secure_url: visibility === 'private' ? privateReference(key) : publicUrl(key),
    public_id: key,
    asset_id: key,
    bytes: body.length,
    format: ext.replace('.', ''),
    visibility,
  };
}

/**
 * Turns a stored document into a link a browser or the server can open:
 *   - "r2://private/<key>"  -> a signed link (expires after ttlSeconds)
 *   - anything else (a public R2 URL, or an old Cloudinary URL that has not been migrated yet) -> unchanged
 */
async function resolveUrl(storedUrl, options = {}) {
  if (!storedUrl) return storedUrl;
  if (isPrivateReference(storedUrl)) return signedUrl(keyFromPrivateReference(storedUrl), options);
  return storedUrl;
}

module.exports = {
  PRIVATE_PREFIX,
  missingVariables,
  isConfigured,
  getClient,
  bucketFor,
  contentTypeFor,
  extensionFor,
  optimizeImage,
  putObject,
  deleteObject,
  publicUrl,
  privateReference,
  isPrivateReference,
  keyFromPrivateReference,
  signedUrl,
  uploadLocalFile,
  uploadBuffer,
  resolveUrl,
};
