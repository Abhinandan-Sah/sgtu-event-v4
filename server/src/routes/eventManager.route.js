// Event Manager Routes - Protected routes for event managers
import express from 'express';
import EventManagerController from '../controllers/eventManager.controller.js';
import StallController from '../controllers/stall.controller.js';
import VolunteerController from '../controllers/volunteer.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { authLimiter, apiLimiter, eventCreationLimiter } from '../middleware/rateLimiter.js';
import { sanitizeBody, sanitizeQuery } from '../middleware/sanitizer.js';
import { 
  injectEventIdFromParams, 
  mapResourceIdToGenericId, 
  validateEventOwnership,
  filterByEventId 
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
 * @route   POST /api/event-manager/events/:eventId/submit-for-approval
 * @desc    Submit event for admin approval (DRAFT -> PENDING_APPROVAL)
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.post('/events/:eventId/submit-for-approval', EventManagerController.submitEventForApproval);

// ============================================================
// ANALYTICS ROUTES
// ============================================================

/**
 * @route   GET /api/event-manager/events/:eventId/analytics
 * @desc    Get comprehensive event analytics
 * @access  Private (EVENT_MANAGER - owner only)
 */
router.get('/events/:eventId/analytics', EventManagerController.getEventAnalytics);

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

export default router;
