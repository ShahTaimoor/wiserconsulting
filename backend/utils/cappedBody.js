/**
 * Reads a fetch response's body as text, giving up as soon as it is larger than `maxBytes` (a streamed body is
 * stopped at the limit rather than read to the end). Throws a plain Error with a fixed message.
 */
async function readCappedText(response, maxBytes) {
  const declared = Number(response.headers && response.headers.get && response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('too large');
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('too large');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = { readCappedText };
