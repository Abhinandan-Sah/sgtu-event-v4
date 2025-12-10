// Event Manager Routes - Protected routes for event managers
import express from 'express';
import EventManagerController from '../controllers/eventManager.controller.js';
import StallController from '../controllers/stall.controller.js';
import VolunteerController from '../controllers/volunteer.controller.js';
import RankingController from '../controllers/ranking.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { authLimiter, apiLimiter, eventCreationLimiter } from '../middleware/rateLimiter.js';
import { sanitizeBody, sanitizeQuery } from '../middleware/sanitizer.js';
import upload, { handleUploadErrors } from '../middleware/uploadExcel.js';
import { 
  injectEventIdFromParams, 
  mapResourceIdToGenericId, 
  validateEventOwnership,
  filterByEventId,
  validateEventOwnershipForViewOnly
} from '../middleware/eventManagerHelpers.js';

const router = express.Router();

// ============================================================
// PUBLIC ROUTES (Authentication)
// ============================================================

/**
 * @route   POST /api/event-manager/login
 * @desc    Login event manager
 * @access  Public
 * @note    Event managers are created by admins only
 */
router.post('/login', authLimiter, EventManagerController.login);

/**
 * @route   POST /api/event-manager/verify-identity
 * @desc    Verify identity using phone + school_id (for password reset)
 * @access  Public (with limited token)
 */
router.post('/verify-identity', authLimiter, authenticateToken, EventManagerController.verifyIdentity);

/**
 * @route   POST /api/event-manager/reset-password
 * @desc    Reset password after identity verification
 * @access  Public (with verified token)
 */
router.post('/reset-password', authLimiter, authenticateToken, EventManagerController.resetPassword);

// ============================================================
// PROTECTED ROUTES (Require authentication + EVENT_MANAGER role)
// ============================================================

// Apply authentication and authorization middleware to all routes below
router.use(authenticateToken);
router.use(authorizeRoles('EVENT_MANAGER'));
router.use(apiLimiter);
router.use(sanitizeBody); // Sanitize all request bodies
router.use(sanitizeQuery); // Sanitize all query parameters

/**
 * @route   POST /api/event-manager/logout
 * @desc    Logout event manager
 * @access  Private (EVENT_MANAGER)
 */
router.post('/logout', EventManagerController.logout);

/**
 * @route   GET /api/event-manager/profile
 * @desc    Get event manager profile
 * @access  Private (EVENT_MANAGER)
 */
router.get('/profile', EventManagerController.getProfile);

/**
 * @route   PUT /api/event-manager/profile
 * @desc    Update event manager profile
 * @access  Private (EVENT_MANAGER)
 */
router.put('/profile', EventManagerController.updateProfile);

/**
 * @route   GET /api/event-manager/schools
 * @desc    Get all schools (for stall/volunteer creation)
 * @access  Private (EVENT_MANAGER)
 */
router.get('/schools', EventManagerController.getAllSchools);

// ============================================================
// EVENT MANAGEMENT ROUTES
// ============================================================

/**
 * @route   POST /api/event-manager/events
 * @desc    Create new event
 * @access  Private (EVENT_MANAGER)
 */
router.post('/events', eventCreationLimiter, EventManagerController.createEvent);

/**
 * @route   GET /api/event-manager/events
 * @desc    Get all events created by manager
 * @access  Private (EVENT_MANAGER)
 */
router.get('/events', EventManagerController.getMyEvents);

/**
 * @route   GET /api/event-manager/events/:eventId
 * @desc    Get single event details
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId', EventManagerController.getEventDetails);

/**
 * @route   PUT /api/event-manager/events/:eventId
 * @desc    Update event
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.put('/events/:eventId', EventManagerController.updateEvent);

/**
 * @route   DELETE /api/event-manager/events/:eventId
 * @desc    Delete event (soft delete - cancel)
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.delete('/events/:eventId', EventManagerController.deleteEvent);

// ============================================================
// REGISTRATION MANAGEMENT ROUTES
// ============================================================

/**
 * @route   GET /api/event-manager/events/:eventId/registrations
 * @desc    Get event registrations
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId/registrations', EventManagerController.getEventRegistrations);

/**
 * @route   GET /api/event-manager/events/:eventId/registrations/search
 * @desc    Search registrations by name, email, phone, or registration number
 * @access  Private (EVENT_MANAGER - owner only)
 * @query   q (required) - Search term, page, limit
 * @returns { data: [], pagination, search_query }
 * @example /events/123/registrations/search?q=john&page=1&limit=20
 */
router.get('/events/:eventId/registrations/search',
  EventManagerController.searchRegistrations
);

