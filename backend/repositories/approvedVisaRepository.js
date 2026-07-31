/**
 * Approved Visa Repository
 * Handles persistence for approved visa records.
 */

const ApprovedVisa = require("../models/ApprovedVisa");
const { AppError } = require("../middleware/errorHandler");

class ApprovedVisaRepository {
  async create(data) {
    return await ApprovedVisa.create(data);
  }

  async findPublicList() {
    return await ApprovedVisa.find({ isActive: true }).sort({
      displayOrder: 1,
      createdAt: -1,
    });
  }

  async findAll() {
    return await ApprovedVisa.find().sort({
      displayOrder: 1,
      createdAt: -1,
    });
  }

  async findById(id) {
    return await ApprovedVisa.findById(id);
  }

  async updateById(id, data) {
    const updated = await ApprovedVisa.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!updated) {
      throw new AppError("Approved visa not found", 404);
    }

    return updated;
  }

  async deleteById(id) {
    const deleted = await ApprovedVisa.findByIdAndDelete(id);

    if (!deleted) {
      throw new AppError("Approved visa not found", 404);
    }

    return deleted;
  }
}

module.exports = new ApprovedVisaRepository();
