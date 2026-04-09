/**
 * User Controller
 * Handles HTTP requests and responses
 * Only validates request, calls service, returns response
 */

const userService = require('../services/userService');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class UserController {
  /**
   * Sign up new user
   */
  signup = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const result = await userService.signup(name, email, password);

    return ApiResponse.success(res, result, 'User created successfully', 201);
  })

  /**
   * Login user
   */
  login = asyncHandler(async (req, res) => {
    const { email, name, password } = req.body;
    const result = await userService.login(email, name, password);

    const token = result.token;
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      maxAge: 365 * 24 * 60 * 60 * 1000
    });

    return ApiResponse.success(res, { user: result.user, token }, 'Login successful');
  })

  /**
   * Logout user
   */
  logout = (req, res) => {
    res.cookie('token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      expires: new Date(0)
    });

    return ApiResponse.success(res, null, 'Logged out successfully');
  }

  /**
   * Get all users (with pagination)
   */
  getAllUsers = asyncHandler(async (req, res) => {
    const { skip, limit, page } = getPaginationParams(req);
    const { users, total } = await userService.getAllUsers(skip, limit);
    const meta = getPaginationMeta(page, limit, total);

    return ApiResponse.paginated(res, { users }, meta, 'Users retrieved successfully');
  })

  /**
   * Update user profile
   */
  updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const updateData = req.body;
    const result = await userService.updateProfile(userId, updateData);

    return ApiResponse.success(res, result, 'Profile updated successfully');
  })

  /**
   * Update user role (Admin only)
   */
  updateUserRole = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
    const result = await userService.updateUserRole(userId, role);

    return ApiResponse.success(res, result, 'User role updated successfully');
  })

  /**
   * Create admin user
   */
  createAdmin = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const result = await userService.createAdmin(name, email, password);

    return ApiResponse.success(res, result, 'Admin user created successfully', 201);
  })

  /**
   * Handle Google OAuth token
   */
  handleGoogleToken = asyncHandler(async (req, res) => {
    const { access_token } = req.body;
    const result = await userService.handleGoogleAuth(access_token);
    const token = result.token;

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      maxAge: 365 * 24 * 60 * 60 * 1000
    });

    return ApiResponse.success(res, {
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role
      },
      token
    }, 'Google authentication successful');
  })
}

module.exports = new UserController();

