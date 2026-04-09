const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Local storage configuration (Multer disk storage)
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// Configure Cloudinary storage with better folder structure
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'visa-assessments',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'],
    // Remove transformation for PDFs and other documents
    transformation: (req, file) => {
      // Only apply transformations to images, not PDFs or documents
      if (file.mimetype.startsWith('image/')) {
        return [
          { 
            width: 1000, 
            height: 1000, 
            crop: 'limit',
            quality: 'auto',
            fetch_format: 'auto'
          }
        ];
      }
      // Return empty array for non-images to preserve original format
      return [];
    },
    // Generate unique filenames
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      return `${file.fieldname}-${uniqueSuffix}`;
    },
    // Set resource type based on file type
    resource_type: (req, file) => {
      if (file.mimetype.startsWith('image/')) {
        return 'image';
      } else if (file.mimetype === 'application/pdf') {
        return 'raw'; // Use 'raw' for PDFs to preserve format
      } else {
        return 'auto';
      }
    },
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDF, DOC, DOCX are allowed.'), false);
  }
};

// Create multer upload instances
const uploadToCloudinary = multer({
  storage: cloudinaryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter,
});

const uploadToLocal = multer({
  storage: localStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter,
});

// Configure upload fields for both local and cloudinary
const uploadFields = uploadToCloudinary.fields([
  { name: "passports" },
  { name: "businessBankStatement" },
  { name: "personalBankStatement" },
  { name: "businessRegistration" },
  { name: "taxpayerCertificate" },
  { name: "incomeTaxReturns" },
  { name: "propertyDocuments" },
  { name: "frcFamily" },
  { name: "frcParents" },
  { name: "marriageCertificate" },
  { name: "invitationLetter" },
  { name: "flightReservation" },
  { name: "hotelReservation" },
  { name: "anyOtherDocuments" },
  { name: "coverLetter" },
]);

const uploadFieldsLocal = uploadToLocal.fields([
  { name: "passports" },
  { name: "businessBankStatement" },
  { name: "personalBankStatement" },
  { name: "businessRegistration" },
  { name: "taxpayerCertificate" },
  { name: "incomeTaxReturns" },
  { name: "propertyDocuments" },
  { name: "frcFamily" },
  { name: "frcParents" },
  { name: "marriageCertificate" },
  { name: "invitationLetter" },
  { name: "flightReservation" },
  { name: "hotelReservation" },
  { name: "anyOtherDocuments" },
  { name: "coverLetter" },
]);

// Function to upload local files to Cloudinary
const uploadLocalToCloudinary = async (filePath, folder = 'visa-assessments') => {
  try {
    // Determine resource type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let resourceType = 'auto';
    
    if (ext === '.pdf') {
      resourceType = 'raw';
    } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      resourceType = 'image';
    }

    const uploadOptions = {
      folder: folder,
      resource_type: resourceType,
    };

    // Only apply transformations for images
    if (resourceType === 'image') {
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

    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    
    // Delete local file after successful upload to Cloudinary
    fs.unlinkSync(filePath);
    
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// Function to process files (local or cloudinary)
const processFiles = (files, uploadType = 'cloudinary') => {
  const documents = [];
  
  if (files) {
    Object.keys(files).forEach((fieldName) => {
      files[fieldName].forEach((file) => {
        if (uploadType === 'cloudinary') {
          // Cloudinary upload
          documents.push({
            fieldName,
            originalname: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            cloudinaryUrl: file.path, // Cloudinary URL
            cloudinaryPublicId: file.filename, // Cloudinary public ID
            cloudinaryId: file.filename, // Cloudinary asset ID
            uploadType: 'cloudinary'
          });
        } else {
          // Local upload
          documents.push({
            fieldName,
            originalname: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            localPath: file.path, // Local file path
            uploadType: 'local'
          });
        }
      });
    });
  }
  
  return documents;
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  uploadToLocal,
  uploadFields,
  uploadFieldsLocal,
  uploadLocalToCloudinary,
  processFiles,
  storage: cloudinaryStorage,
  localStorage,
  uploadsDir
};
