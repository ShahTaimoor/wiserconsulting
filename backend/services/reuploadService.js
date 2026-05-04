/**
 * Document Re-upload Service
 * Business logic for document re-upload operations
 */

const cloudinary = require('cloudinary').v2;
const FormSubmission = require('../models/FormSubmission');
const { AppError } = require('../middleware/errorHandler');

// Ensure Cloudinary is configured
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('🔧 Cloudinary configured in re-upload service');
console.log('- cloud_name:', process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Not set');
console.log('- api_key:', process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set');
console.log('- api_secret:', process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set');

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
      console.log('- Cloudinary URL:', oldDocument.cloudinaryUrl || 'No URL');
      console.log('- Cloudinary Public ID:', oldDocument.cloudinaryPublicId || 'No ID');

      // Delete old file from Cloudinary if it exists
      if (oldDocument.cloudinaryPublicId) {
        console.log('🗑️ Deleting old file from Cloudinary...');
        try {
          await cloudinary.uploader.destroy(oldDocument.cloudinaryPublicId);
          console.log('✅ Old file deleted successfully');
        } catch (error) {
          console.error('❌ Failed to delete old file from Cloudinary:', error);
          // Continue with upload even if deletion fails
        }
      }

      // Upload new file to Cloudinary
      console.log('⬆️ Uploading new file to Cloudinary...');
      let cloudinaryResult;
      try {
        console.log('📁 File object details:');
        console.log('- file.buffer exists:', !!file.buffer);
        console.log('- file.path:', file.path);
        console.log('- file.mimetype:', file.mimetype);
        console.log('- file.originalname:', file.originalname);
        
        // Use upload_stream for better memory storage handling
        if (file.buffer) {
          console.log('📁 Using file buffer with upload_stream');
          
          cloudinaryResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'wiser-consulting/documents',
                resource_type: 'auto',
                format: file.mimetype.startsWith('image/') ? 'auto' : undefined,
                public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
              },
              (error, result) => {
                if (error) {
                  console.error('❌ Cloudinary upload_stream error:', error);
                  reject(error);
                } else {
                  console.log('✅ Upload stream completed successfully');
                  resolve(result);
                }
              }
            );
            
            // Write the buffer to the stream
            uploadStream.end(file.buffer);
          });
          
        } else if (file.path) {
          console.log('📁 Using file path with upload');
          const fs = require('fs');
          
          if (!fs.existsSync(file.path)) {
            throw new Error(`File path does not exist: ${file.path}`);
          }
          
          cloudinaryResult = await cloudinary.uploader.upload(file.path, {
            folder: 'wiser-consulting/documents',
            resource_type: 'auto',
            format: file.mimetype.startsWith('image/') ? 'auto' : undefined,
            public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
          });
          
          // Clean up temporary file
          fs.unlinkSync(file.path);
          console.log('🗑️ Cleaned up temporary file');
          
        } else {
          throw new Error('No file buffer or path available for upload');
        }
        
        console.log('✅ New file uploaded successfully');
        console.log('- New URL:', cloudinaryResult.secure_url);
        console.log('- New Public ID:', cloudinaryResult.public_id);
        console.log('- File size:', cloudinaryResult.bytes);
        console.log('- Format:', cloudinaryResult.format);
        
      } catch (error) {
        console.error('❌ Cloudinary upload failed with detailed error:');
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        // Check for specific Cloudinary errors
        if (error.message.includes('Invalid credentials')) {
          console.error('❌ Cloudinary authentication failed - check API keys');
        } else if (error.message.includes('Cloud name')) {
          console.error('❌ Cloudinary cloud name is invalid');
        } else if (error.message.includes('Upload preset')) {
          console.error('❌ Cloudinary upload preset issue');
        }
        
        throw new AppError(`Failed to upload file to cloud storage: ${error.message}`, 500);
      }

      // Update the document with new file information
      console.log('🔄 Updating document with new file information...');
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
