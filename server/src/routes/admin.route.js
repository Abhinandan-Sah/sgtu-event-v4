import express from 'express';
const router = express.Router();
import adminController from '../controllers/admin.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

/**
 * Admin Routes
 * Security: Router-level middleware for DRY principle
 * All protected routes automatically require ADMIN role
 */

// 🔓 Public routes (no authentication)
router.post('/login', adminController.login);

// 🔒 Apply authentication + ADMIN authorization to all routes below
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

// Protected routes (automatically secured with ADMIN role)
router.post('/logout', adminController.logout);
router.get('/profile', adminController.getProfile);
router.put('/profile', adminController.updateProfile);
router.get('/students', adminController.getAllStudents);
router.get('/volunteers', adminController.getAllVolunteers);
router.get('/stalls', adminController.getAllStalls);
router.get('/stats', adminController.getStats);

// School ranking results (Category 2 - ADMIN ONLY)
router.get('/top-schools', adminController.getTopSchools);
router.get('/top-stalls', adminController.getTopStalls);

// ============================================================
// EVENT MANAGER MANAGEMENT ROUTES (Multi-Event Support)
// ============================================================

/**
 * @route   POST /api/admin/event-managers
 * @desc    Create new event manager account
 * @access  Private (ADMIN)
 */
router.post('/event-managers', adminController.createEventManager);

/**
 * @route   GET /api/admin/event-managers
 * @desc    Get all event managers
 * @access  Private (ADMIN)
 */
router.get('/event-managers', adminController.getAllEventManagers);

/**
 * @route   GET /api/admin/event-managers/:id
 * @desc    Get event manager details
 * @access  Private (ADMIN)
 */
router.get('/event-managers/:id', adminController.getEventManagerDetails);

/**
 * @route   PUT /api/admin/event-managers/:id
 * @desc    Update event manager account
 * @access  Private (ADMIN)
 */
router.put('/event-managers/:id', adminController.updateEventManager);

/**
 * @route   DELETE /api/admin/event-managers/:id
 * @desc    Delete event manager account
 * @access  Private (ADMIN)
 */
router.delete('/event-managers/:id', adminController.deleteEventManager);

// ============================================================
// EVENT APPROVAL & MANAGEMENT ROUTES (Multi-Event Support)
// ============================================================

/**
 * @route   GET /api/admin/events/pending
 * @desc    Get all pending event approval requests
 * @access  Private (ADMIN)
 */
router.get('/events/pending', adminController.getPendingEvents);

/**
 * @route   GET /api/admin/events
 * @desc    Get all events with optional filters (status, type, manager)
 * @access  Private (ADMIN)
 */
router.get('/events', adminController.getAllEvents);

/**
 * @route   GET /api/admin/events/:id
 * @desc    Get event details with registration stats
 * @access  Private (ADMIN)
 */
router.get('/events/:id', adminController.getEventDetails);

/**
 * @route   PATCH /api/admin/events/:id/approve
 * @desc    Approve event
 * @access  Private (ADMIN)
 */
router.patch('/events/:id/approve', adminController.approveEvent);

/**
 * @route   PATCH /api/admin/events/:id/reject
 * @desc    Reject event with reason
 * @access  Private (ADMIN)
 */
router.patch('/events/:id/reject', adminController.rejectEvent);

/**
 * @route   GET /api/admin/events/:id/approval-preview
 * @desc    Get event approval preview (event, manager, stalls, volunteers)
 * @access  Private (ADMIN)
 */
router.get('/events/:id/approval-preview', adminController.getEventApprovalPreview);

/**
 * @route   GET /api/admin/events/:id/analytics
 * @desc    Get comprehensive event analytics (approved events only)
 * @access  Private (ADMIN)
 */
router.get('/events/:id/analytics', adminController.getEventAnalytics);

export default router;
