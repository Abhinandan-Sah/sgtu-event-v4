/**
 * Standardized API Response Helpers
 * Ensures consistent response format across all endpoints
 */

/**
 * Success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {*} errors - Additional error details
 */
export const errorResponse = (res, message = 'Error occurred', statusCode = 400, errors = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Validation error response
 * @param {Object} res - Express response object
 * @param {Array} errors - Validation errors array
 */
export const validationErrorResponse = (res, errors) => {
  return res.status(422).json({
    success: false,
    message: 'Validation failed',
    errors,
    timestamp: new Date().toISOString()
  });
};

/**
 * Paginated response
 * @param {Object} res - Express response object
 * @param {Array} data - Response data array
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total items count
 */
export const paginatedResponse = (res, data, page, limit, total) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  });
};

export default {
  successResponse,
  errorResponse,
  validationErrorResponse,
  paginatedResponse
};
