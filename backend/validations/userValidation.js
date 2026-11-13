/**
 * User Validation Schemas using Zod
 *
 * The bodies are STRICT (step 8j-2): a key the schema does not name is refused with a 400 ("Unrecognized key"), so a request cannot
 * carry a field such as role, password or isDeleted to a route that does not take it.
 */

const { z } = require('zod');

const signupSchema = z.object({
  body: z.strictObject({
    name: z.string().min(1, 'Name is required').trim(),
    email: z.string().email('Invalid email format').trim().toLowerCase(),
    password: z.string().min(6, 'Password must be at least 6 characters')
  })
});

const loginSchema = z.object({
  body: z.strictObject({
    email: z.string().email('Invalid email format').trim().toLowerCase().optional(),
    name: z.string().min(1, 'Name is required').trim().optional(),
    password: z.string().min(1, 'Password is required')
  }).refine(data => data.email || data.name, {
    message: 'Either email or name is required'
  })
});

// The only fields a user may change about themselves. Anything else (role, password, email, isDeleted, googleId ...) is refused.
const updateProfileSchema = z.object({
  body: z.strictObject({
    name: z.string().min(1).trim().optional(),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    city: z.string().trim().optional()
  })
});

const updateUserRoleSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required')
  }),
  body: z.strictObject({
    role: z.number().int().min(0).max(1, 'Role must be 0 or 1')
  })
});

module.exports = {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  updateUserRoleSchema
};
