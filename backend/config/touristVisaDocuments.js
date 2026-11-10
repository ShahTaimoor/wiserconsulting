/**
 * Tourist Visa document uploads: every limit, type and error in one place.
 *
 * Change a number here and the upload route, the service and the tests that read these constants follow.
 * Nothing else in the backend hard-codes a limit.
 */

const MB = 1024 * 1024;

/**
 * Largest single file. 4 MB because the backend may run on Vercel serverless, where a request body is
 * capped at 4.5 MB (the multipart wrapper around a 4 MB file stays under that). On a normal server this
 * can be raised to 5 MB: change this one number.
 */
const MAX_FILE_BYTES = 4 * MB;

/** Largest total of all files of one application. */
const MAX_TOTAL_BYTES = 40 * MB;

/** Room for the multipart boundaries and the "slot" field around the file, used for the early length check. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** The two places a file can go. `question` is the spec number of the question the slot belongs to. */
const SLOTS = Object.freeze({
  passport: Object.freeze({ max: 3, question: '10.6' }),
  funds: Object.freeze({ max: 10, question: '10.7' }),
});

/** What a file may be, decided by its first bytes (utils/detectFileType.js), never by its name or declared type. */
const FILE_TYPES = Object.freeze({
  pdf: Object.freeze({ mime: 'application/pdf', extension: 'pdf' }),
  jpg: Object.freeze({ mime: 'image/jpeg', extension: 'jpg' }),
  png: Object.freeze({ mime: 'image/png', extension: 'png' }),
});

/** How long a temporary link to a file works. */
const LINK_TTL_SECONDS = 2 * 60;

/** Where files live in Cloudinary: private ("authenticated"), as raw files so PDFs are never processed. */
const STORAGE = Object.freeze({
  rootFolder: 'tourist-visa',
  resourceType: 'raw',
  deliveryType: 'authenticated',
});

/** Uploads per signed-in user. Generous for 13 files and a few retries, small enough to stop a flood. */
const UPLOAD_RATE = Object.freeze({ windowMs: 60 * 60 * 1000, max: 40 });

/** Longest original file name that is kept (for display). */
const MAX_NAME_LENGTH = 150;

/** Name used when the browser sends no usable one. */
const FALLBACK_NAME = 'document';

/** The only form fields an upload may carry. */
const UPLOAD_FIELDS = Object.freeze({ file: 'file', slot: 'slot' });

/**
 * Error codes: [HTTP status, message]. The messages are fixed text, so nothing a caller sent (a file
 * name, a slot) can come back in a response or a log line.
 */
const DOCUMENT_ERRORS = Object.freeze({
  FILE_REQUIRED: [400, 'Choose a file to upload.'],
  FILE_EMPTY: [400, 'The file is empty.'],
  INVALID_SLOT: [400, 'Choose where this file belongs.'],
  INVALID_UPLOAD: [400, 'The upload could not be read.'],
  WRONG_TYPE: [415, 'Only PDF, JPG or PNG files can be uploaded.'],
  FILE_TOO_LARGE: [413, 'This file is too large.'],
  TOO_MANY_FILES: [409, 'You have already uploaded the most files allowed here.'],
  TOTAL_TOO_LARGE: [409, 'Your files together are too large.'],
  DOCUMENTS_LOCKED: [409, 'This application has been submitted and its files can no longer be changed.'],
  DOCUMENT_NOT_FOUND: [404, 'File not found.'],
  APPLICATION_NOT_FOUND: [404, 'You have not started a Tourist Visa application yet.'],
  STORAGE_UNAVAILABLE: [503, 'File storage is not available. Please try again later.'],
  UPLOAD_FAILED: [502, 'The file could not be stored. Please try again.'],
  TOO_MANY_UPLOADS: [429, 'Too many uploads. Please try again later.'],
});

/** What the applicant's screen may show about the limits (no storage detail). */
function publicLimits() {
  return {
    maxFileBytes: MAX_FILE_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    allowedTypes: Object.values(FILE_TYPES).map((t) => t.mime),
    slots: Object.fromEntries(Object.entries(SLOTS).map(([id, slot]) => [id, { max: slot.max }])),
  };
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  SLOTS,
  FILE_TYPES,
  LINK_TTL_SECONDS,
  STORAGE,
  UPLOAD_RATE,
  MAX_NAME_LENGTH,
  FALLBACK_NAME,
  UPLOAD_FIELDS,
  DOCUMENT_ERRORS,
  publicLimits,
};
