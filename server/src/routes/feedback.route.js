import express from 'express';
const router = express.Router();
import feedbackController from '../controllers/feedback.controller.js';
import { authenticateToken } from '../middleware/auth.js';

/**
 * Feedback Routes
 * All routes require authentication
 */

// Submit and manage feedback
router.post('/', authenticateToken, feedbackController.submitFeedback);
router.get('/my-feedback', authenticateToken, feedbackController.getMyFeedback);
router.put('/:id', authenticateToken, feedbackController.updateFeedback);
router.delete('/:id', authenticateToken, feedbackController.deleteFeedback);

// Get feedback by stall or student
router.get('/stall/:stallId', feedbackController.getFeedbackByStall);
router.get('/stall/:stallId/stats', feedbackController.getStallFeedbackStats);
router.get('/student/:studentId', feedbackController.getFeedbackByStudent);

export default router;
