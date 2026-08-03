/**
 * Testimonial Validation Schemas using Zod
 * Request bodies arrive as multipart/form-data, so numeric fields are
 * coerced from the string values multer/Express parse them as.
 */

const { z } = require("zod");

const optionalActiveFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((val) => (val === undefined ? undefined : val === "true"));

const createTestimonialSchema = z.object({
  body: z.object({
    clientName: z.string().trim().min(1, "Client name is required"),
    rating: z.coerce.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
    reviewText: z.string().trim().min(1, "Review text is required"),
    roleOrCaption: z.string().trim().optional().or(z.literal("")),
    displayOrder: z.coerce.number().int().optional(),
    isActive: optionalActiveFlag,
  }),
});

const updateTestimonialSchema = z.object({
  body: z.object({
    clientName: z.string().trim().min(1, "Client name is required").optional(),
    rating: z.coerce
      .number()
      .int()
      .min(1, "Rating must be between 1 and 5")
      .max(5, "Rating must be between 1 and 5")
      .optional(),
    reviewText: z.string().trim().min(1, "Review text is required").optional(),
    roleOrCaption: z.string().trim().optional().or(z.literal("")),
    displayOrder: z.coerce.number().int().optional(),
    isActive: optionalActiveFlag,
  }),
});

module.exports = {
  createTestimonialSchema,
  updateTestimonialSchema,
};
