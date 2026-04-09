/**
 * FormSubmission Repository
 * All database operations for FormSubmission model
 */

const FormSubmission = require('../models/FormSubmission');

class FormSubmissionRepository {
  /**
   * Find submission by ID (excluding deleted)
   */
  async findById(id) {
    return await FormSubmission.findOne({ _id: id, isDeleted: false });
  }

  /**
   * Find submission by email (excluding deleted)
   */
  async findByEmail(email) {
    return await FormSubmission.findOne({ email, isDeleted: false })
      .sort({ createdAt: -1 });
  }

  /**
   * Get all submissions with pagination (excluding deleted)
   */
  async findAll(skip, limit, sort = { createdAt: -1 }) {
    const submissions = await FormSubmission.find({ isDeleted: false })
      .skip(skip)
      .limit(limit)
      .sort(sort);
    
    const total = await FormSubmission.countDocuments({ isDeleted: false });
    
    return { submissions, total };
  }

  /**
   * Get submissions by status with pagination (excluding deleted)
   */
  async findByStatus(status, skip, limit) {
    const submissions = await FormSubmission.find({
      status,
      isDeleted: false
    })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await FormSubmission.countDocuments({
      status,
      isDeleted: false
    });
    
    return { submissions, total };
  }

  /**
   * Create new submission
   */
  async create(submissionData) {
    return await FormSubmission.create(submissionData);
  }

  /**
   * Update submission by ID
   */
  async updateById(id, updateData) {
    return await FormSubmission.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  /**
   * Update submission status
   */
  async updateStatus(id, status) {
    return await FormSubmission.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    );
  }

  /**
   * Add admin comment to submission
   */
  async addAdminComment(id, commentData) {
    return await FormSubmission.findByIdAndUpdate(
      id,
      { $push: { adminComments: commentData } },
      { new: true }
    );
  }

  /**
   * Add customer comment to submission
   */
  async addCustomerComment(id, commentData) {
    return await FormSubmission.findByIdAndUpdate(
      id,
      { $push: { customerComments: commentData } },
      { new: true }
    );
  }

  /**
   * Update document comment in submission
   */
  async updateDocumentComment(submissionId, documentId, comment) {
    const submission = await this.findById(submissionId);
    if (!submission) return null;

    const document = submission.documents.id(documentId);
    if (!document) return null;

    document.comment = comment;
    return await submission.save();
  }

  /**
   * Delete document from submission
   */
  async deleteDocument(submissionId, documentId) {
    const submission = await this.findById(submissionId);
    if (!submission) return null;

    const document = submission.documents.id(documentId);
    if (!document) return null;

    submission.documents.pull(documentId);
    return await submission.save();
  }

  /**
   * Soft delete submission
   */
  async softDelete(id) {
    return await FormSubmission.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true } },
      { new: true }
    );
  }
}

module.exports = new FormSubmissionRepository();

