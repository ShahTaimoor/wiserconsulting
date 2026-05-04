/**
 * Admin Settings Validation Schema using Zod
 */

const { z } = require("zod");

const updateSettingsSchema = z.object({
  body: z
    .object({
      websiteTitle: z.string().trim().optional(),
      email: z
        .string()
        .email("Invalid email format")
        .trim()
        .toLowerCase()
        .optional(),
      phone: z.string().trim().optional(),
      address: z.string().trim().optional(),
      socialLinks: z
        .object({
          facebook: z.string().url("Invalid URL").optional().or(z.literal("")),
          twitter: z.string().url("Invalid URL").optional().or(z.literal("")),
          linkedin: z.string().url("Invalid URL").optional().or(z.literal("")),
          instagram: z.string().url("Invalid URL").optional().or(z.literal("")),
        })
        .optional(),
    })
    .refine(
      (data) =>
        Object.keys(data).some(
          (key) => data[key] !== undefined && data[key] !== "",
        ),
      {
        message: "At least one field must be provided",
      },
    ),
});

module.exports = {
  updateSettingsSchema,
};
