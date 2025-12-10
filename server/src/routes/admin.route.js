import express from 'express';
const router = express.Router();
import adminController from '../controllers/admin.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import upload, { handleUploadErrors } from '../middleware/uploadExcel.js';

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

// School management
router.get('/schools', adminController.getAllSchools);

// ============================================================
// STUDENT BULK UPLOAD ROUTES
// ============================================================

/**
 * @route   POST /api/admin/students/bulk-upload
 * @desc    Bulk upload students from Excel file (actual database insert)
 * @access  Private (ADMIN)
 */
router.post(
  '/students/bulk-upload',
  upload.single('file'),
  handleUploadErrors,
  adminController.bulkUploadStudents
);

/**
 * @route   POST /api/admin/students/validate-upload
 * @desc    Validate Excel file without inserting (dry-run preview)
 * @access  Private (ADMIN)
 */
router.post(
  '/students/validate-upload',
  upload.single('file'),
  handleUploadErrors,
  adminController.validateStudentUpload
);

/**
 * @route   GET /api/admin/students/upload-template
 * @desc    Download Excel template with headers and sample data
 * @access  Private (ADMIN)
 */
router.get('/students/upload-template', adminController.downloadStudentTemplate);

/**
 * @route   GET /api/admin/students/export
 * @desc    Export all students data to Excel file
 * @access  Private (ADMIN)
 */
router.get('/students/export', adminController.exportStudents);

// ============================================================
// EVENT BULK REGISTRATION ROUTES
// ============================================================

/**
 * @route   POST /api/admin/events/:eventId/bulk-register/validate
 * @desc    Validate bulk registration file (pre-upload check)
 * @access  Private (ADMIN)
 */
router.post(
  '/events/:eventId/bulk-register/validate',
  upload.single('file'),
  handleUploadErrors,
  adminController.validateBulkRegistration
);

/**
 * @route   POST /api/admin/events/:eventId/bulk-register
 * @desc    Bulk register students to event (unrestricted)
 * @access  Private (ADMIN)
 */
router.post(
  '/events/:eventId/bulk-register',
  upload.single('file'),
  handleUploadErrors,
  adminController.bulkRegisterStudents
);

/**
 * @route   GET /api/admin/bulk-register/template
 * @desc    Download generic bulk registration template (no event required)
 * @access  Private (ADMIN)
 */
router.get(
  '/bulk-register/template',
  adminController.downloadGenericBulkRegistrationTemplate
);

/**
 * @route   GET /api/admin/bulk-register/logs
 * @desc    Get all bulk registration logs across all events
 * @access  Private (ADMIN)
 */
router.get(
  '/bulk-register/logs',
  adminController.getAllBulkRegistrationLogs
);

/**
 * @route   GET /api/admin/bulk-register/logs/export
 * @desc    Export all bulk registration logs to CSV
 * @access  Private (ADMIN)
 */
router.get(
  '/bulk-register/logs/export',
  adminController.exportAllBulkRegistrationLogs
);

/**
 * @route   GET /api/admin/events/:eventId/bulk-register/template
 * @desc    Download event-specific registration template
 * @access  Private (ADMIN)
 */
router.get(
  '/events/:eventId/bulk-register/template',
  adminController.downloadEventRegistrationTemplate
);

/**
 * @route   GET /api/admin/events/:eventId/bulk-register/logs
 * @desc    Get bulk registration logs for event
 * @access  Private (ADMIN)
 */
router.get(
  '/events/:eventId/bulk-register/logs',
  adminController.getBulkRegistrationLogs
);

/**
 * @route   GET /api/admin/events/:eventId/bulk-register/logs/export
 * @desc    Export bulk registration logs to CSV
 * @access  Private (ADMIN)
 */
router.get(
  '/events/:eventId/bulk-register/logs/export',
  adminController.exportBulkRegistrationLogs
);

/**
 * @route   GET /api/admin/bulk-registrations/pending
 * @desc    Get pending bulk registration requests (>200 students)
 * @access  Private (ADMIN)
 */
router.get(
  '/bulk-registrations/pending',
  adminController.getPendingBulkRegistrations
);

/**
 * @route   POST /api/admin/bulk-registrations/:requestId/approve
 * @desc    Approve bulk registration request
 * @access  Private (ADMIN)
 */
