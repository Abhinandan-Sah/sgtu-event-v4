import express from 'express';
const router = express.Router();
import studentController from '../controllers/student.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { 
  requireEventContext, 
  requireEventRegistration, 
  requireActiveCheckIn 
} from '../middleware/eventContext.js';

/**
 * Student Routes
 * Security: Router-level middleware for DRY principle
 * All protected routes automatically require STUDENT role
 */

// 🔓 Public routes (no authentication)
router.post('/login', studentController.login);
router.post('/verify-reset-credentials', studentController.verifyResetCredentials);
router.post('/reset-password', studentController.resetPassword);

// 🔒 Apply authentication + STUDENT authorization to all routes below
router.use(authenticateToken);
router.use(authorizeRoles('STUDENT'));

// Protected routes (automatically secured with STUDENT role)
router.post('/logout', studentController.logout);
router.get('/profile', studentController.getProfile);
router.put('/profile', studentController.updateProfile);
router.get('/qr-code', studentController.getQRCode);
router.get('/check-in-history', studentController.getCheckInHistory);

// Stall interaction routes (self-service inside event)(Category 1 - student scan and submit feedback)
router.post('/scan-stall', studentController.scanStall);
router.post('/submit-feedback', studentController.submitFeedback);
router.get('/my-visits', studentController.getMyVisits);

// School ranking routes (Category 2 - students rank their own school's stalls)
router.get('/my-school-stalls', studentController.getMySchoolStalls);
router.post('/submit-school-ranking', studentController.submitSchoolRanking);
router.get('/my-submitted-rank', studentController.getMySchoolRanking);

// ============================================================
// EVENT DISCOVERY AND REGISTRATION ROUTES (Multi-Event Support)
// ============================================================

/**
 * @route   GET /api/student/events
 * @desc    Get available events (free and paid)
 * @access  Private (STUDENT)
 */
router.get('/events', studentController.getAvailableEvents);

/**
 * @route   GET /api/student/events/:eventId
 * @desc    Get single event details
 * @access  Private (STUDENT)
 */
router.get('/events/:eventId', studentController.getEventDetails);

/**
 * @route   POST /api/student/events/:eventId/register
 * @desc    Register for free event
 * @access  Private (STUDENT)
 */
router.post('/events/:eventId/register', studentController.registerForFreeEvent);

/**
 * @route   POST /api/student/events/:eventId/payment/initiate
 * @desc    Initiate payment for paid event
 * @access  Private (STUDENT)
 */
router.post('/events/:eventId/payment/initiate', studentController.initiatePaidEventPayment);

/**
 * @route   POST /api/student/events/:eventId/payment/verify
 * @desc    Verify payment and complete registration
 * @access  Private (STUDENT)
 */
router.post('/events/:eventId/payment/verify', studentController.verifyPayment);

/**
 * @route   GET /api/student/my-events
 * @desc    Get student's registered events
 * @access  Private (STUDENT)
 */
router.get('/my-events', studentController.getMyRegisteredEvents);

/**
 * @route   POST /api/student/events/:eventId/payment/webhook
 * @desc    Razorpay payment webhook
 * @access  Public (Razorpay callback)
 */
// Note: Webhook route should be handled separately with signature verification

// ============================================================
// EVENT-SCOPED ROUTES (NEW - Professional Implementation)
// ============================================================

/**
 * @route   POST /api/student/events/:eventId/submit-feedback
 * @desc    Submit feedback for stall in specific event (dynamic limit based on stall count)
 * @access  Private (STUDENT + Event Registration + Active Check-In)
 * @middleware requireEventContext, requireEventRegistration, requireActiveCheckIn
 */
router.post(
  '/events/:eventId/submit-feedback',
  requireEventContext,
  requireEventRegistration,
  requireActiveCheckIn,
  studentController.submitEventFeedback
);

/**
 * @route   GET /api/student/events/:eventId/my-visits
 * @desc    Get student's visits/feedbacks for specific event
 * @access  Private (STUDENT + Event Registration)
 * @middleware requireEventContext, requireEventRegistration
 */
router.get(
  '/events/:eventId/my-visits',
  requireEventContext,
  requireEventRegistration,
  studentController.getEventVisits
);

/**
 * @route   POST /api/student/events/:eventId/submit-school-ranking
 * @desc    Submit school ranking for specific event (per-event completion tracking)
 * @access  Private (STUDENT + Event Registration + Active Check-In)
 * @middleware requireEventContext, requireEventRegistration, requireActiveCheckIn
 */
router.post(
  '/events/:eventId/submit-school-ranking',
  requireEventContext,
  requireEventRegistration,
  requireActiveCheckIn,
  studentController.submitEventRanking
);

/**
 * @route   GET /api/student/events/:eventId/stats
 * @desc    Get event-specific statistics for student
 * @access  Private (STUDENT + Event Registration)
 * @middleware requireEventContext, requireEventRegistration
 */
router.get(
  '/events/:eventId/stats',
  requireEventContext,
  requireEventRegistration,
  studentController.getEventStats
);

export default router;
