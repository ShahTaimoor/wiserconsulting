/**
 * User Routes
 * Only routes - no business logic, no DB queries
 */

const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { isAuthorized, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  updateUserRoleSchema,
} = require("../validations/userValidation");

// Signup
router.post(
  "/signup",
  validate(signupSchema),
  userController.signup.bind(userController),
);

// Login
router.post(
  "/login",
  validate(loginSchema),
  userController.login.bind(userController),
);

// Logout
router.get("/logout", userController.logout.bind(userController));
router.post("/logout", userController.logout.bind(userController));

// Get all users (Admin only, with pagination)
router.get(
  "/all-users",
  isAuthorized,
  isAdmin,
  userController.getAllUsers.bind(userController),
);

// Admin analytics summary
router.get(
  "/admin-summary",
  isAuthorized,
  isAdmin,
  userController.getAdminSummary.bind(userController),
);

// Update profile (Authorized users)
router.put(
  "/update-profile",
  isAuthorized,
  validate(updateProfileSchema),
  userController.updateProfile.bind(userController),
);

// Update user role (Admin only)
router.put(
  "/update-user-role/:userId",
  isAuthorized,
  isAdmin,
  validate(updateUserRoleSchema),
  userController.updateUserRole.bind(userController),
);

// There is deliberately NO route that creates an administrator (step 8j-2). The first administrator is made with
// backend/scripts/create-first-admin.js, run by a person who has access to the server; after that an existing administrator
// can promote an account with PUT /update-user-role/:userId.

module.exports = router;
