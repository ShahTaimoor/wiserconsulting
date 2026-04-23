const contactSubmissionRepository = require("../repositories/contactSubmissionRepository");
const logger = require("../utils/logger");
const nodemailer = require("nodemailer");

// Configure email service
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

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
        from: process.env.EMAIL_USER,
        to: submission.email,
        subject: "We received your contact request - Wiser Consulting",
        html: `
                    <h2>Thank you for reaching out to Wiser Consulting</h2>
                    <p>Dear ${submission.name},</p>
                    <p>We have received your contact request and will get back to you as soon as possible.</p>
                    <hr>
                    <p><strong>Your Message Details:</strong></p>
                    <p><strong>Subject:</strong> ${submission.subject}</p>
                    <p><strong>Message:</strong> ${submission.message}</p>
                    <hr>
                    <p>If you have any urgent matters, please call us at the contact number provided on our website.</p>
                    <p>Best regards,<br>Wiser Consulting Team</p>
                `,
      };

      await transporter.sendMail(mailOptions);
    } catch (error) {
      logger.error(`Error sending confirmation email: ${error.message}`);
      // Don't throw, just log the error
    }
  }

  // Send notification email to admin
  async sendAdminNotificationEmail(submission) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
        subject: `New Contact Form Submission - ${submission.name}`,
        html: `
                    <h2>New Contact Form Submission</h2>
                    <p><strong>Name:</strong> ${submission.name}</p>
                    <p><strong>Email:</strong> ${submission.email}</p>
                    <p><strong>Phone:</strong> ${submission.phone}</p>
                    <p><strong>Subject:</strong> ${submission.subject}</p>
                    <p><strong>Message:</strong></p>
                    <p>${submission.message}</p>
                    <hr>
                    <p><strong>Submission Date:</strong> ${new Date(submission.createdAt).toLocaleString()}</p>
                    <p><a href="${process.env.ADMIN_PANEL_URL || "http://localhost:3000"}/admin/contacts">View in Admin Panel</a></p>
                `,
      };

      await transporter.sendMail(mailOptions);
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

  // Get submission by ID
  async getSubmissionById(id) {
    try {
      const submission = await contactSubmissionRepository.getById(id);
      if (!submission) {
        throw new Error("Contact submission not found");
      }

      // Mark as read
      if (submission.status === "new") {
        submission.status = "read";
        await submission.save();
      }

      return submission;
    } catch (error) {
      logger.error(`Error fetching contact submission: ${error.message}`);
      throw error;
    }
  }

  // Update submission status
  async updateSubmissionStatus(id, status) {
    try {
      const validStatuses = ["new", "read", "responded", "archived"];
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
        from: process.env.EMAIL_USER,
        to: submission.email,
        subject: `Re: ${submission.subject} - Wiser Consulting`,
        html: `
                    <h2>Response to Your Contact Request</h2>
                    <p>Dear ${submission.name},</p>
                    <p>Thank you for contacting us. Here is our response:</p>
                    <hr>
                    <p>${submission.adminReply.message}</p>
                    <hr>
                    <p>If you have any further questions, please feel free to contact us.</p>
                    <p>Best regards,<br>Wiser Consulting Team</p>
                `,
      };

      await transporter.sendMail(mailOptions);
    } catch (error) {
      logger.error(`Error sending reply email: ${error.message}`);
    }
  }

  // Search submissions
  async searchSubmissions(searchTerm, page = 1, limit = 10) {
    try {
      return await contactSubmissionRepository.search(searchTerm, page, limit);
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
