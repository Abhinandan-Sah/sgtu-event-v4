/**
 * Cookie Helper Utilities
 * Centralized cookie management for JWT authentication
 * @module helpers/cookie
 */

/**
 * Cookie configuration constants
 */
const COOKIE_CONFIG = {
  TOKEN_NAME: 'token',
  MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  PATH: '/',
  
  // Security options
  get options() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      httpOnly: true,  // Prevents JavaScript access (XSS protection)
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin in production, 'lax' for development
      maxAge: this.MAX_AGE,
      path: this.PATH
    };
  }
};

/**
 * Set authentication cookie with JWT token
 * @param {Object} res - Express response object
 * @param {string} token - JWT token to store
 * @returns {void}
 * 
 * @example
 * const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
 * setAuthCookie(res, token);
 */
export const setAuthCookie = (res, token) => {
  if (!token) {
    throw new Error('Token is required to set authentication cookie');
  }

  res.cookie(COOKIE_CONFIG.TOKEN_NAME, token, COOKIE_CONFIG.options);
};

/**
 * Clear authentication cookie (logout)
 * @param {Object} res - Express response object
 * @returns {void}
 * 
 * @example
 * clearAuthCookie(res);
 */
export const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_CONFIG.TOKEN_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: COOKIE_CONFIG.PATH
  });
};

/**
 * Get token from cookie
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token or null if not found
 * 
 * @example
 * const token = getTokenFromCookie(req);
 */
export const getTokenFromCookie = (req) => {
  return req.cookies?.[COOKIE_CONFIG.TOKEN_NAME] || null;
};

/**
 * Check if token exists in cookie
 * @param {Object} req - Express request object
 * @returns {boolean} True if token exists
 * 
 * @example
 * if (hasAuthCookie(req)) {
 *   // Token exists
 * }
 */
export const hasAuthCookie = (req) => {
  return !!getTokenFromCookie(req);
};

export default {
  setAuthCookie,
  clearAuthCookie,
  getTokenFromCookie,
  hasAuthCookie,
  COOKIE_CONFIG
};
