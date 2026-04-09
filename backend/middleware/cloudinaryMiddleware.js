const { cloudinary } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

// Middleware to delete files from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('File deleted from Cloudinary:', result);
    return true;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return false;
  }
};

// Middleware to delete local files
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

// Middleware to get optimized image URL
const getOptimizedImageUrl = (publicId, options = {}) => {
  const defaultOptions = {
    width: 800,
    height: 600,
    crop: 'fill',
    quality: 'auto',
    format: 'auto',
  };

  const finalOptions = { ...defaultOptions, ...options };
  
  return cloudinary.url(publicId, finalOptions);
};

// Middleware to get thumbnail URL
const getThumbnailUrl = (publicId, width = 150, height = 150) => {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    quality: 'auto',
    format: 'auto',
  });
};

// Middleware to upload single file to Cloudinary
const uploadSingleToCloudinary = async (file, folder = 'visa-assessments') => {
  try {
    // Determine resource type based on file mimetype
    let resourceType = 'auto';
    let uploadOptions = {
      folder: folder,
      resource_type: resourceType,
    };

    if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
      uploadOptions.transformation = [
        { 
          width: 1000, 
          height: 1000, 
          crop: 'limit',
          quality: 'auto',
          fetch_format: 'auto'
        }
      ];
    } else if (file.mimetype === 'application/pdf') {
      resourceType = 'raw'; // Use 'raw' for PDFs to preserve format
    }

    uploadOptions.resource_type = resourceType;

    const result = await cloudinary.uploader.upload(file.path, uploadOptions);
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// Middleware to upload local file to Cloudinary and delete local copy
const uploadLocalToCloudinary = async (filePath, folder = 'visa-assessments') => {
  try {
    // Determine resource type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let resourceType = 'auto';
    let uploadOptions = {
      folder: folder,
      resource_type: resourceType,
    };

    if (ext === '.pdf') {
      resourceType = 'raw'; // Use 'raw' for PDFs to preserve format
    } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      resourceType = 'image';
      uploadOptions.transformation = [
        { 
          width: 1000, 
          height: 1000, 
          crop: 'limit',
          quality: 'auto',
          fetch_format: 'auto'
        }
      ];
    }

    uploadOptions.resource_type = resourceType;

    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    
    // Delete local file after successful upload
    await deleteLocalFile(filePath);
    
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// Middleware to convert local files to Cloudinary format
const convertLocalToCloudinary = async (documents) => {
  const convertedDocs = [];
  
  for (const doc of documents) {
    if (doc.uploadType === 'local' && doc.localPath) {
      try {
        const cloudinaryResult = await uploadLocalToCloudinary(doc.localPath);
        
        convertedDocs.push({
          ...doc,
          cloudinaryUrl: cloudinaryResult.secure_url,
          cloudinaryPublicId: cloudinaryResult.public_id,
          cloudinaryId: cloudinaryResult.asset_id,
          uploadType: 'cloudinary',
          localPath: undefined // Remove local path
        });
      } catch (error) {
        console.error(`Error converting ${doc.filename} to Cloudinary:`, error);
        // Keep the original local document if conversion fails
        convertedDocs.push(doc);
      }
    } else {
      convertedDocs.push(doc);
    }
  }
  
  return convertedDocs;
};

// Middleware to get file URL (local or cloudinary)
const getFileUrl = (document) => {
  if (document.uploadType === 'cloudinary' && document.cloudinaryUrl) {
    return document.cloudinaryUrl;
  } else if (document.uploadType === 'local' && document.localPath) {
    // For local files, you might want to serve them through a static route
    return `/uploads/${path.basename(document.localPath)}`;
  }
  return null;
};

// Middleware to clean up files (both local and cloudinary)
const cleanupFiles = async (documents) => {
  for (const doc of documents) {
    if (doc.uploadType === 'cloudinary' && doc.cloudinaryPublicId) {
      await deleteFromCloudinary(doc.cloudinaryPublicId);
    } else if (doc.uploadType === 'local' && doc.localPath) {
      await deleteLocalFile(doc.localPath);
    }
  }
};

module.exports = {
  deleteFromCloudinary,
  deleteLocalFile,
  getOptimizedImageUrl,
  getThumbnailUrl,
  uploadSingleToCloudinary,
  uploadLocalToCloudinary,
  convertLocalToCloudinary,
  getFileUrl,
  cleanupFiles,
};
