const multer = require('multer');
const path = require('path');
const fs = require('fs');
const r2 = require('./r2');

// Create uploads directory if it doesn't exist (temporary files before they go to R2, and local-only uploads)
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

const limits = { fileSize: 10 * 1024 * 1024 }; // 10MB limit

// Assessment documents (passports, bank statements ...) arrive in memory and are then stored in the PRIVATE R2 bucket.
const uploadToR2 = multer({ storage: multer.memoryStorage(), limits, fileFilter });
const uploadToLocal = multer({ storage: localStorage, limits, fileFilter });

const FIELD_NAMES = [
  'passports',
  'businessBankStatement',
  'personalBankStatement',
  'businessRegistration',
  'taxpayerCertificate',
  'incomeTaxReturns',
  'propertyDocuments',
  'frcFamily',
  'frcParents',
  'marriageCertificate',
  'invitationLetter',
  'flightReservation',
  'hotelReservation',
  'anyOtherDocuments',
  'coverLetter',
];

const fieldList = FIELD_NAMES.map((name) => ({ name }));

/**
 * After multer has read the files into memory, store each one in the private bucket and give it the same
 * properties the old Cloudinary storage gave (filename = storage key, path = stored reference).
 */
const storeFilesInR2 = async (req, res, next) => {
  try {
    if (!req.files) return next();
    for (const files of Object.values(req.files)) {
      for (const file of files) {
        const stored = await r2.uploadBuffer(file.buffer, {
          folder: 'visa-assessments',
          mimetype: file.mimetype,
          originalName: file.originalname,
          visibility: 'private',
          baseName: file.fieldname,
        });
        file.filename = stored.public_id;
        file.path = stored.secure_url; // "r2://private/<key>"
        file.size = stored.bytes;
        file.storage = 'r2';
        delete file.buffer;
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

// Upload fields for R2 (an array of handlers: Express runs them in order) and for local disk
const uploadFields = [uploadToR2.fields(fieldList), storeFilesInR2];
const uploadFieldsLocal = uploadToLocal.fields(fieldList);

// Function to upload a local (temporary) file to the PUBLIC R2 bucket. The caller's local copy is deleted.
const uploadLocalToR2 = async (filePath, folder = 'uploads', options = {}) => {
  try {
    const result = await r2.uploadLocalFile(filePath, folder, options);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // the temporary file is already gone; nothing to do
    }
    return result;
  } catch (error) {
    console.error('R2 upload error:', error.message);
    throw error;
  }
};

// Function to process uploaded files into the shape stored on a submission
const processFiles = (files, uploadType = 'r2') => {
  const documents = [];

  if (files) {
    Object.keys(files).forEach((fieldName) => {
      files[fieldName].forEach((file) => {
        if (uploadType === 'local') {
          documents.push({
            fieldName,
            originalname: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            localPath: file.path,
            uploadType: 'local',
          });
        } else {
          // The field names keep the old "cloudinary*" spelling so existing data and the admin screen keep working.
          documents.push({
            fieldName,
            originalname: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            cloudinaryUrl: file.path, // "r2://private/<key>"
            cloudinaryPublicId: file.filename, // the R2 key
            cloudinaryId: file.filename,
            uploadType: 'r2',
          });
        }
      });
    });
  }

  return documents;
};

module.exports = {
  uploadToR2,
  uploadToLocal,
  uploadFields,
  uploadFieldsLocal,
  uploadLocalToR2,
  processFiles,
  localStorage,
  uploadsDir,
  storeFilesInR2,
};
