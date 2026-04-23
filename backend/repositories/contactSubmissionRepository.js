const ContactSubmission = require("../models/ContactSubmission");

class ContactSubmissionRepository {
  // Create a new contact submission
  async create(data) {
    try {
      const submission = new ContactSubmission(data);
      return await submission.save();
    } catch (error) {
      throw error;
    }
  }

  // Get all contact submissions with pagination
  async getAll(page = 1, limit = 10, filters = {}) {
    try {
      const skip = (page - 1) * limit;
      const query = { isDeleted: false, ...filters };

      const submissions = await ContactSubmission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ContactSubmission.countDocuments(query);

      return {
        submissions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Get submission by ID
  async getById(id) {
    try {
      return await ContactSubmission.findById(id);
    } catch (error) {
      throw error;
    }
  }

  // Update submission status
  async updateStatus(id, status) {
    try {
      return await ContactSubmission.findByIdAndUpdate(
        id,
        { status },
        { new: true },
      );
    } catch (error) {
      throw error;
    }
  }

  // Add admin reply
  async addAdminReply(id, adminReply) {
    try {
      return await ContactSubmission.findByIdAndUpdate(
        id,
        {
          adminReply: {
            ...adminReply,
            repliedAt: new Date(),
          },
          status: "responded",
        },
        { new: true },
      );
    } catch (error) {
      throw error;
    }
  }

  // Soft delete submission
  async softDelete(id) {
    try {
      return await ContactSubmission.findByIdAndUpdate(
        id,
        { isDeleted: true },
        { new: true },
      );
    } catch (error) {
      throw error;
    }
  }

  // Get submissions by status
  async getByStatus(status, page = 1, limit = 10) {
    try {
      return this.getAll(page, limit, { status });
    } catch (error) {
      throw error;
    }
  }

  // Search submissions
  async search(searchTerm, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const query = {
        isDeleted: false,
        $or: [
          { name: { $regex: searchTerm, $options: "i" } },
          { email: { $regex: searchTerm, $options: "i" } },
          { phone: { $regex: searchTerm, $options: "i" } },
          { message: { $regex: searchTerm, $options: "i" } },
        ],
      };

      const submissions = await ContactSubmission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ContactSubmission.countDocuments(query);

      return {
        submissions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Get statistics
  async getStatistics() {
    try {
      const stats = await ContactSubmission.aggregate([
        {
          $match: { isDeleted: false },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      const total = await ContactSubmission.countDocuments({
        isDeleted: false,
      });

      return {
        total,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new ContactSubmissionRepository();
