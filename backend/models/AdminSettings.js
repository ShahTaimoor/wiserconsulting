const mongoose = require("mongoose");

const adminSettingsSchema = new mongoose.Schema(
  {
    websiteTitle: {
      type: String,
      default: "Wiser Consulting",
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    siteLogo: {
      type: String,
      default: null,
    },
    logoPublicId: {
      type: String,
      default: null,
    },
    favicon: {
      type: String,
      default: null,
    },
    faviconPublicId: {
      type: String,
      default: null,
    },
    socialLinks: {
      facebook: String,
      twitter: String,
      linkedin: String,
      instagram: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AdminSettings", adminSettingsSchema);
