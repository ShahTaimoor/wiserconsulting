// Deprecated: Cloudinary has been replaced by Cloudflare R2. This file only re-exports config/upload.js so an old
// import keeps working; use require('./upload') in new code. The old helper name is kept as an alias.
const upload = require('./upload');

module.exports = {
  ...upload,
  uploadToCloudinary: upload.uploadToR2,
  uploadLocalToCloudinary: upload.uploadLocalToR2,
};
