import rateLimit from 'express-rate-limit';
// import RedisStore from 'rate-limit-redis';
// import { redisClient } from '../config/redis.js';

/**
 * Rate Limiting Middleware
 * Prevents API abuse and DDoS attacks
 * Note: Using in-memory store. For production with multiple servers, use Redis store.
 */

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false // Disable `X-RateLimit-*` headers
  // Note: Using in-memory store (default). For production with multiple servers, configure Redis store.
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false
  // Note: Using in-memory store (default). For production with multiple servers, configure Redis store.
});

/**
 * QR code generation rate limiter
 * 50 requests per minute
 */
export const qrLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // Limit each IP to 50 QR requests per minute
  message: {
    success: false,
    message: 'QR code generation limit exceeded, please slow down',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict rate limiter for registration
 * 3 requests per hour
 */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registrations per hour
  message: {
    success: false,
    message: 'Registration limit exceeded, please try again later',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Feedback submission rate limiter
 * 10 requests per hour
 */
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 feedback submissions per hour
  message: {
    success: false,
    message: 'Feedback submission limit exceeded',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Event creation rate limiter
 * 10 events per hour per event manager
 */
export const eventCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each manager to 10 event creations per hour
  message: {
    success: false,
    message: 'Event creation limit exceeded. You can create up to 10 events per hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export default {
  apiLimiter,
  authLimiter,
  qrLimiter,
  registrationLimiter,
  feedbackLimiter,
  eventCreationLimiter
};
