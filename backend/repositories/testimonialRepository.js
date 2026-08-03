/**
 * Testimonial Repository
 * Handles persistence for client testimonial records.
 */

const Testimonial = require("../models/Testimonial");
const { AppError } = require("../middleware/errorHandler");

class TestimonialRepository {
  async create(data) {
    return await Testimonial.create(data);
  }

  async findPublicList() {
    return await Testimonial.find({ isActive: true }).sort({
      displayOrder: 1,
      createdAt: -1,
    });
  }

  async findAll() {
    return await Testimonial.find().sort({
      displayOrder: 1,
      createdAt: -1,
    });
  }

  async findById(id) {
    return await Testimonial.findById(id);
  }

  async updateById(id, data) {
    const updated = await Testimonial.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!updated) {
      throw new AppError("Testimonial not found", 404);
    }

    return updated;
  }

  async deleteById(id) {
    const deleted = await Testimonial.findByIdAndDelete(id);

    if (!deleted) {
      throw new AppError("Testimonial not found", 404);
    }

    return deleted;
  }
}

module.exports = new TestimonialRepository();
