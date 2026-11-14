/**
 * Testimonial Service
 * Business logic for testimonial CRUD and R2 image handling.
 */

const testimonialRepository = require("../repositories/testimonialRepository");
const { uploadLocalToR2 } = require("../config/upload");
const { deleteFromR2 } = require("../middleware/fileStorage");
const { AppError } = require("../middleware/errorHandler");

class TestimonialService {
  async getPublicList() {
    return await testimonialRepository.findPublicList();
  }

  async getAllForAdmin() {
    return await testimonialRepository.findAll();
  }

  async getById(id) {
    const testimonial = await testimonialRepository.findById(id);

    if (!testimonial) {
      throw new AppError("Testimonial not found", 404);
    }

    return testimonial;
  }

  async create(data, files) {
    const clientPhotoFile = files?.clientPhoto?.[0];

    try {
      let photoFields = {};

      if (clientPhotoFile) {
        const result = await uploadLocalToR2(clientPhotoFile.path, "testimonials");
        photoFields = {
          clientPhotoUrl: result.secure_url,
          clientPhotoPublicId: result.public_id,
        };
      }

      return await testimonialRepository.create({
        ...data,
        ...photoFields,
      });
    } catch (error) {
      throw new AppError(`Testimonial creation failed: ${error.message}`, 500);
    }
  }

  async update(id, data, files) {
    const existing = await testimonialRepository.findById(id);

    if (!existing) {
      throw new AppError("Testimonial not found", 404);
    }

    const updateData = { ...data };
    const clientPhotoFile = files?.clientPhoto?.[0];

    try {
      if (clientPhotoFile) {
        const result = await uploadLocalToR2(clientPhotoFile.path, "testimonials");
        updateData.clientPhotoUrl = result.secure_url;
        updateData.clientPhotoPublicId = result.public_id;

        if (existing.clientPhotoPublicId) {
          try {
            await deleteFromR2(existing.clientPhotoPublicId);
          } catch (destroyError) {
            console.error(
              "Failed to remove previous client photo from R2",
              destroyError,
            );
          }
        }
      }

      return await testimonialRepository.updateById(id, updateData);
    } catch (error) {
      throw new AppError(`Testimonial update failed: ${error.message}`, 500);
    }
  }

  async remove(id) {
    const existing = await testimonialRepository.findById(id);

    if (!existing) {
      throw new AppError("Testimonial not found", 404);
    }

    try {
      if (existing.clientPhotoPublicId) {
        await deleteFromR2(existing.clientPhotoPublicId);
      }
    } catch (destroyError) {
      console.error(
        "Failed to remove R2 asset for testimonial",
        destroyError,
      );
    }

    await testimonialRepository.deleteById(id);
  }
}

module.exports = new TestimonialService();
