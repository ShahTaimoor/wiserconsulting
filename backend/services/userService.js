/**
 * User Service
 * Business logic for user operations
 */

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userRepository = require("../repositories/userRepository");
const { AppError } = require("../middleware/errorHandler");

// The only fields of a user that the user may change through their profile.
const PROFILE_FIELDS = ["name", "phone", "address", "city"];

/** A new object holding only the profile fields that `data` really has as text: nothing else is ever copied. */
function pickProfileFields(data) {
  const picked = {};
  if (data === null || typeof data !== "object") return picked;
  for (const field of PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field) && typeof data[field] === "string") picked[field] = data[field];
  }
  return picked;
}

class UserService {
  /**
   * Sign up a new user
   */
  async signup(name, email, password) {
    // Check if user already exists
    const existingUser = await userRepository.findByEmailOrName(email, name);
    if (existingUser) {
      throw new AppError("User with this email or name already exists", 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await userRepository.create({
      name,
      email,
      password: hashedPassword,
    });

    // Remove password from response
    user.password = undefined;

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
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

    // An account with no password (an old Google sign-in account) cannot sign in with a password: it gets the same answer as an
    // unknown email or a wrong password, so nothing tells a stranger which accounts exist or how they were made.
    if (!user || typeof user.password !== "string" || user.password === "") {
      throw new AppError("Invalid credentials", 400);
    }

    // Verify password
    const isMatch = typeof password === "string" && (await bcrypt.compare(password, user.password));
    if (!isMatch) {
      throw new AppError("Invalid credentials", 400);
    }

    // Generate JWT token
    const token = this.generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    return {
      user,
      token,
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
   * Update user profile.
   * Only the fields a person may change about themselves are copied from `data` (PROFILE_FIELDS); anything else it carries
   * (role, password, email, isDeleted, googleId ...) is ignored here even if a caller passes it, so this method can never be used
   * to change them. The route's strict validation refuses such a request before it gets here.
   */
  async updateProfile(userId, data) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const updateData = pickProfileFields(data);
    const updatedUser = Object.keys(updateData).length === 0 ? user : await userRepository.updateById(userId, updateData);
    updatedUser.password = undefined;

    return {
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        phone: updatedUser.phone,
        address: updatedUser.address,
        city: updatedUser.city,
      },
    };
  }

  /**
   * Update user role (Admin only)
   */
  async updateUserRole(userId, role) {
    if (role === undefined || role === null) {
      throw new AppError("Role is required", 400);
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
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
        city: updatedUser.city,
      },
    };
  }

  /**
   * Count all registered users
   */
  async countAllUsers() {
    return await userRepository.countAll();
  }

  /**
   * Count admin users
   */
  async countAdmins() {
    return await userRepository.countByRole(1);
  }

  /**
   * Generate JWT token
   */
  generateToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXP || "365d",
    });
  }
}

module.exports = new UserService();
module.exports.PROFILE_FIELDS = PROFILE_FIELDS;
module.exports.pickProfileFields = pickProfileFields;
