const { z } = require("zod");

const emptyToNull = (value) => (value === "" || value === null || value === undefined ? null : typeof value === "string" ? Number(value.trim()) : value);
const mark = z.preprocess(emptyToNull, z.number().min(0).max(100000).nullable());
const percent = z.preprocess(emptyToNull, z.number().min(0).max(100).nullable());

// A list may arrive as an array or as one text with ";" or new lines between items (a spreadsheet cell).
const list = z.preprocess(
  (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(/[;\n]/);
    return [];
  },
  z.array(z.string().trim()).transform((items) => items.filter(Boolean)).pipe(z.array(z.string().max(300)).max(40)),
);

const text = (max = 500) => z.string().trim().max(max).optional().default("");

// A link must be empty or an http(s) address. Anything else (javascript:, data:, ...) is refused, so a stored link can never run code when it is clicked.
const link = z
  .string()
  .trim()
  .max(300)
  .refine((value) => {
    if (value === "") return true;
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "Links must start with http:// or https://")
  .optional()
  .default("");
const flag = z.preprocess((value) => (typeof value === "string" ? ["true", "yes", "1", "y"].includes(value.trim().toLowerCase()) : value), z.boolean());

const universityShape = {
  name: z.string().trim().min(1, "University name is required").max(200),
  country: z.string().trim().min(1, "Country is required").max(100),
  city: text(100),
  website: link,
  applyUrl: link,
  fields: list,
  minFscPercent: percent.optional().default(null),
  minIelts: mark.optional().default(null),
  minToefl: mark.optional().default(null),
  minPte: mark.optional().default(null),
  minDuolingo: mark.optional().default(null),
  minOxford: mark.optional().default(null),
  tuitionPerYear: text(100),
  scholarshipAvailable: flag.optional().default(false),
  scholarshipName: text(200),
  scholarshipPercent: percent.optional().default(null),
  scholarshipMinFscPercent: percent.optional().default(null),
  scholarshipMinIelts: mark.optional().default(null),
  scholarshipDetails: text(1000),
  scholarshipUrl: link,
  applyDeadline: text(100),
  applyDocuments: list,
  applySteps: list,
  notes: text(1000),
  needsVerification: flag.optional().default(false),
  requirementsUnknown: flag.optional().default(false),
  isActive: flag.optional().default(true),
};

const createUniversitySchema = z.object({ body: z.object(universityShape) });
const updateUniversitySchema = z.object({ body: z.object(universityShape).partial() });

const importUniversitiesSchema = z.object({
  body: z.object({ rows: z.array(z.object(universityShape)).min(1, "No rows to import").max(200, "Import 200 rows at a time") }),
});

const testScore = z.preprocess(emptyToNull, z.number().min(0).max(1000).nullable().optional());
const matchSchema = z.object({
  body: z.object({
    fscPercent: z.coerce.number().min(0, "FSc percentage must be 0 to 100").max(100, "FSc percentage must be 0 to 100"),
    tests: z
      .object({ ielts: testScore, toefl: testScore, pte: testScore, duolingo: testScore, oxford: testScore })
      .partial()
      .optional()
      .default({}),
    country: z.string().trim().max(100).optional().default(""),
    field: z.string().trim().max(100).optional().default(""),
    includeNotEligible: z.boolean().optional().default(false),
    includeUnknown: z.boolean().optional().default(false),
  }),
});

module.exports = { createUniversitySchema, updateUniversitySchema, importUniversitiesSchema, matchSchema };
