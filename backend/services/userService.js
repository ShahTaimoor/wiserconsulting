/**
 * User Service
 * Business logic for user operations
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const { AppError } = require('../middleware/errorHandler');

class UserService {
  /**
   * Sign up a new user
   */
  async signup(name, email, password) {
    // Check if user already exists
    const existingUser = await userRepository.findByEmailOrName(email, name);
    if (existingUser) {
      throw new AppError('User with this email or name already exists', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await userRepository.create({
      name,
      email,
      password: hashedPassword
    });

    // Remove password from response
    user.password = undefined;

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  }

  /**
   * Login user
   */
  async login(email, name, password) {
    // Find user by email or name
    let user = await userRepository.findByEmail(email);
    if (!user && name) {
      user = await userRepository.findByName(name);
    }

    if (!user) {
      throw new AppError('Invalid credentials', 400);
    }

    // Check if user has password (not Google-only user)
    if (!user.password) {
      throw new AppError('Please use Google authentication', 400);
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid credentials', 400);
    }

    // Generate JWT token
    const token = this.generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    return {
      user,
      token
    };
  }

  /**
   * Get all users with pagination
   */
  async getAllUsers(skip, limit) {
    const { users, total } = await userRepository.findAll(skip, limit);
    return { users, total };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updateData) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updatedUser = await userRepository.updateById(userId, updateData);
    updatedUser.password = undefined;

    return {
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        phone: updatedUser.phone,
        address: updatedUser.address,
        city: updatedUser.city
      }
    };
  }

  /**
   * Update user role (Admin only)
   */
  async updateUserRole(userId, role) {
    if (role === undefined || role === null) {
      throw new AppError('Role is required', 400);
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updatedUser = await userRepository.updateById(userId, { role });
    updatedUser.password = undefined;

    return {
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        role: updatedUser.role,
        phone: updatedUser.phone,
        address: updatedUser.address,
        city: updatedUser.city
      }
    };
  }

  /**
   * Create admin user
   */
  async createAdmin(name, email, password) {
    // Check if user already exists
    const existingUser = await userRepository.findByEmailOrName(email, name);
    if (existingUser) {
      throw new AppError('User with this email or name already exists', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const user = await userRepository.create({
      name,
      email,
      password: hashedPassword,
      role: 1 // Admin role
    });

    user.password = undefined;

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  }

  /**
   * Handle Google OAuth user
   * Fetches user info from Google and handles authentication
   */
  async handleGoogleAuth(accessToken) {
    // Fetch user info from Google
    const googleResponse = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`
    );
    
    if (!googleResponse.ok) {
      throw new AppError('Failed to fetch user info from Google', 400);
    }

    const googleUser = await googleResponse.json();

    if (!googleUser.id) {
      throw new AppError('Invalid access token', 400);
    }

    // Check if user exists by Google ID
    let user = await userRepository.findByGoogleId(googleUser.id);

    if (user) {
      // User exists, generate token
      const token = this.generateToken(user._id);
      user.password = undefined;
      return { user, token };
    }

    // Check if user exists with same email
    user = await userRepository.findByEmail(googleUser.email);

    if (user) {
      // Link Google account to existing user
      await userRepository.updateById(user._id, {
        googleId: googleUser.id,
        avatar: googleUser.picture
      });
      const updatedUser = await userRepository.findById(user._id);
      const token = this.generateToken(updatedUser._id);
      updatedUser.password = undefined;
      return { user: updatedUser, token };
    }

    // Create new user
    user = await userRepository.create({
      googleId: googleUser.id,
      name: googleUser.name,
      email: googleUser.email,
      avatar: googleUser.picture
    });

    const token = this.generateToken(user._id);
    user.password = undefined;

    return { user, token };
  }

  /**
   * Generate JWT token
   */
  generateToken(userId) {
    return jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXP || '365d' }
    );
  }
}

module.exports = new UserService();

