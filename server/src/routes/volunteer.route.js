import express from 'express';
const router = express.Router();
import volunteerController from '../controllers/volunteer.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

/**
 * Volunteer Routes
 * Security: Router-level middleware for DRY principle
 * Mix of public, volunteer, and admin routes
 */

// 🔓 Public routes (no authentication)
router.post('/login', volunteerController.login);
router.post('/register', volunteerController.register);

// 🔒 Apply authentication to all routes below
router.use(authenticateToken);

// Identity verification (no role check - for first-time login)
router.post('/verify-identity', volunteerController.verifyIdentity);
router.post('/reset-password', volunteerController.resetPassword);

// Volunteer-only protected routes
router.post('/logout', authorizeRoles('VOLUNTEER'), volunteerController.logout);
router.get('/profile', authorizeRoles('VOLUNTEER'), volunteerController.getProfile);

// ✨ Smart QR scanning - Volunteer only
router.post('/scan/student', authorizeRoles('VOLUNTEER'), volunteerController.scanStudentQR);
// router.post('/scan/stall', authorizeRoles('VOLUNTEER'), volunteerController.scanStallQR);

// Volunteer history - Volunteer only
router.get('/history', authorizeRoles('VOLUNTEER'), volunteerController.getHistory);

// ============================================================
// EVENT ASSIGNMENT ROUTES (Multi-Event Support) - Volunteer only
// ============================================================

/**
 * @route   GET /api/volunteer/assigned-events
 * @desc    Get events assigned to volunteer
 * @access  Private (VOLUNTEER)
 */
router.get('/assigned-events', authorizeRoles('VOLUNTEER'), volunteerController.getAssignedEvents);

// ============================================================
// MANAGEMENT ROUTES (Admin and Event Manager only)
// ============================================================

/**
 * @route   GET /api/volunteer
 * @desc    Get all volunteers
 * @access  Private (ADMIN, EVENT_MANAGER)
 */
router.get('/', authorizeRoles('ADMIN', 'EVENT_MANAGER'), volunteerController.getAllVolunteers);

/**
 * @route   GET /api/volunteer/:id
 * @desc    Get volunteer by ID
 * @access  Private (ADMIN, EVENT_MANAGER)
 */
router.get('/:id', authorizeRoles('ADMIN', 'EVENT_MANAGER'), volunteerController.getVolunteerById);

/**
 * @route   POST /api/volunteer
 * @desc    Create new volunteer
 * @access  Private (ADMIN, EVENT_MANAGER)
 */
router.post('/', authorizeRoles('ADMIN', 'EVENT_MANAGER'), volunteerController.createVolunteer);

/**
 * @route   PUT /api/volunteer/:id
 * @desc    Update volunteer
 * @access  Private (ADMIN, EVENT_MANAGER)
 */
router.put('/:id', authorizeRoles('ADMIN', 'EVENT_MANAGER'), volunteerController.updateVolunteer);

/**
 * @route   DELETE /api/volunteer/:id
 * @desc    Delete volunteer (soft delete - mark inactive)
 * @access  Private (ADMIN, EVENT_MANAGER)
 */
router.delete('/:id', authorizeRoles('ADMIN', 'EVENT_MANAGER'), volunteerController.deleteVolunteer);

/**
 * @route   POST /api/volunteer/:id/reset-to-default
 * @desc    Reset volunteer password to default (firstname@eventcode)
 * @access  Private (ADMIN, EVENT_MANAGER)
 */
router.post('/:id/reset-to-default', authorizeRoles('ADMIN', 'EVENT_MANAGER'), volunteerController.resetToDefaultPassword);

/**
 * @note    UNIVERSAL SCANNER: /scan/student handles ALL scenarios
 *          - Original check-in/check-out (legacy single event)
 *          - Multi-event scenarios (automatically validates registration)
 */

export default router;
