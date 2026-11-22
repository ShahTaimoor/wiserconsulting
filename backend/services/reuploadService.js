/**
 * Document Re-upload Service
 * Business logic for document re-upload operations
 */

const fs = require('fs');
const FormSubmission = require('../models/FormSubmission');
const { AppError } = require('../middleware/errorHandler');
const r2 = require('../config/r2');

class ReuploadService {
  /**
   * Re-upload a document
   */
  async reuploadDocument(documentId, file, userEmail) {
    try {
      
      // Find the form submission that contains this document by user email
      const mongoose = require('mongoose');
      
      // Try to convert documentId to ObjectId if it's a valid string
      let docId;
      try {
        docId = mongoose.Types.ObjectId.isValid(documentId) ? new mongoose.Types.ObjectId(documentId) : documentId;
      } catch (error) {
        docId = documentId;
      }
      
      
      const submission = await FormSubmission.findOne({
        'documents._id': docId,
        email: userEmail
      });

      
      if (!submission) {
        const allUserSubmissions = await FormSubmission.find({ email: userEmail });
        
        if (allUserSubmissions.length > 0) {
          allUserSubmissions.forEach((sub, index) => {
            sub.documents.forEach((doc, docIndex) => {
            });
          });
        }
        
        throw new AppError('Document not found or you do not have permission to modify it', 404);
      }

      // Find the specific document in the documents array
      const documentIndex = submission.documents.findIndex(
        doc => doc._id.toString() === documentId || doc._id.equals(docId)
      );


      if (documentIndex === -1) {
        submission.documents.forEach((doc, index) => {
        });
        throw new AppError('Document not found', 404);
      }

      const oldDocument = submission.documents[documentIndex];
      // Delete the old file from R2 if it is one of ours (an old Cloudinary file has nothing to delete here)
      if (oldDocument.uploadType === 'r2' && oldDocument.cloudinaryPublicId) {
        try {
          await r2.deleteObject(oldDocument.cloudinaryPublicId, 'private');
        } catch (error) {
          console.error('Failed to delete old file from R2:', error.message);
          // Continue with upload even if deletion fails
        }
      }

      // Upload the new file to the private R2 bucket
      let uploaded;
      try {
        if (file.buffer) {
          uploaded = await r2.uploadBuffer(file.buffer, {
            folder: 'wiser-consulting/documents',
            mimetype: file.mimetype,
            originalName: file.originalname,
            visibility: 'private',
            baseName: oldDocument.fieldName || 'document',
          });
        } else if (file.path) {
          if (!fs.existsSync(file.path)) {
            throw new Error('Uploaded file is no longer available');
          }
          const bytes = fs.readFileSync(file.path);
          uploaded = await r2.uploadBuffer(bytes, {
            folder: 'wiser-consulting/documents',
            mimetype: file.mimetype,
            originalName: file.originalname,
            visibility: 'private',
            baseName: oldDocument.fieldName || 'document',
          });
          // Clean up temporary file
          fs.unlinkSync(file.path);
        } else {
          throw new Error('No file buffer or path available for upload');
        }
      } catch (error) {
        console.error('R2 upload failed:', error.message);
        throw new AppError(`Failed to upload file to cloud storage: ${error.message}`, 500);
      }

      // Update the document with new file information
      submission.documents[documentIndex] = {
        ...oldDocument,
        fieldName: oldDocument.fieldName,
        cloudinaryUrl: uploaded.secure_url,
        cloudinaryPublicId: uploaded.public_id,
        cloudinaryId: uploaded.asset_id,
        uploadType: 'r2',
        originalname: oldDocument.originalname || file.originalname,
        filename: oldDocument.filename || file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };

      // Remove admin comments for this specific document since it's being re-uploaded
      const initialCommentsCount = submission.adminComments.length;
      submission.adminComments = submission.adminComments.filter(
        comment => comment.documentId !== documentId
      );
      const removedCommentsCount = initialCommentsCount - submission.adminComments.length;

      // Save the updated submission
      await submission.save();

      return {
        documentId: documentId,
        cloudinaryUrl: await r2.resolveUrl(uploaded.secure_url),
        filename: file.originalname,
        uploadedAt: new Date()
      };

    } catch (error) {
      // Clean up uploaded file if it exists
      if (file.path && require('fs').existsSync(file.path)) {
        require('fs').unlinkSync(file.path);
      }
      throw error;
    }
  }
}

module.exports = new ReuploadService();
