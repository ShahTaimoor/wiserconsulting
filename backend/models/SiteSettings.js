const mongoose = require("mongoose");

const socialLinksSchema = new mongoose.Schema(
  {
    facebook: {
      type: String,
      trim: true,
      default: "",
    },
    twitter: {
      type: String,
      trim: true,
      default: "",
    },
    linkedin: {
      type: String,
      trim: true,
      default: "",
    },
    instagram: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const siteSettingsSchema = new mongoose.Schema(
  {
    websiteTitle: {
      type: String,
      default: "Wiser Consulting",
      trim: true,
    },
    emailAddress: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    logoUrl: {
      type: String,
      default: null,
    },
    logoPublicId: {
      type: String,
      default: null,
    },
    socialLinks: {
      type: socialLinksSchema,
      default: {},
    },
    // Homepage stat cards — text only, icons stay fixed in the frontend.
    stat1Value: {
      type: String,
      trim: true,
      default: "10,000+",
    },
    stat1Label: {
      type: String,
      trim: true,
      default: "Successful Applications",
    },
    stat2Value: {
      type: String,
      trim: true,
      default: "98%",
    },
    stat2Label: {
      type: String,
      trim: true,
      default: "Success Rate",
    },
    stat3Value: {
      type: String,
      trim: true,
      default: "15+",
    },
    stat3Label: {
      type: String,
      trim: true,
      default: "Years Experience",
    },
    stat4Value: {
      type: String,
      trim: true,
      default: "24/7",
    },
    stat4Label: {
      type: String,
      trim: true,
      default: "Support Available",
    },
    // "Our Story" section stat cards — same split as above (icon/caption
    // fixed in code, value/description editable).
    aboutStat1Value: {
      type: String,
      trim: true,
      default: "10,000+",
    },
    aboutStat1Label: {
      type: String,
      trim: true,
      default: "clients worldwide",
    },
    aboutStat2Value: {
      type: String,
      trim: true,
      default: "98%",
    },
    aboutStat2Label: {
      type: String,
      trim: true,
      default: "approved applications",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SiteSettings", siteSettingsSchema);
