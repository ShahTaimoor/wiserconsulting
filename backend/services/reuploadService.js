/**
 * Document Re-upload Service
 * Business logic for document re-upload operations
 */

const cloudinary = require('cloudinary').v2;
const FormSubmission = require('../models/FormSubmission');
const { AppError } = require('../middleware/errorHandler');

class ReuploadService {
  /**
   * Re-upload a document
   */
  async reuploadDocument(documentId, file, userEmail) {
    try {
      // Find the form submission that contains this document by user email
      const submission = await FormSubmission.findOne({
        'documents._id': documentId,
        email: userEmail
      });

      if (!submission) {
        throw new AppError('Document not found or you do not have permission to modify it', 404);
      }

      // Find the specific document in the documents array
      const documentIndex = submission.documents.findIndex(
        doc => doc._id.toString() === documentId
      );

      if (documentIndex === -1) {
        throw new AppError('Document not found', 404);
      }

      const oldDocument = submission.documents[documentIndex];

      // Delete old file from Cloudinary if it exists
      if (oldDocument.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(oldDocument.cloudinaryPublicId);
        } catch (error) {
          console.error('Failed to delete old file from Cloudinary:', error);
          // Continue with upload even if deletion fails
        }
      }

      // Upload new file to Cloudinary
      let cloudinaryResult;
      try {
        cloudinaryResult = await cloudinary.uploader.upload(file.path, {
          folder: 'wiser-consulting/documents',
          resource_type: 'auto',
          format: file.mimetype.startsWith('image/') ? 'auto' : undefined,
        });
      } catch (error) {
        throw new AppError('Failed to upload file to cloud storage', 500);
      }

      // Update the document with new file information
      submission.documents[documentIndex] = {
        ...oldDocument,
        cloudinaryUrl: cloudinaryResult.secure_url,
        cloudinaryPublicId: cloudinaryResult.public_id,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };

      // Remove admin comments for this specific document since it's being re-uploaded
      submission.adminComments = submission.adminComments.filter(
        comment => comment.documentId !== documentId
      );

      // Save the updated submission
      await submission.save();

      return {
        documentId: documentId,
        cloudinaryUrl: cloudinaryResult.secure_url,
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