/**
 * @route   GET /api/event-manager/events/:eventId/registrations/by-number/:registrationNumber
 * @desc    Get single registration details by student registration number
 * @access  Private (EVENT_MANAGER - owner only)
 * @returns { success, data: { registration details with student info } }
 */
router.get('/events/:eventId/registrations/by-number/:registrationNumber',
  EventManagerController.getRegistrationByNumber
);

/**
 * @route   GET /api/event-manager/events/:eventId/registrations/check-cancellable/:registrationNumber
 * @desc    Check if a registration is cancellable and get refund eligibility
 * @access  Private (EVENT_MANAGER - owner only)
 * @returns { cancellable, reason, refund: { eligible, amount, percent }, registration }
 */
router.get('/events/:eventId/registrations/check-cancellable/:registrationNumber',
  EventManagerController.checkCancellable
);

/**
 * @route   POST /api/event-manager/events/:eventId/submit-for-approval
 * @desc    Submit event for admin approval (DRAFT -> PENDING_APPROVAL)
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.post('/events/:eventId/submit-for-approval', EventManagerController.submitEventForApproval);

// ============================================================
// EVENT BULK REGISTRATION ROUTES (RESTRICTED)
// ============================================================

/**
 * @route   GET /api/event-manager/events/:eventId/bulk-register/check-eligibility
 * @desc    Check eligibility for bulk registration (rate limits, status, etc.)
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get(
  '/events/:eventId/bulk-register/check-eligibility',
  EventManagerController.checkEligibility
);

/**
 * @route   POST /api/event-manager/events/:eventId/bulk-register/validate
 * @desc    Validate bulk registration file (pre-upload check)
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.post(
  '/events/:eventId/bulk-register/validate',
  upload.single('file'),
  handleUploadErrors,
  EventManagerController.validateBulkRegistration
);

/**
 * @route   POST /api/event-manager/events/:eventId/bulk-register
 * @desc    Bulk register students to event (with restrictions)
 * @access  Private (EVENT_MANAGER - owner only)
 * @restrictions 
 *   - Only DRAFT/REJECTED events
 *   - Only own events
 *   - School-scoped students only
 *   - >200 requires admin approval
 *   - Rate limited: 15min cooldown, 20/day max
 */
router.post(
  '/events/:eventId/bulk-register',
  upload.single('file'),
  handleUploadErrors,
  EventManagerController.bulkRegisterStudents
);

/**
 * @route   GET /api/event-manager/events/:eventId/bulk-register/template
 * @desc    Download event registration template (event-specific)
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get(
  '/events/:eventId/bulk-register/template',
  EventManagerController.downloadEventRegistrationTemplate
);

// ============================================================
// ANALYTICS ROUTES
// ============================================================

/**
 * @route   GET /api/event-manager/events/:eventId/analytics
 * @desc    Get comprehensive event analytics
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId/analytics', EventManagerController.getEventAnalytics);

/**
 * @route   GET /api/event-manager/events/:eventId/refunds
 * @desc    Get refund history for event (all issued refunds)
 * @access  Private (EVENT_MANAGER - owner only)
 * @query   page, limit
 * @returns { data: [], summary: { total_refunds, total_refunded, average_refund }, pagination }
 * @note    Useful for financial reconciliation and audit trail
 */
router.get('/events/:eventId/refunds', EventManagerController.getRefundHistory);

// ============================================================
// STALL MANAGEMENT ROUTES (CRUD Operations)
// Uses existing StallController with middleware for ownership validation
// ============================================================

// ============================================================
// CONVENIENCE ALIAS ROUTES - Reuse Existing Controllers
// These provide RESTful URLs while leveraging existing stall/volunteer logic
// ============================================================

/**
 * @route   POST /api/event-manager/events/:eventId/stalls/create
 * @desc    Create stall for event (alias for POST /api/stall)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing StallController with middleware to inject event_id
 */
router.post('/events/:eventId/stalls/create',
  validateEventOwnership,
  injectEventIdFromParams,
  StallController.createStall
);

/**
 * @route   GET /api/event-manager/events/:eventId/stalls/list
 * @desc    Get all stalls for event (alias for GET /api/stall)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing StallController with event_id filter
 */
router.get('/events/:eventId/stalls/list',
  validateEventOwnership,
  filterByEventId,
  StallController.getAllStalls
);

/**
 * @route   PUT /api/event-manager/events/:eventId/stalls/:stallId/update
 * @desc    Update stall (alias for PUT /api/stall/:id)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing StallController with ownership validation
 */
