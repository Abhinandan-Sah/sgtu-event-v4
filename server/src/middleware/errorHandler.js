import logger from '../utils/logger.js';

/**
 * Centralized Error Handling Middleware
 * Catches and formats all errors consistently
 */

/**
 * Global error handler
 * @middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.id || 'anonymous'
  });

  // Default error status
  const statusCode = err.statusCode || err.status || 500;

  // Determine error type and message
  let message = err.message || 'Internal Server Error';
  let errors = null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    // Mongoose/Express validation errors
    message = 'Validation Error';
    errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
  } else if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    message = 'Token expired';
  } else if (err.code === '23505') {
    // PostgreSQL unique violation
    message = 'Duplicate entry';
  } else if (err.code === '23503') {
    // PostgreSQL foreign key violation
    message = 'Referenced record not found';
  } else if (err.code === '23502') {
    // PostgreSQL not null violation
    message = 'Required field missing';
  }

  // Build response
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };

  // Include error details in development
  if (process.env.NODE_ENV === 'development') {
    response.error = {
      stack: err.stack,
      details: err.details || err.toString()
    };
  }

  // Include validation errors
  if (errors) {
    response.errors = errors;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 Not Found handler
 * @middleware
 */
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
