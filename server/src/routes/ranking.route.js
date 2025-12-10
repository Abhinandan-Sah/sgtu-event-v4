import express from 'express';
const router = express.Router();
import rankingController from '../controllers/ranking.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { checkRankingsPublished } from '../middleware/rankingVisibility.js';

/**
 * Ranking Routes
 * Security: Router-level middleware for DRY principle
 * Mix of public (leaderboards) and protected (submit/manage) routes
 */

// ============================================================
// PUBLIC ROUTES (Controlled visibility based on event status)
// ============================================================

/**
 * @route   GET /api/ranking/:eventId/stalls/top/:limit
 * @desc    Get top N stalls leaderboard for event
 * @access  Public (if rankings published or event completed)
 * @note    Visibility controlled by checkRankingsPublished middleware
 */
router.get('/:eventId/stalls/top/:limit', checkRankingsPublished, rankingController.getTopRankings);

/**
 * @route   GET /api/ranking/:eventId/students/top/:limit
 * @desc    Get top N students leaderboard for event
 * @access  Public (if rankings published or event completed)
 * @note    Visibility controlled by checkRankingsPublished middleware
 */
router.get('/:eventId/students/top/:limit', checkRankingsPublished, rankingController.getTopStudents);

/**
 * @route   GET /api/ranking/:eventId/schools/top/:limit
 * @desc    Get top N schools leaderboard for event (school competition)
 * @access  Public (if rankings published or event completed)
 * @note    Visibility controlled by checkRankingsPublished middleware
 */
router.get('/:eventId/schools/top/:limit', checkRankingsPublished, rankingController.getTopSchools);

// ============================================================
// STUDENT ROUTES (Submit and view rankings)
// ============================================================

// 🔒 Apply authentication to all routes below
router.use(authenticateToken);

/**
 * @route   POST /api/ranking
 * @desc    Student submits top 3 stall rankings
 * @access  Private (STUDENT)
 */
router.post('/', authorizeRoles('STUDENT'), rankingController.createRanking);

/**
 * @route   GET /api/ranking/:eventId/my-ranking
 * @desc    Get student's own submitted ranking for event
 * @access  Private (STUDENT)
 */
router.get('/:eventId/my-ranking', authorizeRoles('STUDENT'), rankingController.getMyRanking);

// ============================================================
// EVENT MANAGER + ADMIN ROUTES (View and manage rankings)
// ============================================================

/**
 * @route   GET /api/ranking/:eventId
 * @desc    Get all rankings for specific event (admin view)
 * @access  Private (EVENT_MANAGER, ADMIN)
 */
router.get('/:eventId', authorizeRoles('EVENT_MANAGER', 'ADMIN'), rankingController.getAllRankings);

/**
 * @route   GET /api/ranking/:eventId/stall/:stallId
 * @desc    Get rankings for specific stall in event
 * @access  Private (EVENT_MANAGER, ADMIN)
 */
router.get('/:eventId/stall/:stallId', authorizeRoles('EVENT_MANAGER', 'ADMIN'), rankingController.getRankingByStall);

/**
 * @route   POST /api/ranking/:eventId/calculate
 * @desc    Recalculate and update stall rankings for event (cache refresh)
 * @access  Private (EVENT_MANAGER, ADMIN)
 */
router.post('/:eventId/calculate', authorizeRoles('EVENT_MANAGER', 'ADMIN'), rankingController.calculateRankings);

// ============================================================
// ADMIN ONLY ROUTES (Direct database edits)
// ============================================================

/**
 * @route   PUT /api/ranking/:id
 * @desc    Update ranking by ID (emergency edits only)
 * @access  Private (ADMIN)
 */
router.put('/:id', authorizeRoles('ADMIN'), rankingController.updateRanking);

/**
 * @route   DELETE /api/ranking/:id
 * @desc    Delete ranking by ID (fraud/invalid data removal)
 * @access  Private (ADMIN)
 */
router.delete('/:id', authorizeRoles('ADMIN'), rankingController.deleteRanking);

export default router;
