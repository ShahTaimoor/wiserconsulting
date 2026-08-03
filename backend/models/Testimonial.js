const mongoose = require("mongoose");

const testimonialSchema = new mongoose.Schema(
  {
    clientPhotoUrl: {
      type: String,
      default: null,
    },
    clientPhotoPublicId: {
      type: String,
      default: null,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      required: true,
      trim: true,
    },
    roleOrCaption: {
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

testimonialSchema.index({ isActive: 1 });
testimonialSchema.index({ displayOrder: 1 });
testimonialSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Testimonial", testimonialSchema);
