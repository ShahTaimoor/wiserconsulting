/**
 * Logger Utility
 * No console.logs in production
 * Structured logging for development
 */

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  info: (...args) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args);
    }
  },
  
  error: (...args) => {
    if (isDevelopment) {
      console.error('[ERROR]', ...args);
    }
    // In production, send to logging service (e.g., Sentry, Loggly)
    // Example: loggingService.error(...args);
  },
  
  warn: (...args) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args);
    }
  },
  
  debug: (...args) => {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args);
    }
  }
};

module.exports = logger;

