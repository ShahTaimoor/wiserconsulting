/**
 * Approved Visa Service
 * Business logic for approved visa CRUD and R2 image handling.
 */

const approvedVisaRepository = require("../repositories/approvedVisaRepository");
const { uploadLocalToR2 } = require("../config/upload");
const { deleteFromR2 } = require("../middleware/fileStorage");
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
        uploadLocalToR2(clientPhotoFile.path, "approved-visas"),
        uploadLocalToR2(countryFlagFile.path, "approved-visas"),
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
        const result = await uploadLocalToR2(
          clientPhotoFile.path,
          "approved-visas",
        );
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

      if (countryFlagFile) {
        const result = await uploadLocalToR2(
          countryFlagFile.path,
          "approved-visas",
        );
        updateData.countryFlagUrl = result.secure_url;
        updateData.countryFlagPublicId = result.public_id;

        if (existing.countryFlagPublicId) {
          try {
            await deleteFromR2(existing.countryFlagPublicId);
          } catch (destroyError) {
            console.error(
              "Failed to remove previous country flag from R2",
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
      if (existing.clientPhotoPublicId) {
        await deleteFromR2(existing.clientPhotoPublicId);
      }
      if (existing.countryFlagPublicId) {
        await deleteFromR2(existing.countryFlagPublicId);
      }
    } catch (destroyError) {
      console.error(
        "Failed to remove R2 assets for approved visa",
        destroyError,
      );
    }

    await approvedVisaRepository.deleteById(id);
  }
}

module.exports = new ApprovedVisaService();
