/**
 * Auth Routes (Google OAuth)
 * Only routes - no business logic, no DB queries
 */

const express = require('express');
const passport = require('passport');
const router = express.Router();
const userController = require('../controllers/userController');
const userService = require('../services/userService');
const validate = require('../middleware/validate');
const { googleTokenSchema } = require('../validations/userValidation');
const logger = require('../utils/logger');
const asyncHandler = require('../utils/asyncHandler');

// Google OAuth routes
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  asyncHandler(async (req, res) => {
    // Generate JWT token
    const token = userService.generateToken(req.user._id);

    // Set JWT token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      maxAge: 365 * 24 * 60 * 60 * 1000
    });

    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL}/auth-success?token=${token}`);
  })
);

// Verify Google token and create/login user
router.post(
  '/google/token',
  validate(googleTokenSchema),
  userController.handleGoogleToken.bind(userController)
);

// Get current user from session
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user.toObject();
    delete user.password;
    res.json({ success: true, user });
  } else {
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout error' });
    }

    res.cookie('token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      expires: new Date(0)
    });

    res.json({ success: true, message: 'Logged out successfully' });
  });
});

module.exports = router;
