/**
 * Approved Visa Service
 * Business logic for approved visa CRUD and Cloudinary image handling.
 */

const approvedVisaRepository = require("../repositories/approvedVisaRepository");
const { uploadLocalToCloudinary } = require("../config/cloudinary");
const { AppError } = require("../middleware/errorHandler");

class ApprovedVisaService {
  async getPublicList() {
    return await approvedVisaRepository.findPublicList();
  }

  async getAllForAdmin() {
    return await approvedVisaRepository.findAll();
  }

  async getById(id) {
    const visa = await approvedVisaRepository.findById(id);

    if (!visa) {
      throw new AppError("Approved visa not found", 404);
    }

    return visa;
  }

  async create(data, files) {
    const clientPhotoFile = files?.clientPhoto?.[0];
    const countryFlagFile = files?.countryFlag?.[0];

    if (!clientPhotoFile || !countryFlagFile) {
      throw new AppError(
        "Both client photo and country flag images are required",
        400,
      );
    }

    try {
      const [clientPhotoResult, countryFlagResult] = await Promise.all([
        uploadLocalToCloudinary(clientPhotoFile.path, "approved-visas"),
        uploadLocalToCloudinary(countryFlagFile.path, "approved-visas"),
      ]);

      return await approvedVisaRepository.create({
        ...data,
        clientPhotoUrl: clientPhotoResult.secure_url,
        clientPhotoPublicId: clientPhotoResult.public_id,
        countryFlagUrl: countryFlagResult.secure_url,
        countryFlagPublicId: countryFlagResult.public_id,
      });
    } catch (error) {
      throw new AppError(`Approved visa creation failed: ${error.message}`, 500);
    }
  }

  async update(id, data, files) {
    const existing = await approvedVisaRepository.findById(id);

    if (!existing) {
      throw new AppError("Approved visa not found", 404);
    }

    const updateData = { ...data };
    const clientPhotoFile = files?.clientPhoto?.[0];
    const countryFlagFile = files?.countryFlag?.[0];

    try {
      if (clientPhotoFile) {
        const result = await uploadLocalToCloudinary(
          clientPhotoFile.path,
          "approved-visas",
        );
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

      if (countryFlagFile) {
        const result = await uploadLocalToCloudinary(
          countryFlagFile.path,
          "approved-visas",
        );
        updateData.countryFlagUrl = result.secure_url;
        updateData.countryFlagPublicId = result.public_id;

        if (existing.countryFlagPublicId) {
          try {
            const cloudinary = require("cloudinary").v2;
            await cloudinary.uploader.destroy(existing.countryFlagPublicId);
          } catch (destroyError) {
            console.error(
              "Failed to remove previous country flag from Cloudinary",
              destroyError,
            );
          }
        }
      }

      return await approvedVisaRepository.updateById(id, updateData);
    } catch (error) {
      throw new AppError(`Approved visa update failed: ${error.message}`, 500);
    }
  }

  async remove(id) {
    const existing = await approvedVisaRepository.findById(id);

    if (!existing) {
      throw new AppError("Approved visa not found", 404);
    }

    try {
      const cloudinary = require("cloudinary").v2;
      if (existing.clientPhotoPublicId) {
        await cloudinary.uploader.destroy(existing.clientPhotoPublicId);
      }
      if (existing.countryFlagPublicId) {
        await cloudinary.uploader.destroy(existing.countryFlagPublicId);
      }
    } catch (destroyError) {
      console.error(
        "Failed to remove Cloudinary assets for approved visa",
        destroyError,
      );
    }

    await approvedVisaRepository.deleteById(id);
  }
}

module.exports = new ApprovedVisaService();
