/**
 * What an applicant is shown about an uploaded file: an allowlist, so a field added to the model later
 * (the storage id, the resource type, the storage format) is never sent by accident.
 * `originalName` must already be decrypted; there is no link and no storage id in the result.
 */
function toDocumentView(doc) {
  return {
    id: doc.id,
    slot: doc.slot,
    name: doc.originalName,
    size: doc.bytes,
    type: doc.mime,
    uploadedAt: doc.uploadedAt,
  };
}

module.exports = { toDocumentView };
