const contactSubmissionRepository = require("../repositories/contactSubmissionRepository");
const escapeHtml = require('../utils/escapeHtml');
const logger = require("../utils/logger");
const { CONTACT_STATUSES } = require("../validations/contactSubmissionValidation");
// Mail goes through the one mail helper (config/mail.js): it never throws, and it logs only a reason code.
const { sendMail, getSettings } = require("../config/mail");

class ContactSubmissionService {
  // Create a new contact submission
  async createContactSubmission(data) {
    try {
      const submission = await contactSubmissionRepository.create(data);

      // Send confirmation email to user
      await this.sendConfirmationEmail(submission);

      // Send notification email to admin
      await this.sendAdminNotificationEmail(submission);

      logger.info(`Contact submission created: ${submission._id}`);
      return submission;
    } catch (error) {
      logger.error(`Error creating contact submission: ${error.message}`);
      throw error;
    }
  }

  // Send confirmation email to user
  async sendConfirmationEmail(submission) {
    try {
      const mailOptions = {
        to: submission.email,
        subject: "We received your contact request - Wiser Consulting",
        html: `
                    <h2>Thank you for reaching out to Wiser Consulting</h2>
                    <p>Dear ${escapeHtml(submission.name)},</p>
                    <p>We have received your contact request and will get back to you as soon as possible.</p>
                    <hr>
                    <p><strong>Your Message Details:</strong></p>
                    <p><strong>Subject:</strong> ${escapeHtml(submission.subject)}</p>
                    <p><strong>Message:</strong> ${escapeHtml(submission.message)}</p>
                    <hr>
                    <p>If you have any urgent matters, please call us at the contact number provided on our website.</p>
                    <p>Best regards,<br>Wiser Consulting Team</p>
                `,
      };

      await sendMail({ ...mailOptions, label: "contact_confirmation" });
    } catch (error) {
      logger.error(`Error sending confirmation email: ${error.message}`);
      // Don't throw, just log the error
    }
  }

  // Send notification email to admin
  async sendAdminNotificationEmail(submission) {
    try {
      const mailOptions = {
        to: getSettings().adminTo,
        subject: `New Contact Form Submission - ${escapeHtml(submission.name)}`,
        html: `
                    <h2>New Contact Form Submission</h2>
                    <p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>
                    <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
                    <p><strong>Phone:</strong> ${escapeHtml(submission.phone)}</p>
                    <p><strong>Subject:</strong> ${escapeHtml(submission.subject)}</p>
                    <p><strong>Message:</strong></p>
                    <p>${escapeHtml(submission.message)}</p>
                    <hr>
                    <p><strong>Submission Date:</strong> ${new Date(submission.createdAt).toLocaleString()}</p>
                    <p><a href="${getSettings().adminPanelUrl || "http://localhost:3000"}/admin/contacts">View in Admin Panel</a></p>
                `,
      };

      await sendMail({ ...mailOptions, label: "contact_admin_notice" });
    } catch (error) {
      logger.error(`Error sending admin notification email: ${error.message}`);
      // Don't throw, just log the error
    }
  }

  // Get all contact submissions
  async getAllSubmissions(page = 1, limit = 10, filters = {}) {
    try {
      return await contactSubmissionRepository.getAll(page, limit, filters);
    } catch (error) {
      logger.error(`Error fetching contact submissions: ${error.message}`);
      throw error;
    }
  }

  // Get submission by ID. Reading changes nothing: marking a message read is its own step (markSubmissionRead).
  async getSubmissionById(id) {
    try {
      const submission = await contactSubmissionRepository.getById(id);
      if (!submission) {
        throw new Error("Contact submission not found");
      }
      return submission;
    } catch (error) {
      logger.error(`Error fetching contact submission: ${error.message}`);
      throw error;
    }
  }

  // Mark a submission as read: "new" becomes "read"; any other status is left as it is. Safe to repeat. Resolves the submission as it is now.
  async markSubmissionRead(id) {
    try {
      const submission = await contactSubmissionRepository.getById(id);
      if (!submission || submission.isDeleted) {
        throw new Error("Contact submission not found");
      }
      if (submission.status !== "new") return submission;
      // One atomic step; if another request got there first, the record as it is now is returned.
      return (await contactSubmissionRepository.markRead(id)) || (await contactSubmissionRepository.getById(id));
    } catch (error) {
      logger.error(`Error marking contact submission read: ${error.message}`);
      throw error;
    }
  }

  // Update submission status
  async updateSubmissionStatus(id, status) {
    try {
      const validStatuses = CONTACT_STATUSES;
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      return await contactSubmissionRepository.updateStatus(id, status);
    } catch (error) {
      logger.error(
        `Error updating contact submission status: ${error.message}`,
      );
      throw error;
    }
  }

  // Add admin reply
  async addAdminReply(id, message, userId) {
    try {
      const adminReply = {
        message,
        repliedBy: userId,
      };

      const submission = await contactSubmissionRepository.addAdminReply(
        id,
        adminReply,
      );

      // Optionally send reply email to user
      await this.sendReplyEmail(submission);

      logger.info(`Admin reply added to submission: ${id}`);
      return submission;
    } catch (error) {
      logger.error(`Error adding admin reply: ${error.message}`);
      throw error;
    }
  }

  // Send reply email to user
  async sendReplyEmail(submission) {
    try {
      if (!submission.adminReply) return;

      const mailOptions = {
        to: submission.email,
        subject: `Re: ${escapeHtml(submission.subject)} - Wiser Consulting`,
        html: `
                    <h2>Response to Your Contact Request</h2>
                    <p>Dear ${escapeHtml(submission.name)},</p>
                    <p>Thank you for contacting us. Here is our response:</p>
                    <hr>
                    <p>${escapeHtml(submission.adminReply.message)}</p>
                    <hr>
                    <p>If you have any further questions, please feel free to contact us.</p>
                    <p>Best regards,<br>Wiser Consulting Team</p>
                `,
      };

      await sendMail({ ...mailOptions, label: "contact_reply" });
    } catch (error) {
      logger.error(`Error sending reply email: ${error.message}`);
    }
  }

  // Search submissions
  async searchSubmissions(searchTerm, page = 1, limit = 10, filters = {}) {
    try {
      return await contactSubmissionRepository.search(searchTerm, page, limit, filters);
    } catch (error) {
      logger.error(`Error searching contact submissions: ${error.message}`);
      throw error;
    }
  }

  // Delete submission (soft delete)
  async deleteSubmission(id) {
    try {
      const submission = await contactSubmissionRepository.softDelete(id);
      logger.info(`Contact submission deleted: ${id}`);
      return submission;
    } catch (error) {
      logger.error(`Error deleting contact submission: ${error.message}`);
      throw error;
    }
  }

  // Get statistics
  async getStatistics() {
    try {
      return await contactSubmissionRepository.getStatistics();
    } catch (error) {
      logger.error(
        `Error fetching contact submission statistics: ${error.message}`,
      );
      throw error;
    }
  }
}

module.exports = new ContactSubmissionService();
