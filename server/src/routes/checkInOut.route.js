import express from 'express';
const router = express.Router();
import checkInOutController from '../controllers/checkInOut.controller.js';
import { authenticateToken } from '../middleware/auth.js';

/**
 * CheckInOut Routes
 * All routes require authentication
 */

// Get all records and stats (admin)
router.get('/', authenticateToken, checkInOutController.getAllRecords);
router.get('/stats', authenticateToken, checkInOutController.getStats);
router.get('/active', authenticateToken, checkInOutController.getActiveCheckIns);

// Get records by ID or entity
router.get('/:id', authenticateToken, checkInOutController.getRecordById);
router.get('/student/:studentId', authenticateToken, checkInOutController.getRecordsByStudent);
router.get('/stall/:stallId', authenticateToken, checkInOutController.getRecordsByStall);
router.get('/volunteer/:volunteerId', authenticateToken, checkInOutController.getRecordsByVolunteer);

// Delete record (admin only)
router.delete('/:id', authenticateToken, checkInOutController.deleteRecord);

export default router;
