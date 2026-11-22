/**
 * Tells what a voice recording really is from its first bytes ("magic bytes"), never from the name or the declared type.
 * Returns { ext, mime } for the formats a browser's recorder produces (WebM, Ogg, MP4/M4A) and the common WAV and MP3, or null.
 */
function detectAudioType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const ascii = (from, to) => buffer.subarray(from, to).toString('latin1');
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (ascii(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  return null;
}

module.exports = detectAudioType;
