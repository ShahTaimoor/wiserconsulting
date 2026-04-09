/**
 * User Validation Schemas using Zod
 */

const { z } = require('zod');

const signupSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').trim(),
    email: z.string().email('Invalid email format').trim().toLowerCase(),
    password: z.string().min(6, 'Password must be at least 6 characters')
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format').trim().toLowerCase().optional(),
    name: z.string().min(1, 'Name is required').trim().optional(),
    password: z.string().min(1, 'Password is required')
  }).refine(data => data.email || data.name, {
    message: 'Either email or name is required'
  })
});

const updateProfileSchema = z.object({
  body: z.object({
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
  body: z.object({
    role: z.number().int().min(0).max(1, 'Role must be 0 or 1')
  })
});

const createAdminSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').trim(),
    email: z.string().email('Invalid email format').trim().toLowerCase(),
    password: z.string().min(6, 'Password must be at least 6 characters')
  })
});

const googleTokenSchema = z.object({
  body: z.object({
    access_token: z.string().min(1, 'Access token is required')
  })
});

module.exports = {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  updateUserRoleSchema,
  createAdminSchema,
  googleTokenSchema
};

