/**
 * Approved Visa Validation Schemas using Zod
 * Request bodies arrive as multipart/form-data, so numeric/boolean
 * fields are coerced from the string values multer/Express parse them as.
 */

const { z } = require("zod");

const optionalDateString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((val) => !val || !isNaN(Date.parse(val)), {
    message: "Invalid approval date",
  });

const optionalActiveFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((val) => (val === undefined ? undefined : val === "true"));

const createApprovedVisaSchema = z.object({
  body: z.object({
    clientName: z.string().trim().min(1, "Client name is required"),
    countryName: z.string().trim().min(1, "Country name is required"),
    visaType: z.string().trim().optional().or(z.literal("")),
    approvalDate: optionalDateString,
    note: z.string().trim().optional().or(z.literal("")),
    displayOrder: z.coerce.number().int().optional(),
    isActive: optionalActiveFlag,
  }),
});

const updateApprovedVisaSchema = z.object({
  body: z.object({
    clientName: z.string().trim().min(1, "Client name is required").optional(),
    countryName: z
      .string()
      .trim()
      .min(1, "Country name is required")
      .optional(),
    visaType: z.string().trim().optional().or(z.literal("")),
    approvalDate: optionalDateString,
    note: z.string().trim().optional().or(z.literal("")),
    displayOrder: z.coerce.number().int().optional(),
    isActive: optionalActiveFlag,
  }),
});

module.exports = {
  createApprovedVisaSchema,
  updateApprovedVisaSchema,
};
