const mongoose = require("mongoose");

const approvedVisaSchema = new mongoose.Schema(
  {
    clientPhotoUrl: {
      type: String,
      required: true,
    },
    clientPhotoPublicId: {
      type: String,
      required: true,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    countryName: {
      type: String,
      required: true,
      trim: true,
    },
    countryFlagUrl: {
      type: String,
      required: true,
    },
    countryFlagPublicId: {
      type: String,
      required: true,
    },
    visaType: {
      type: String,
      trim: true,
      default: "",
    },
    approvalDate: {
      type: Date,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

approvedVisaSchema.index({ isActive: 1 });
approvedVisaSchema.index({ displayOrder: 1 });
approvedVisaSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ApprovedVisa", approvedVisaSchema);
