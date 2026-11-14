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
      console.log('🔍 Re-upload request details:');
      console.log('- Document ID:', documentId);
      console.log('- Document ID type:', typeof documentId);
      console.log('- Document ID length:', documentId ? documentId.length : 'N/A');
      console.log('- User email:', userEmail);
      console.log('- File name:', file.originalname);
      console.log('- File size:', file.size);
      console.log('- File type:', file.mimetype);
      console.log('- File path:', file.path);
      
      // Special debugging for the specific document ID mentioned
      if (documentId === '69f87ef80c336f0e1de5ee72') {
        console.log('🎯 Processing specific document ID: 69f87ef80c336f0e1de5ee72');
      }

      // Find the form submission that contains this document by user email
      console.log('🔍 Searching for submission...');
      const mongoose = require('mongoose');
      
      // Try to convert documentId to ObjectId if it's a valid string
      let docId;
      try {
        docId = mongoose.Types.ObjectId.isValid(documentId) ? new mongoose.Types.ObjectId(documentId) : documentId;
      } catch (error) {
        docId = documentId;
      }
      
      console.log('🔍 Using document ID:', docId, '(original:', documentId + ')');
      
      const submission = await FormSubmission.findOne({
        'documents._id': docId,
        email: userEmail
      });

      console.log('📊 Search result:', submission ? 'Found' : 'Not found');
      
      if (!submission) {
        console.log('❌ Submission not found. Checking all submissions for this user...');
        const allUserSubmissions = await FormSubmission.find({ email: userEmail });
        console.log(`📊 Found ${allUserSubmissions.length} submissions for user:`, userEmail);
        
        if (allUserSubmissions.length > 0) {
          console.log('📋 Document IDs in user submissions:');
          allUserSubmissions.forEach((sub, index) => {
            console.log(`  Submission ${index + 1}:`);
            sub.documents.forEach((doc, docIndex) => {
              console.log(`    Document ${docIndex + 1}: ${doc._id} (${doc.originalname || doc.fieldName})`);
            });
          });
        }
        
        throw new AppError('Document not found or you do not have permission to modify it', 404);
      }

      // Find the specific document in the documents array
      const documentIndex = submission.documents.findIndex(
        doc => doc._id.toString() === documentId || doc._id.equals(docId)
      );

      console.log('📊 Document index found:', documentIndex);
      console.log('📋 Total documents in submission:', submission.documents.length);

      if (documentIndex === -1) {
        console.log('❌ Document not found in array');
        console.log('📋 Available document IDs:');
        submission.documents.forEach((doc, index) => {
          console.log(`  ${index}: ${doc._id} (${doc.originalname || doc.fieldName})`);
        });
        console.log('📋 Looking for ID:', documentId, 'or ObjectId:', docId);
        throw new AppError('Document not found', 404);
      }

      const oldDocument = submission.documents[documentIndex];
      console.log('📄 Old document details:');
      console.log('- Original name:', oldDocument.originalname);
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
      console.log('🔄 Updating document with new file information...');
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
      console.log('🧹 Removing admin comments for this document...');
      const initialCommentsCount = submission.adminComments.length;
      submission.adminComments = submission.adminComments.filter(
        comment => comment.documentId !== documentId
      );
      const removedCommentsCount = initialCommentsCount - submission.adminComments.length;
      console.log(`📊 Removed ${removedCommentsCount} admin comments`);

      // Save the updated submission
      console.log('💾 Saving updated submission...');
      await submission.save();
      console.log('✅ Submission saved successfully');

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
