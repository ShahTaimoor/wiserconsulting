/**
 * FormSubmission Service
 * Business logic for form submission operations
 */

const formSubmissionRepository = require('../repositories/formSubmissionRepository');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');

class FormSubmissionService {
  /**
   * Create new form submission
   */
  async createSubmission(submissionData) {
    return await formSubmissionRepository.create(submissionData);
  }

  /**
   * Get all submissions with pagination
   */
  async getAllSubmissions(skip, limit) {
    return await formSubmissionRepository.findAll(skip, limit);
  }

  /**
   * Get submission by ID
   */
  async getSubmissionById(id) {
    const submission = await formSubmissionRepository.findById(id);
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }
    return submission;
  }

  /**
   * Add file URLs to submission documents
   */
  async addFileUrls(submission) {
    const documentsWithUrls = submission.documents.map(doc => {
      const docObj = doc.toObject();
      if (doc.uploadType === 'cloudinary' && doc.cloudinaryUrl) {
        docObj.fileUrl = doc.cloudinaryUrl;
      } else if (doc.uploadType === 'local' && doc.localPath) {
        docObj.fileUrl = `/uploads/${doc.filename}`;
      }
      return docObj;
    });

    return {
      ...submission.toObject(),
      documents: documentsWithUrls
    };
  }

  /**
   * Get submission by email
   */
  async getSubmissionByEmail(email) {
    const submission = await formSubmissionRepository.findByEmail(email);
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }
    return submission;
  }

  /**
   * Update submission status
   */
  async updateStatus(id, status) {
    const submission = await formSubmissionRepository.updateStatus(id, status);
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }
    return submission;
  }

  /**
   * Add admin comment to document
   */
  async addAdminComment(submissionId, documentId, comment) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }

    const document = submission.documents.id(documentId);
    if (!document) {
      throw new AppError('Document not found', 404);
    }

    // Update document comment
    await formSubmissionRepository.updateDocumentComment(
      submissionId,
      documentId,
      comment
    );

    // Add to admin comments array
    const commentData = {
      documentId: documentId,
      documentName: document.originalname,
      comment: comment,
      createdAt: new Date()
    };

    await formSubmissionRepository.addAdminComment(submissionId, commentData);

    // Send email to customer
    await this.sendCommentEmail(submission, document, comment);

    return { message: 'Comment saved and email sent successfully' };
  }

  /**
   * Add customer comment
   */
  async addCustomerComment(submissionId, message) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }

    const commentData = {
      message: message,
      createdAt: new Date()
    };

    await formSubmissionRepository.addCustomerComment(submissionId, commentData);
    return { message: 'Comment added successfully' };
  }

  /**
   * Delete submission (soft delete with file cleanup)
   */
  async deleteSubmission(id) {
    const submission = await formSubmissionRepository.findById(id);
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }

    // Clean up files before soft delete
    if (submission.documents && submission.documents.length > 0) {
      const { cleanupFiles } = require('../middleware/cloudinaryMiddleware');
      await cleanupFiles(submission.documents);
    }

    // Soft delete submission
    await formSubmissionRepository.softDelete(id);
    return { message: 'Submission deleted successfully' };
  }

  /**
   * Get file URL for document
   */
  async getFileUrl(submissionId, documentId) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }

    const document = submission.documents.id(documentId);
    if (!document) {
      throw new AppError('Document not found', 404);
    }

    let fileUrl;
    if (document.uploadType === 'cloudinary' && document.cloudinaryUrl) {
      fileUrl = document.cloudinaryUrl;
    } else if (document.uploadType === 'local' && document.localPath) {
      fileUrl = `/uploads/${document.filename}`;
    } else {
      throw new AppError('File not found', 404);
    }

    return { fileUrl, document };
  }

  /**
   * Send comment email to customer
   */
  async sendCommentEmail(submission, document, comment) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: submission.email,
        subject: `Document Review Update - ${submission.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Document Review Update</h2>
            <p>Dear ${submission.name},</p>
            <p>Your visa assessment application has been reviewed. Here's an update:</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #374151; margin-top: 0;">Document: ${document.originalname}</h3>
              <p style="color: #6b7280; margin-bottom: 10px;"><strong>Admin Comment:</strong></p>
              <p style="background-color: white; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb;">
                ${comment}
              </p>
            </div>
            
            <p>You can view all updates and comments on your application dashboard.</p>
            
            <div style="background-color: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #1e40af;">
                <strong>Application Details:</strong><br>
                Destination: ${submission.destinationCountry}<br>
                Visa Type: ${submission.visaType}<br>
                Status: ${submission.status}
              </p>
            </div>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br>Visa Assessment Team</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      logger.info('Comment email sent successfully');
    } catch (error) {
      logger.error('Error sending email:', error);
      // Don't throw error - email failure shouldn't break the flow
    }
  }
}

module.exports = new FormSubmissionService();

