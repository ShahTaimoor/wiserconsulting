/**
 * FormSubmission Service
 * Business logic for form submission operations
 */

const formSubmissionRepository = require("../repositories/formSubmissionRepository");
const detectAudioType = require('../utils/detectAudioType');
const securityLog = require('../utils/securityLog');
const escapeHtml = require('../utils/escapeHtml');
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const { sendMail } = require("../config/mail");
const r2 = require("../config/r2");

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
   * Get submission analytics summary
   */
  async getSummaryStats() {
    const totalSubmissions = await formSubmissionRepository.countAll();
    const statusCounts = await formSubmissionRepository.countByStatus();
    const destinationResults =
      await formSubmissionRepository.countByDestination(5);

    return {
      totalSubmissions,
      statusCounts,
      topDestinations: destinationResults.map((item) => ({
        destination: item._id,
        count: item.count,
      })),
    };
  }

  /**
   * Get submission by ID
   */
  async getSubmissionById(id) {
    const submission = await formSubmissionRepository.findById(id);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }
    return submission;
  }

  /**
   * Add file URLs to submission documents and ensure fieldName is set
   */
  async addFileUrls(submission) {
    const documentsWithUrls = await Promise.all(submission.documents.map(async (doc) => {
      const docObj = doc.toObject();
      
      // Ensure fieldName is set - extract from public ID if needed
      if (!docObj.fieldName && docObj.cloudinaryPublicId) {
        const parts = docObj.cloudinaryPublicId.split('-');
        if (parts.length > 0) {
          docObj.fieldName = parts[0]; // Extract field name from public ID
        }
      }
      
      if (
        (doc.uploadType === "r2" || doc.uploadType === "cloudinary") &&
        doc.cloudinaryUrl
      ) {
        // A private R2 reference becomes a signed link that expires in an hour.
        docObj.fileUrl = await r2.resolveUrl(doc.cloudinaryUrl);
        docObj.cloudinaryUrl = docObj.fileUrl;
      } else if (doc.uploadType === "local" && doc.localPath) {
        docObj.fileUrl = `/uploads/${doc.filename}`;
      }
      return docObj;
    }));

    return {
      ...submission.toObject(),
      documents: documentsWithUrls,
    };
  }

  /**
   * Get submission by email
   */
  async getSubmissionByEmail(email) {
    const submission = await formSubmissionRepository.findByEmail(email);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }
    // Private R2 documents are stored as r2://private/<key>; the owner gets signed links that expire in an hour.
    return await this.addFileUrls(submission);
  }

  /**
   * Update submission status
   */
  async updateStatus(id, status) {
    const submission = await formSubmissionRepository.updateStatus(id, status);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }
    return submission;
  }

  /**
   * Add admin comment to document
   */
  async addAdminComment(submissionId, documentId, comment) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }

    const document = submission.documents.id(documentId);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    // Update document comment
    await formSubmissionRepository.updateDocumentComment(
      submissionId,
      documentId,
      comment,
    );

    // Add to admin comments array
    const commentData = {
      documentId: documentId,
      documentName: document.originalname,
      comment: comment,
      createdAt: new Date(),
    };

    await formSubmissionRepository.addAdminComment(submissionId, commentData);

    // Send email to customer
    await this.sendCommentEmail(submission, document, comment);

    return { message: "Comment saved and email sent successfully" };
  }

  /**
   * Add customer comment
   */
  async addCustomerComment(submissionId, message) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }

    const commentData = {
      message: message,
      createdAt: new Date(),
    };

    await formSubmissionRepository.addCustomerComment(
      submissionId,
      commentData,
    );
    return { message: "Comment added successfully" };
  }

  /**
   * Stores a recorded voice note in the PRIVATE bucket and returns the fields kept on the comment.
   * What the bytes are comes from their first bytes only; anything that is not audio is refused.
   */
  async storeVoice(file, seconds) {
    if (!file || !file.buffer) {
      throw new AppError("No voice recording provided", 400);
    }
    const type = detectAudioType(file.buffer);
    if (!type) {
      securityLog.record("upload_rejected", { method: "POST" }, { reason: "voice_content_not_audio" });
      throw new AppError("The recording is not a valid audio file.", 400);
    }
    const stored = await r2.uploadBuffer(file.buffer, {
      folder: "voice-notes",
      mimetype: type.mime,
      originalName: `voice.${type.ext}`,
      visibility: "private",
      baseName: "voice",
    });
    const length = Math.min(180, Math.max(0, parseInt(seconds, 10) || 0));
    return { voiceRef: stored.secure_url, voiceMime: type.mime, voiceSeconds: length };
  }

  /**
   * Admin: a voice note on a document (the customer is e-mailed that there is one to listen to)
   */
  async addAdminVoice(submissionId, documentId, file, seconds) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }
    const document = submission.documents.id(documentId);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    const voice = await this.storeVoice(file, seconds);
    await formSubmissionRepository.addAdminComment(submissionId, {
      documentId,
      documentName: document.originalname,
      comment: "",
      ...voice,
      createdAt: new Date(),
    });
    await this.sendCommentEmail(submission, document, "We left you a voice note. Please sign in to your account and open Comments to listen to it.");
    return { message: "Voice note saved and email sent successfully" };
  }

  /**
   * Customer: a voice reply
   */
  async addCustomerVoice(submissionId, file, seconds) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }
    const voice = await this.storeVoice(file, seconds);
    await formSubmissionRepository.addCustomerComment(submissionId, { message: "", ...voice, createdAt: new Date() });
    return { message: "Voice note added successfully" };
  }

  /**
   * A short-lived signed link to listen to one voice note (the route has already checked who is asking)
   */
  async getVoiceUrl(submissionId, kind, commentId) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }
    const list = kind === "admin" ? submission.adminComments : submission.customerComments;
    const comment = list && list.id ? list.id(commentId) : null;
    if (!comment || !comment.voiceRef) {
      throw new AppError("Voice note not found", 404);
    }
    return { url: await r2.resolveUrl(comment.voiceRef, { ttlSeconds: 600 }), mime: comment.voiceMime, seconds: comment.voiceSeconds };
  }

  /**
   * Rename a document
   */
  async renameDocument(submissionId, documentId, newName) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }

    const document = submission.documents.id(documentId);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    const updatedDocument = await formSubmissionRepository.renameDocument(
      submissionId,
      documentId,
      newName
    );

    return { document: updatedDocument };
  }

  /**
   * Delete document from submission
   */
  async deleteDocument(submissionId, documentId) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }

    const document = submission.documents.id(documentId);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    // Clean up file (local or R2)
    const { cleanupFiles } = require("../middleware/fileStorage");
    await cleanupFiles([document]);

    // Remove from repository
    return await formSubmissionRepository.deleteDocument(
      submissionId,
      documentId,
    );
  }

  /**
   * Delete submission (soft delete with file cleanup)
   */
  async deleteSubmission(id) {
    const submission = await formSubmissionRepository.findById(id);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }

    // Clean up files before soft delete
    if (submission.documents && submission.documents.length > 0) {
      const { cleanupFiles } = require("../middleware/fileStorage");
      await cleanupFiles(submission.documents);
    }

    // Soft delete submission
    await formSubmissionRepository.softDelete(id);
    return { message: "Submission deleted successfully" };
  }

  /**
   * Get file URL for document
   */
  async getFileUrl(submissionId, documentId) {
    const submission = await formSubmissionRepository.findById(submissionId);
    if (!submission) {
      throw new AppError("Submission not found", 404);
    }

    const document = submission.documents.id(documentId);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    let fileUrl;
    if (
      (document.uploadType === "r2" || document.uploadType === "cloudinary") &&
      document.cloudinaryUrl
    ) {
      fileUrl = await r2.resolveUrl(document.cloudinaryUrl);
    } else if (document.uploadType === "local" && document.localPath) {
      fileUrl = `/uploads/${document.filename}`;
    } else {
      throw new AppError("File not found", 404);
    }

    return { fileUrl, document };
  }

  /**
   * Send comment email to customer
   */
  async sendCommentEmail(submission, document, comment) {
    if (!submission.email) {
      logger.info("Skipping comment email - submission has no email on file");
      return;
    }

    try {
      const mailOptions = {
        to: submission.email,
        subject: `Document Review Update - ${escapeHtml(submission.name)}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Document Review Update</h2>
            <p>Dear ${escapeHtml(submission.name)},</p>
            <p>Your visa assessment application has been reviewed. Here's an update:</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #374151; margin-top: 0;">Document: ${escapeHtml(document.originalname)}</h3>
              <p style="color: #6b7280; margin-bottom: 10px;"><strong>Admin Comment:</strong></p>
              <p style="background-color: white; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb;">
                ${escapeHtml(comment)}
              </p>
            </div>
            
            <p>You can view all updates and comments on your application dashboard.</p>
            
            <div style="background-color: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #1e40af;">
                <strong>Application Details:</strong><br>
                Destination: ${escapeHtml(submission.destinationCountry)}<br>
                Visa Type: ${escapeHtml(submission.visaType)}<br>
                Status: ${escapeHtml(submission.status)}
              </p>
            </div>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br>Visa Assessment Team</p>
          </div>
        `,
      };

      // The mail helper never throws and logs only a reason code; a missing mail setting (local development) just skips the email.
      const result = await sendMail({ ...mailOptions, label: "comment_update" });
      if (result.sent) logger.info("Comment email sent successfully");
    } catch (error) {
      logger.error("Comment email could not be prepared", { name: error && error.name });
      // Don't throw error - email failure shouldn't break the flow
    }
  }
}

module.exports = new FormSubmissionService();
