/**
 * User Routes
 * Only routes - no business logic, no DB queries
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isAuthorized, isAdmin } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  updateUserRoleSchema,
  createAdminSchema
} = require('../validations/userValidation');

// Signup
router.post('/signup', validate(signupSchema), userController.signup.bind(userController));

// Login
router.post('/login', validate(loginSchema), userController.login.bind(userController));

// Logout
router.get('/logout', userController.logout.bind(userController));
router.post('/logout', userController.logout.bind(userController));

// Get all users (Admin only, with pagination)
router.get(
  '/all-users',
  isAuthorized,
  isAdmin,
  userController.getAllUsers.bind(userController)
);

// Update profile (Authorized users)
router.put(
  '/update-profile',
  isAuthorized,
  validate(updateProfileSchema),
  userController.updateProfile.bind(userController)
);

// Update user role (Admin only)
router.put(
  '/update-user-role/:userId',
  isAuthorized,
  isAdmin,
  validate(updateUserRoleSchema),
  userController.updateUserRole.bind(userController)
);

// Create admin user
router.post(
  '/create-admin',
  validate(createAdminSchema),
  userController.createAdmin.bind(userController)
);

module.exports = router;
