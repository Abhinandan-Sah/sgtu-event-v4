/**
 * Input Sanitization Middleware
 * Prevents XSS attacks by sanitizing user inputs
 */

/**
 * Sanitize string input - removes HTML tags and trims whitespace
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/<[^>]*>/g, '');
};

/**
 * Sanitize object recursively
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
export const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
};

/**
 * Middleware to sanitize request body
 * Applies to POST, PUT, PATCH requests
 */
export const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Middleware to sanitize query parameters
 */
export const sanitizeQuery = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    // Don't reassign req.query directly (it's a getter-only property)
    // Instead, sanitize each property individually
    Object.keys(req.query).forEach(key => {
      const sanitized = sanitizeObject(req.query[key]);
      // Delete and redefine to avoid getter/setter issues
      delete req.query[key];
      req.query[key] = sanitized;
    });
  }
  next();
};

/**
 * Middleware to sanitize URL parameters
 */
export const sanitizeParams = (req, res, next) => {
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
};

/**
 * Combined sanitization middleware for all inputs
 */
export const sanitizeAll = (req, res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
};

export default {
  sanitizeString,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll
};