router.put('/events/:eventId/stalls/:stallId/update',
  validateEventOwnership,
  injectEventIdFromParams,
  mapResourceIdToGenericId('stallId'),
  StallController.updateStall
);

/**
 * @route   DELETE /api/event-manager/events/:eventId/stalls/:stallId/delete
 * @desc    Delete stall (alias for DELETE /api/stall/:id)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing StallController with ownership validation
 */
router.delete('/events/:eventId/stalls/:stallId/delete',
  validateEventOwnership,
  mapResourceIdToGenericId('stallId'),
  StallController.deleteStall
);

/**
 * @route   POST /api/event-manager/events/:eventId/volunteers/create
 * @desc    Create volunteer for event (alias for POST /api/volunteer)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing VolunteerController with middleware to inject event_id
 */
router.post('/events/:eventId/volunteers/create',
  validateEventOwnership,
  injectEventIdFromParams,
  VolunteerController.createVolunteer
);

/**
 * @route   GET /api/event-manager/events/:eventId/volunteers/list
 * @desc    Get all volunteers for event (alias for GET /api/volunteer)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing VolunteerController with event_id filter
 */
router.get('/events/:eventId/volunteers/list',
  validateEventOwnership,
  filterByEventId,
  VolunteerController.getAllVolunteers
);

/**
 * @route   PUT /api/event-manager/events/:eventId/volunteers/:volunteerId/update
 * @desc    Update volunteer (alias for PUT /api/volunteer/:id)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing VolunteerController with ownership validation
 */
router.put('/events/:eventId/volunteers/:volunteerId/update',
  validateEventOwnership,
  injectEventIdFromParams,
  mapResourceIdToGenericId('volunteerId'),
  VolunteerController.updateVolunteer
);

/**
 * @route   DELETE /api/event-manager/events/:eventId/volunteers/:volunteerId/delete
 * @desc    Delete volunteer (alias for DELETE /api/volunteer/:id)
 * @access  Private (EVENT_MANAGER - owner only)
 * @note    Uses existing VolunteerController with ownership validation
 */
router.delete('/events/:eventId/volunteers/:volunteerId/delete',
  validateEventOwnership,
  mapResourceIdToGenericId('volunteerId'),
  VolunteerController.deleteVolunteer
);

// ============================================================
// RANKING ROUTES (View Rankings for Own Events)
// ============================================================

/**
 * @route   GET /api/event-manager/events/:eventId/rankings/stalls
 * @desc    Get stall rankings for own event
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId/rankings/stalls',
  validateEventOwnershipForViewOnly,
  RankingController.getTopStallRankings
);

/**
 * @route   GET /api/event-manager/events/:eventId/rankings/students
 * @desc    Get student rankings for own event
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId/rankings/students',
  validateEventOwnershipForViewOnly,
  RankingController.getTopStudentRankings
);

/**
 * @route   GET /api/event-manager/events/:eventId/rankings/schools
 * @desc    Get school rankings for own event
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId/rankings/schools',
  validateEventOwnershipForViewOnly,
  RankingController.getTopSchools
);

/**
 * @route   GET /api/event-manager/events/:eventId/rankings/all
 * @desc    Get all ranking submissions for own event
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId/rankings/all',
  validateEventOwnershipForViewOnly,
  RankingController.getAllRankings
);

// ============================================================
// CANCELLATION ROUTES
// ============================================================

/**
 * @route   POST /api/event-manager/events/:eventId/cancel-registration
 * @desc    Cancel a single event registration (with refund calculation)
 * @access  Private (EVENT_MANAGER - owner only)
 * @body    { registration_number: string, reason: string } (reason is optional)
 * @returns { success, message, data: { registration_id, refund: { eligible, amount, percent } } }
 * @note    Automatically promotes from waitlist if capacity opens up
 */
router.post('/events/:eventId/cancel-registration',
  EventManagerController.cancelRegistration
);

/**
 * @route   POST /api/event-manager/events/:eventId/bulk-cancel
 * @desc    Bulk cancel multiple event registrations
 * @access  Private (EVENT_MANAGER - owner only)
 * @body    { registration_numbers: string[], reason: string } OR Excel file with registration_number column
 * @returns { success, message, data: { total, successful, failed, errors[] } }
 * @note    Supports both JSON array and Excel file upload
 * @example JSON: { "registration_numbers": ["REG001", "REG002"], "reason": "Event postponed" }
 * @example Excel: File with columns: registration_number (required)
 */
router.post('/events/:eventId/bulk-cancel',
  upload.single('file'),
  handleUploadErrors,
  EventManagerController.bulkCancelRegistrations
);

export default router;