router.post(
  '/bulk-registrations/:requestId/approve',
  adminController.approveBulkRegistration
);

/**
 * @route   POST /api/admin/bulk-registrations/:requestId/reject
 * @desc    Reject bulk registration request
 * @access  Private (ADMIN)
 */
router.post(
  '/bulk-registrations/:requestId/reject',
  adminController.rejectBulkRegistration
);

/**
 * @route   PATCH /api/admin/events/:eventId/capacity
 * @desc    Update event capacity
 * @access  Private (ADMIN)
 */
router.patch(
  '/events/:eventId/capacity',
  adminController.updateEventCapacity
);

// ============================================================
// DEREGISTRATION & REFUND ROUTES
// ============================================================

/**
 * @route   POST /api/admin/registrations/:registrationId/cancel
 * @desc    Cancel single registration (admin override)
 * @access  Private (ADMIN)
 */
router.post(
  '/registrations/:registrationId/cancel',
  adminController.cancelRegistration
);

/**
 * @route   POST /api/admin/events/:eventId/cancel
 * @desc    Cancel entire event with cascade refunds
 * @access  Private (ADMIN)
 */
router.post('/events/:eventId/cancel', adminController.cancelEvent);

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

// ============================================================
// RANKING ROUTES (Multi-Event Support - Comprehensive Rankings)
// ============================================================

/**
 * @route   GET /api/admin/rankings/all
 * @desc    Get comprehensive ranking summary across all events
 * @access  Private (ADMIN)
 */
router.get('/rankings/all', adminController.getAllEventsRankingsSummary);

/**
 * @route   GET /api/admin/rankings/by-event
 * @desc    Get rankings grouped by event
 * @access  Private (ADMIN)
 */
router.get('/rankings/by-event', adminController.getRankingsByEvent);

/**
 * @route   GET /api/admin/events/:eventId/rankings/stalls
 * @desc    Get stall rankings for any approved event
 * @access  Private (ADMIN)
 */
router.get('/events/:eventId/rankings/stalls', adminController.getEventStallRankings);

/**
 * @route   GET /api/admin/events/:eventId/rankings/students
 * @desc    Get student rankings for any approved event
 * @access  Private (ADMIN)
 */
router.get('/events/:eventId/rankings/students', adminController.getEventStudentRankings);

/**
 * @route   GET /api/admin/events/:eventId/rankings/schools
 * @desc    Get school rankings for any approved event
 * @access  Private (ADMIN)
 */
router.get('/events/:eventId/rankings/schools', adminController.getEventSchoolRankings);

// ============================================================
// RANKING VISIBILITY CONTROL (Publish/Unpublish)
// ============================================================

/**
 * @route   PATCH /api/admin/events/:id/publish-rankings
 * @desc    Publish event rankings (make visible to public immediately)
 * @access  Private (ADMIN)
 */
router.patch('/events/:id/publish-rankings', adminController.publishRankings);

/**
 * @route   PATCH /api/admin/events/:id/unpublish-rankings
 * @desc    Unpublish event rankings (hide from public view)
 * @access  Private (ADMIN)
 */
router.patch('/events/:id/unpublish-rankings', adminController.unpublishRankings);

/**
 * @route   PATCH /api/admin/events/:id/reset-rankings-visibility
 * @desc    Reset rankings visibility to auto-mode (show if COMPLETED, else hide)
 * @access  Private (ADMIN)
 */
router.patch('/events/:id/reset-rankings-visibility', adminController.resetRankingsVisibility);

// ============================================================
// SEARCH AND PLATFORM REFUNDS
// ============================================================

/**
 * @route   GET /api/admin/students/search?q=<query>&page=1&limit=20
 * @desc    Search students by name, email, phone, registration_no, or school
 * @access  Private (ADMIN)
 */
router.get('/students/search', adminController.searchStudents);

/**
 * @route   GET /api/admin/events/search?q=<query>&page=1&limit=20
 * @desc    Search events by name, code, description, or manager name
 * @access  Private (ADMIN)
 */
router.get('/events/search', adminController.searchEvents);

/**
 * @route   GET /api/admin/refunds?page=1&limit=50
 * @desc    Get platform-wide refund history with aggregated stats
 * @access  Private (ADMIN)
 */
router.get('/refunds', adminController.getPlatformRefunds);

export default router;
