const fs = require('fs');
const path = require('path');
const r2 = require('../config/r2');
const { uploadLocalToR2 } = require('../config/upload');

// Delete a file from R2. `visibility` is 'private' for assessment documents and 'public' for logos and photos.
const deleteFromR2 = async (key, visibility = 'public') => {
  try {
    await r2.deleteObject(key, visibility);
    return true;
  } catch (error) {
    console.error('Error deleting from R2:', error.message);
    return false;
  }
};

// Delete local files
const deleteLocalFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Local file deleted:', filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting local file:', error);
    return false;
  }
};

// Upload a local file to R2 (private bucket for documents) and delete the local copy
const uploadLocalFileToR2 = async (filePath, folder = 'visa-assessments', options = { visibility: 'private' }) =>
  uploadLocalToR2(filePath, folder, options);

// Convert documents stored on local disk to R2 documents
const convertLocalToR2 = async (documents) => {
  const convertedDocs = [];

  for (const doc of documents) {
    if (doc.uploadType === 'local' && doc.localPath) {
      try {
        const result = await uploadLocalFileToR2(doc.localPath);

        convertedDocs.push({
          ...doc,
          cloudinaryUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          cloudinaryId: result.asset_id,
          uploadType: 'r2',
          localPath: undefined,
        });
      } catch (error) {
        console.error(`Error converting ${doc.filename} to R2:`, error.message);
        // Keep the original local document if conversion fails
        convertedDocs.push(doc);
      }
    } else {
      convertedDocs.push(doc);
    }
  }

  return convertedDocs;
};

// Get a link for a document (local or R2). Private R2 documents get a signed link.
const getFileUrl = async (document, options) => {
  if ((document.uploadType === 'r2' || document.uploadType === 'cloudinary') && document.cloudinaryUrl) {
    return r2.resolveUrl(document.cloudinaryUrl, options);
  } else if (document.uploadType === 'local' && document.localPath) {
    return `/uploads/${path.basename(document.localPath)}`;
  }
  return null;
};

// Clean up files (local, R2, and any not-yet-migrated Cloudinary record, which has nothing to delete here)
const cleanupFiles = async (documents) => {
  for (const doc of documents) {
    if (doc.uploadType === 'r2' && doc.cloudinaryPublicId) {
      await deleteFromR2(doc.cloudinaryPublicId, 'private');
    } else if (doc.uploadType === 'local' && doc.localPath) {
      await deleteLocalFile(doc.localPath);
    }
  }
};

module.exports = {
  deleteFromR2,
  deleteLocalFile,
  uploadLocalFileToR2,
  convertLocalToR2,
  getFileUrl,
  cleanupFiles,
};
