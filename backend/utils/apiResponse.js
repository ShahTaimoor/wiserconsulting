/**
 * Standard API Response Utility
 * Ensures consistent response format across all endpoints
 */

class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      ...(data && { data })
    });
  }

  static error(res, message = 'Error', statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      ...(errors && { errors })
    });
  }

  static paginated(res, data, meta, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      meta
    });
  }
}

module.exports = ApiResponse;

