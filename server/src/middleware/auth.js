import jwt from 'jsonwebtoken';
import { getTokenFromCookie } from '../helpers/cookie.js';

/**
 * Authentication & Authorization Middleware
 * 
 * Two-layer security approach:
 * 1. authenticateToken - Validates JWT token and extracts user data
 * 2. authorizeRoles - Enforces role-based access control (RBAC)
 * 
 * Supports dual authentication:
 * - HTTP-Only cookies (web browsers - more secure)
 * - Authorization header (mobile apps, Postman)
 * 
 * @module middleware/auth
 */

/**
 * Authenticate JWT token from HTTP-Only cookie or Authorization header
 * 
 * @middleware
 * @description 
 * - Validates JWT token signature and expiration
 * - Extracts user payload (id, email, role) and attaches to req.user
 * - Does NOT check user role (use authorizeRoles for that)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @returns {void}
 * 
 * @throws {401} - Missing token
 * @throws {403} - Invalid or expired token
 * @throws {500} - Authentication error
 */
export const authenticateToken = (req, res, next) => {
  try {
    // Get token from HTTP-Only cookie only (more secure)
    const token = getTokenFromCookie(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required. Please login.'
      });
    }

    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      // Attach user data to request
      req.user = decoded;
      next();
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};

/**
 * Authorize specific roles (RBAC - Role-Based Access Control)
 * 
 * @middleware
 * @description 
 * - Checks if authenticated user has the required role(s)
 * - Must be used AFTER authenticateToken middleware
 * - Supports multiple roles (e.g., authorizeRoles('ADMIN', 'VOLUNTEER'))
 * 
 * @param {...string} roles - Allowed roles (ADMIN, STUDENT, VOLUNTEER)
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Single role
 * router.get('/admin-only', authenticateToken, authorizeRoles('ADMIN'), controller.adminOnly);
 * 
 * // Multiple roles
 * router.get('/staff', authenticateToken, authorizeRoles('ADMIN', 'VOLUNTEER'), controller.staff);
 * 
 * // Router-level (DRY principle)
 * router.use(authenticateToken);
 * router.use(authorizeRoles('ADMIN'));
 * 
 * @throws {401} - User not authenticated (req.user missing)
 * @throws {403} - User doesn't have required role
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token
 * @middleware
 */
export const optionalAuth = (req, res, next) => {
  try {
    // Try cookie first
    let token = getTokenFromCookie(req);
    
    // Fallback to Authorization header
    if (!token) {
      const authHeader = req.headers['authorization'];
      token = authHeader && authHeader.split(' ')[1];
    }

    if (token) {
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (!err) {
          req.user = decoded;
        }
      });
    }

    next();
  } catch (error) {
    next();
  }
};

export default {
  authenticateToken,
  authorizeRoles,
  optionalAuth
};
