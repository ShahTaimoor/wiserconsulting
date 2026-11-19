/**
 * Tourist Visa document uploads: every limit, type and error in one place.
 *
 * Change a number here and the upload route, the service and the tests that read these constants follow.
 * Nothing else in the backend hard-codes a limit.
 */

const engine = require('../shared/tourist-visa/engine');

const MB = 1024 * 1024;

/**
 * Largest single file. 4 MB because the backend may run on Vercel serverless, where a request body is
 * capped at 4.5 MB (the multipart wrapper around a 4 MB file stays under that). On a normal server this
 * can be raised to 5 MB: change this one number.
 */
const MAX_FILE_BYTES = 4 * MB;

/** Largest total of all files of one application (files in a slot that is no longer on the applicant's list still count). */
const MAX_TOTAL_BYTES = 120 * MB;

/** Room for the multipart boundaries and the "slot" field around the file, used for the early length check. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * The places a file can go, taken from the FILE questions of a config: { <slot id>: { max, question } }. `max` is the question's
 * maxFiles and `question` its number. There is ONE list of slots, the shared config's; nothing here is written out by hand, so the
 * backend and the form cannot drift apart. (Never rename or drop a slot id: files already stored under it keep that id.)
 */
function slotsOf(cfg) {
  return Object.freeze(
    Object.fromEntries(
      engine.getFileQuestions(cfg).map((q) => [q.slot, Object.freeze({ max: q.maxFiles, question: q.number, questionId: q.id })])
    )
  );
}

/** The slots of the real config. */
const SLOTS = slotsOf(engine.config);

/** What a file may be, decided by its first bytes (utils/detectFileType.js), never by its name or declared type. */
const FILE_TYPES = Object.freeze({
  pdf: Object.freeze({ mime: 'application/pdf', extension: 'pdf' }),
  jpg: Object.freeze({ mime: 'image/jpeg', extension: 'jpg' }),
  png: Object.freeze({ mime: 'image/png', extension: 'png' }),
});

/** How long a temporary link to a file works. */
const LINK_TTL_SECONDS = 2 * 60;

/** Where files live in R2: the private bucket, stored as raw files so PDFs are never processed. */
const STORAGE = Object.freeze({
  rootFolder: 'tourist-visa',
  resourceType: 'raw',
  deliveryType: 'authenticated',
});

/** Uploads per signed-in user per hour. Room for a full list of documents, several pages each and a few retries; small enough to stop a flood. */
const UPLOAD_RATE = Object.freeze({ windowMs: 60 * 60 * 1000, max: 120 });

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
  SLOT_NOT_AVAILABLE: [409, 'This document is not on your list. Check your answers, or choose one of the documents shown for you.'],
  TOO_MANY_FILES: [409, 'You have already uploaded the most files allowed here.'],
  TOTAL_TOO_LARGE: [409, 'Your files together are too large.'],
  DOCUMENTS_LOCKED: [409, 'This application has been submitted and its files can no longer be changed.'],
  DOCUMENT_NOT_FOUND: [404, 'File not found.'],
  APPLICATION_NOT_FOUND: [404, 'You have not started a Tourist Visa application yet.'],
  STORAGE_UNAVAILABLE: [503, 'File storage is not available. Please try again later.'],
  UPLOAD_FAILED: [502, 'The file could not be stored. Please try again.'],
  TOO_MANY_UPLOADS: [429, 'You have uploaded a lot of files in a short time. Please wait a while, then try again.'],
});

/** What the applicant's screen may show about the limits (no storage detail). */
function publicLimits(slots = SLOTS) {
  return {
    maxFileBytes: MAX_FILE_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    allowedTypes: Object.values(FILE_TYPES).map((t) => t.mime),
    slots: Object.fromEntries(Object.entries(slots).map(([id, slot]) => [id, { max: slot.max }])),
  };
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  SLOTS,
  slotsOf,
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
