/**
 * Tells what a file really is from its first bytes ("magic bytes").
 *
 * The file name and the type the browser declared are never looked at: anyone can rename a file or
 * send any type. Returns a key of FILE_TYPES ("pdf", "jpg", "png") or null when the content is none of them.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
// "%PDF-" and a version such as 1.7 or 2.0.
const PDF_HEADER = /^%PDF-[0-9]\.[0-9]/;

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) return null;
  if (buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'png';
  if (buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'jpg';
  if (PDF_HEADER.test(buffer.subarray(0, 8).toString('latin1'))) return 'pdf';
  return null;
}

module.exports = detectFileType;
