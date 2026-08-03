/**
 * Testimonial Service
 * Business logic for testimonial CRUD and Cloudinary image handling.
 */

const testimonialRepository = require("../repositories/testimonialRepository");
const { uploadLocalToCloudinary } = require("../config/cloudinary");
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
        const result = await uploadLocalToCloudinary(clientPhotoFile.path, "testimonials");
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
        const result = await uploadLocalToCloudinary(clientPhotoFile.path, "testimonials");
        updateData.clientPhotoUrl = result.secure_url;
        updateData.clientPhotoPublicId = result.public_id;

        if (existing.clientPhotoPublicId) {
          try {
            const cloudinary = require("cloudinary").v2;
            await cloudinary.uploader.destroy(existing.clientPhotoPublicId);
          } catch (destroyError) {
            console.error(
              "Failed to remove previous client photo from Cloudinary",
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
        const cloudinary = require("cloudinary").v2;
        await cloudinary.uploader.destroy(existing.clientPhotoPublicId);
      }
    } catch (destroyError) {
      console.error(
        "Failed to remove Cloudinary asset for testimonial",
        destroyError,
      );
    }

    await testimonialRepository.deleteById(id);
  }
}

module.exports = new TestimonialService();
