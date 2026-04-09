/**
 * Central Error Handler Middleware
 * Handles all errors and returns proper HTTP status codes
 */

const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let error = err;

  // If error is already an AppError, use it directly
  if (err.isOperational && err.statusCode) {
    error = err;
  } else {
    // Log error
    logger.error('Error:', err);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
      const message = 'Resource not found';
      error = new AppError(message, 404);
    }
    // Mongoose duplicate key
    else if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      const message = `${field} already exists`;
      error = new AppError(message, 400);
    }
    // Mongoose validation error
    else if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(val => val.message).join(', ');
      error = new AppError(message, 400);
    }
    // JWT errors
    else if (err.name === 'JsonWebTokenError') {
      const message = 'Invalid token';
      error = new AppError(message, 401);
    }
    else if (err.name === 'TokenExpiredError') {
      const message = 'Token expired';
      error = new AppError(message, 401);
    }
    // Zod validation errors
    else if (err.name === 'ZodError') {
      const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      error = new AppError(message, 400);
    }
    // Unknown/unexpected errors
    else {
      logger.error('Unexpected error:', err);
      error = new AppError(err.message || 'Server Error', err.statusCode || 500);
    }
  }

  // Standard API response format
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

module.exports = { errorHandler, AppError };

