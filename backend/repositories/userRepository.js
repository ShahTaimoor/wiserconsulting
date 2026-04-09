/**
 * User Repository
 * All database operations for User model
 */

const User = require('../models/User');

class UserRepository {
  /**
   * Find user by ID (excluding deleted)
   */
  async findById(id) {
    return await User.findOne({ _id: id, isDeleted: false });
  }

  /**
   * Find user by email (excluding deleted)
   */
  async findByEmail(email) {
    return await User.findOne({ email, isDeleted: false });
  }

  /**
   * Find user by name (excluding deleted)
   */
  async findByName(name) {
    return await User.findOne({ name, isDeleted: false });
  }

  /**
   * Find user by Google ID (excluding deleted)
   */
  async findByGoogleId(googleId) {
    return await User.findOne({ googleId, isDeleted: false });
  }

  /**
   * Find user by email or name (excluding deleted)
   */
  async findByEmailOrName(email, name) {
    return await User.findOne({
      $or: [{ email }, { name }],
      isDeleted: false
    });
  }

  /**
   * Create new user
   */
  async create(userData) {
    return await User.create(userData);
  }

  /**
   * Update user by ID
   */
  async updateById(id, updateData) {
    return await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  /**
   * Get all users with pagination (excluding deleted)
   */
  async findAll(skip, limit) {
    const users = await User.find({ isDeleted: false })
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await User.countDocuments({ isDeleted: false });
    
    return { users, total };
  }

  /**
   * Soft delete user
   */
  async softDelete(id) {
    return await User.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true } },
      { new: true }
    );
  }

  /**
   * Check if user exists by email or name (excluding deleted)
   */
  async existsByEmailOrName(email, name) {
    const user = await User.findOne({
      $or: [{ email }, { name }],
      isDeleted: false
    });
    return !!user;
  }
}

module.exports = new UserRepository();

