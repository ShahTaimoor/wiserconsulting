// Deprecated: Cloudinary has been replaced by Cloudflare R2. Use middleware/fileStorage.js. Old names are aliases.
const storage = require('./fileStorage');

module.exports = {
  ...storage,
  deleteFromCloudinary: storage.deleteFromR2,
  uploadLocalToCloudinary: storage.uploadLocalFileToR2,
  convertLocalToCloudinary: storage.convertLocalToR2,
};
