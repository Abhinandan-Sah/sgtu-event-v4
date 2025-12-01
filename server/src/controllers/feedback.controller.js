import Feedback from '../models/Feedback.model.js';
import Student from '../models/Student.model.js';
import Stall from '../models/Stall.model.js';
import { successResponse, errorResponse } from '../helpers/response.js';

/**
 * Feedback Controller
 * Handles feedback submission and retrieval
 */

/**
 * Submit feedback for a stall
 * @route POST /api/feedback
 */
const submitFeedback = async (req, res, next) => {
  try {
    const { stall_id, rating, comments } = req.body;

    if (!stall_id || !rating) {
      return errorResponse(res, 'Stall ID and rating are required', 400);
    }

    if (rating < 1 || rating > 5) {
      return errorResponse(res, 'Rating must be between 1 and 5', 400);
    }

    // Verify stall exists
    const stall = await Stall.findById(stall_id);
    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    // Check if student already submitted feedback for this stall
    const existingFeedback = await Feedback.findByStudentAndStall(req.user.id, stall_id);
    if (existingFeedback) {
      return errorResponse(res, 'Feedback already submitted for this stall', 409);
    }

    const feedbackData = {
      student_id: req.user.id,
      stall_id,
      rating,
      comments: comments || null
    };

    const newFeedback = await Feedback.create(feedbackData);

    return successResponse(res, {
      feedback_id: newFeedback.id,
      stall_name: stall.stall_name,
      rating: newFeedback.rating,
      submitted_at: newFeedback.created_at
    }, 'Feedback submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all feedback for a stall
 * @route GET /api/feedback/stall/:stallId
 */
const getFeedbackByStall = async (req, res, next) => {
  try {
    const { stallId } = req.params;
    const feedback = await Feedback.findByStallId(stallId);
    
    return successResponse(res, feedback);
  } catch (error) {
    next(error);
  }
};

/**
 * Get feedback submitted by a student
 * @route GET /api/feedback/student/:studentId
 */
const getFeedbackByStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const feedback = await Feedback.findByStudentId(studentId);
    
    return successResponse(res, feedback);
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's own feedback
 * @route GET /api/feedback/my-feedback
 */
const getMyFeedback = async (req, res, next) => {
  try {
    const feedback = await Feedback.findByStudentId(req.user.id);
    return successResponse(res, feedback);
  } catch (error) {
    next(error);
  }
};

/**
 * Get feedback statistics for a stall
 * @route GET /api/feedback/stall/:stallId/stats
 */
const getStallFeedbackStats = async (req, res, next) => {
  try {
    const { stallId } = req.params;
    
    const stall = await Stall.findById(stallId);
    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    const feedback = await Feedback.findByStallId(stallId);
    
    if (feedback.length === 0) {
      return successResponse(res, {
        stall_name: stall.stall_name,
        total_feedback: 0,
        average_rating: 0,
        rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      });
    }

    const totalRating = feedback.reduce((sum, f) => sum + f.rating, 0);
    const averageRating = (totalRating / feedback.length).toFixed(2);

    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    feedback.forEach(f => {
      ratingBreakdown[f.rating]++;
    });

    return successResponse(res, {
      stall_name: stall.stall_name,
      total_feedback: feedback.length,
      average_rating: parseFloat(averageRating),
      rating_breakdown: ratingBreakdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update feedback
 * @route PUT /api/feedback/:id
 */
const updateFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comments } = req.body;

    // Find feedback
    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return errorResponse(res, 'Feedback not found', 404);
    }

    // Verify ownership
    if (feedback.student_id !== req.user.id) {
      return errorResponse(res, 'Unauthorized to update this feedback', 403);
    }

    const updateData = {};
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return errorResponse(res, 'Rating must be between 1 and 5', 400);
      }
      updateData.rating = rating;
    }
    if (comments !== undefined) {
      updateData.comments = comments;
    }

    const updatedFeedback = await Feedback.update(id, updateData);

    return successResponse(res, updatedFeedback, 'Feedback updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Delete feedback
 * @route DELETE /api/feedback/:id
 */
const deleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find feedback
    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return errorResponse(res, 'Feedback not found', 404);
    }

    // Verify ownership (students can delete their own, admins can delete any)
    if (req.user.role !== 'admin' && feedback.student_id !== req.user.id) {
      return errorResponse(res, 'Unauthorized to delete this feedback', 403);
    }

    await Feedback.delete(id);

    return successResponse(res, null, 'Feedback deleted successfully');
  } catch (error) {
    next(error);
  }
};

export default {
  submitFeedback,
  getFeedbackByStall,
  getFeedbackByStudent,
  getMyFeedback,
  getStallFeedbackStats,
  updateFeedback,
  deleteFeedback
};
