import Student from '../models/Student.model.js';
import CheckInOut from '../models/CheckInOut.model.js';
import Stall from '../models/Stall.model.js';
import Feedback from '../models/Feedback.model.js';
import Ranking from '../models/Ranking.model.js';
import StudentEventRanking from '../models/StudentEventRanking.model.js';
import EventModel from '../models/Event.model.js';
import EventRegistrationModel from '../models/EventRegistration.model.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCodeService from '../services/qrCode.js';
import PaymentService from '../services/payment.js';
import { successResponse, errorResponse } from '../helpers/response.js';
import { setAuthCookie, clearAuthCookie } from '../helpers/cookie.js';
import { query } from '../config/db.js';

/**
 * Student Controller
 * Handles student authentication, profile, and QR code operations
 */

/**
 * Student login
 * @route POST /api/student/login
 */
const login = async (req, res, next) => {
  try {
    const { registration_no, password } = req.body;

    // Registration number and password are required
    if (!registration_no || !password) {
      return errorResponse(res, 'Registration number and password are required', 400);
    }

    // Find student by registration number only
    const student = await Student.findByRegistrationNo(registration_no, query);

    if (!student) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    // Verify password using model method
    const isValidPassword = await student.comparePassword(password);
    if (!isValidPassword) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    // Check if password reset is required (first-time login or admin-forced reset)
    if (student.password_reset_required) {
      return successResponse(res, {
        requires_password_reset: true,
        registration_no: student.registration_no,
        message: 'Please reset your password to continue'
      }, 'Password reset required');
    }

    const token = jwt.sign(
      { 
        id: student.id, 
        registration_no: student.registration_no, 
        role: student.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set secure HTTP-Only cookie
    setAuthCookie(res, token);

    return successResponse(res, {
      token,
      student: {
        id: student.id,
        full_name: student.full_name,
        email: student.email,
        registration_no: student.registration_no,
        school_name: student.school_name,
        phone: student.phone,
        program_name: student.program_name,
        batch: student.batch
      }
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Get student profile
 * @route GET /api/student/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const student = await Student.findById(req.user.id, query);
    if (!student) {
      return errorResponse(res, 'Student not found', 404);
    }

    return successResponse(res, {
      id: student.id,
      full_name: student.full_name,
      email: student.email,
      registration_no: student.registration_no,
      school_name: student.school_name,
      phone: student.phone,
      created_at: student.created_at
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Student logout
 * @route POST /api/student/logout
 */
const logout = async (req, res, next) => {
  try {
    clearAuthCookie(res);
    return successResponse(res, null, 'Logout successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Get student QR code
 * @route GET /api/student/qr-code
 */
const getQRCode = async (req, res, next) => {
  try {
    const student = await Student.findById(req.user.id, query);
    if (!student) {
      return errorResponse(res, 'Student not found', 404);
    }

    // Generate rotating token (JWT string ~140 chars)
    const token = QRCodeService.generateRotatingStudentToken(student);
    
    // Generate rotating QR code image (Base64 PNG)
    const qrCodeImage = await QRCodeService.generateRotatingQRCodeImage(student);

    // Calculate rotation metadata for frontend
    const rotationInfo = {
      expires_in_seconds: QRCodeService.getSecondsUntilRotation(),
      rotation_interval: QRCodeService.ROTATION_INTERVAL_SECONDS,
      grace_period_seconds: QRCodeService.GRACE_PERIOD_WINDOWS * QRCodeService.ROTATION_INTERVAL_SECONDS
    };

    return successResponse(res, {
      qr_code: qrCodeImage,
      qr_code_token: token,
      registration_no: student.registration_no,
      rotation_info: rotationInfo
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student check-in history
 * @route GET /api/student/check-in-history
 */
const getCheckInHistory = async (req, res, next) => {
  try {
    const history = await CheckInOut.findByStudentId(req.user.id, query);
    return successResponse(res, history);
  } catch (error) {
    next(error);
  }
};

/**
 * Update student profile
 * @route PUT /api/student/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const updateData = {};

    if (email) {
      updateData.email = email;
    }

    if (password) {
      const salt = await bcrypt.genSalt(12);
      updateData.password_hash = await bcrypt.hash(password, salt);
    }

    const updatedStudent = await Student.update(req.user.id, updateData, query);
    if (!updatedStudent) {
      return errorResponse(res, 'Student not found', 404);
    }

    return successResponse(res, {
      id: updatedStudent.id,
      full_name: updatedStudent.full_name,
      email: updatedStudent.email,
      registration_no: updatedStudent.registration_no,
      school_name: updatedStudent.school_name
    }, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Scan stall QR code (Student self-service)
 * @route POST /api/student/scan-stall
 */
const scanStall = async (req, res, next) => {
  try {
    const { stall_qr_token } = req.body;

    if (!stall_qr_token) {
      return errorResponse(res, 'Stall QR code is required', 400);
    }

    // Verify stall QR code
    const stallDecoded = QRCodeService.verifyStallQRToken(stall_qr_token);
    if (!stallDecoded || !stallDecoded.valid) {
      return errorResponse(res, 'Invalid stall QR code', 400);
    }

    // Find stall by QR token
    const stall = await Stall.findByQRToken(stall_qr_token, query);
    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    // Check if student is inside event
    const student = await Student.findById(req.user.id, query);
    
    
    if (!student) {
      return errorResponse(res, 'Student not found. Please login again.', 404);
    }
    
    if (!student.is_inside_event) {
      return errorResponse(res, 'You must be checked in at the event to scan stalls', 403);
    }

    // Get current event from active check-in
    const activeCheckInResult = await query(
      `SELECT event_id FROM check_in_outs 
       WHERE student_id = $1 AND scan_type = 'CHECKIN' 
       ORDER BY scanned_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (!activeCheckInResult || activeCheckInResult.length === 0) {
      return errorResponse(res, 'No active check-in found. Please check in first.', 403);
    }

    const currentEventId = activeCheckInResult[0].event_id;

    // Validate stall belongs to current event
    if (stall.event_id !== currentEventId) {
      return errorResponse(res, 'This stall does not belong to your current checked-in event', 403);
    }

    // Check if student already gave feedback to this stall in this event
    const existingFeedbackQuery = await query(
      `SELECT * FROM feedbacks WHERE student_id = $1 AND stall_id = $2 AND event_id = $3`,
      [req.user.id, stall.id, currentEventId]
    );
    const existingFeedback = existingFeedbackQuery.length > 0 ? existingFeedbackQuery[0] : null;
    
    return successResponse(res, {
      stall: {
        id: stall.id,
        stall_number: stall.stall_number,
        stall_name: stall.stall_name,
        school_name: stall.school_name,
        description: stall.description,
        location: stall.location
      },
      already_reviewed: !!existingFeedback,
      existing_feedback: existingFeedback ? {
        rating: existingFeedback.rating,
        comment: existingFeedback.comment,
        submitted_at: existingFeedback.submitted_at
      } : null
    }, 'Stall scanned successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Submit feedback for a stall
 * @route POST /api/student/submit-feedback
 */
const submitFeedback = async (req, res, next) => {
  try {
    const { stall_id, rating, comment } = req.body;

    // Validation
    if (!stall_id || !rating) {
      return errorResponse(res, 'Stall ID and rating are required', 400);
    }

    if (rating < 1 || rating > 5) {
      return errorResponse(res, 'Rating must be between 1 and 5', 400);
    }

    // Check if student is inside event
    const student = await Student.findById(req.user.id, query);
    
    // console.log(' [SUBMIT-FEEDBACK] JWT user ID:', req.user.id);
    // console.log('[SUBMIT-FEEDBACK] JWT user data:', req.user);
    // console.log('[SUBMIT-FEEDBACK] Student found:', student ? student.full_name : 'NULL');
    
    if (!student) {
      return errorResponse(res, 'Student not found. Please login again.', 404);
    }
    
    if (!student.is_inside_event) {
      return errorResponse(res, 'You must be checked in at the event to submit feedback', 403);
    }

    // Get current event from active check-in
    const activeCheckInResult = await query(
      `SELECT event_id FROM check_in_outs 
       WHERE student_id = $1 AND scan_type = 'CHECKIN' 
       ORDER BY scanned_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (!activeCheckInResult || activeCheckInResult.length === 0) {
      return errorResponse(res, 'No active check-in found. Please check in first.', 403);
    }

    const currentEventId = activeCheckInResult[0].event_id;

    // Get stall count for current event (dynamic limit)
    const stallCount = await Stall.countByEvent(currentEventId, query);

    // Check feedback limit (max = number of stalls in current event)
    const feedbackCount = await Feedback.countByStudentAndEvent(req.user.id, currentEventId, query);
    if (feedbackCount >= stallCount) {
      return errorResponse(
        res, 
        `You have reached the maximum feedback limit for this event (${stallCount} stalls)`, 
        403
      );
    }

    // Check if stall exists
    const stall = await Stall.findById(stall_id, query);
    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    // Validate stall belongs to current event
    if (stall.event_id !== currentEventId) {
      return errorResponse(res, 'This stall does not belong to your current checked-in event', 403);
    }

    // Check if already gave feedback to this stall
    const existingFeedback = await Feedback.findByStudentAndStall(req.user.id, stall_id, query);
    if (existingFeedback) {
      return errorResponse(res, 'You have already submitted feedback for this stall', 409);
    }

    // Create feedback with event_id
    const feedback = await Feedback.create({
      student_id: req.user.id,
      stall_id: stall_id,
      rating: rating,
      comment: comment || null,
      event_id: currentEventId
    }, query);

    // Increment student's feedback count
    await Student.incrementFeedbackCount(req.user.id, query);

    // Increment stall's feedback count
    await query(
      'UPDATE stalls SET total_feedback_count = total_feedback_count + 1 WHERE id = $1',
      [stall_id]
    );

    return successResponse(res, {
      feedback: {
        id: feedback.id,
        stall_name: stall.stall_name,
        stall_number: stall.stall_number,
        rating: feedback.rating,
        comment: feedback.comment,
        submitted_at: feedback.submitted_at
      },
      event_stats: {
        total_stalls_in_event: stallCount,
        feedbacks_given_in_event: feedbackCount + 1,
        remaining_feedbacks_in_event: stallCount - (feedbackCount + 1)
      }
    }, 'Feedback submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's stall visits and feedback history
 * @route GET /api/student/my-visits
 */
const getMyVisits = async (req, res, next) => {
  try {
    const feedbacks = await Feedback.findByStudent(req.user.id, query);
    
    const feedbackCount = feedbacks.length;

    // Get current event stats if checked in
    let currentEventStats = null;
    const activeCheckInResult = await query(
      `SELECT event_id FROM check_in_outs 
       WHERE student_id = $1 AND scan_type = 'CHECKIN' 
       ORDER BY scanned_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (activeCheckInResult && activeCheckInResult.length > 0) {
      const currentEventId = activeCheckInResult[0].event_id;
      const stallCount = await Stall.countByEvent(currentEventId, query);
      const eventFeedbackCount = await Feedback.countByStudentAndEvent(req.user.id, currentEventId, query);
      
      // Get event details
      const eventResult = await query(
        'SELECT id, event_name, event_code FROM events WHERE id = $1',
        [currentEventId]
      );

      currentEventStats = {
        event_id: currentEventId,
        event_name: eventResult[0]?.event_name || null,
        event_code: eventResult[0]?.event_code || null,
        total_stalls: stallCount,
        feedbacks_given: eventFeedbackCount,
        feedbacks_remaining: stallCount - eventFeedbackCount
      };
    }

    return successResponse(res, {
      total_visits: feedbackCount,
      current_event_stats: currentEventStats,
      visits: feedbacks.map(f => ({
        stall_id: f.stall_id,
        stall_number: f.stall_number,
        stall_name: f.stall_name,
        school_name: f.school_name,
        rating: f.rating,
        comment: f.comment,
        visited_at: f.submitted_at,
        event_id: f.event_id
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's school stalls for ranking (Category 2)
 * @route GET /api/student/my-school-stalls
 */
const getMySchoolStalls = async (req, res, next) => {
  try {
    const student = await Student.findById(req.user.id, query);
    
    if (!student) {
      return errorResponse(res, 'Student not found', 404);
    }

    // Get current event from active check-in
    const activeCheckInResult = await query(
      `SELECT event_id FROM check_in_outs 
       WHERE student_id = $1 AND scan_type = 'CHECKIN' 
       ORDER BY scanned_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (!activeCheckInResult || activeCheckInResult.length === 0) {
      return errorResponse(res, 'You must be checked in to view school stalls', 403);
    }

    const currentEventId = activeCheckInResult[0].event_id;

    // Check if student has already completed ranking for THIS event
    const rankingCompletionCheck = await query(
      `SELECT has_completed_ranking FROM student_event_rankings 
       WHERE student_id = $1 AND event_id = $2`,
      [req.user.id, currentEventId]
    );

    if (rankingCompletionCheck.length > 0 && rankingCompletionCheck[0].has_completed_ranking) {
      return errorResponse(res, 'You have already submitted your school stall rankings for this event', 409);
    }

    // Get ONLY school stalls where student gave feedback
    const queryText = `
      SELECT 
        st.id as stall_id,
        st.stall_number,
        st.stall_name,
        st.description,
        st.location,
        sc.school_name,
        f.rating as my_rating,
        f.comment as my_comment,
        f.submitted_at as feedback_submitted_at
      FROM stalls st
      INNER JOIN schools sc ON st.school_id = sc.id
      INNER JOIN feedbacks f ON st.id = f.stall_id 
        AND f.student_id = $1 
        AND f.event_id = $2
      WHERE st.school_id = $3 
        AND st.event_id = $2 
        AND st.is_active = true
      ORDER BY st.stall_number ASC
    `;

    const stalls = await query(queryText, [req.user.id, currentEventId, student.school_id]);

    // Require minimum 3 feedbacks to enable ranking
    if (stalls.length < 3) {
      return errorResponse(
        res, 
        `You need to submit feedback to at least 3 stalls from your school. Currently: ${stalls.length}/3. Please give feedback first.`, 
        400
      );
    }

    return successResponse(res, {
      student_info: {
        id: student.id,
        registration_no: student.registration_no,
        full_name: student.full_name,
        school_name: student.school_name
      },
      stalls: stalls.map(s => ({
        stall_id: s.stall_id,
        stall_number: s.stall_number,
        stall_name: s.stall_name,
        description: s.description,
        location: s.location,
        my_feedback: {
          rating: s.my_rating,
          comment: s.my_comment,
          submitted_at: s.feedback_submitted_at
        }
      })),
      total_stalls_with_feedback: stalls.length,
      instructions: 'Select top 3 stalls from YOUR SCHOOL that you have already reviewed. Ranks: 1 (best), 2 (second), 3 (third). ONE-TIME submission.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit school stall rankings (Category 2 - ONE-TIME only)
 * @route POST /api/student/submit-school-ranking
 */
const submitSchoolRanking = async (req, res, next) => {
  try {
    const { rankings } = req.body; // [{ stall_id, rank }]

    if (!Array.isArray(rankings) || rankings.length !== 3) {
      return errorResponse(res, 'Must provide exactly 3 stall rankings', 400);
    }

    const ranks = rankings.map(r => r.rank).sort();
    if (ranks.join(',') !== '1,2,3') {
      return errorResponse(res, 'Rankings must be exactly 1, 2, and 3 (no duplicates)', 400);
    }

    const stallIds = rankings.map(r => r.stall_id);
    if (new Set(stallIds).size !== 3) {
      return errorResponse(res, 'Must rank 3 different stalls', 400);
    }

    const student = await Student.findById(req.user.id, query);
    
    if (!student) {
      return errorResponse(res, 'Student not found', 404);
    }

    // Get current event from active check-in
    const activeCheckInResult = await query(
      `SELECT event_id FROM check_in_outs 
       WHERE student_id = $1 AND scan_type = 'CHECKIN' 
       ORDER BY scanned_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (!activeCheckInResult || activeCheckInResult.length === 0) {
      return errorResponse(res, 'You must be checked in to submit rankings', 403);
    }

    const currentEventId = activeCheckInResult[0].event_id;

    // Check if student has already completed ranking for THIS event
    const rankingCompletionCheck = await query(
      `SELECT has_completed_ranking FROM student_event_rankings 
       WHERE student_id = $1 AND event_id = $2`,
      [req.user.id, currentEventId]
    );

    if (rankingCompletionCheck.length > 0 && rankingCompletionCheck[0].has_completed_ranking) {
      return errorResponse(res, 'You have already submitted your rankings for this event. This is ONE-TIME per event.', 409);
    }

    // Verify stalls belong to school, event, AND student gave feedback
    const stallValidationQuery = `
      SELECT 
        st.id, 
        st.stall_name, 
        st.school_id, 
        st.event_id,
        f.id as feedback_id,
        f.rating as feedback_rating
      FROM stalls st
      LEFT JOIN feedbacks f ON st.id = f.stall_id 
        AND f.student_id = $1 
        AND f.event_id = $2
      WHERE st.id = ANY($3::uuid[])
    `;
    
    const stallsToRank = await query(stallValidationQuery, [req.user.id, currentEventId, stallIds]);

    if (stallsToRank.length !== 3) {
      return errorResponse(res, 'One or more stalls not found', 404);
    }

    // Check feedback exists for all ranked stalls
    const stallsWithoutFeedback = stallsToRank.filter(s => !s.feedback_id);
    if (stallsWithoutFeedback.length > 0) {
      return errorResponse(
        res, 
        `You can only rank stalls you have already given feedback to. Missing feedback for: ${stallsWithoutFeedback.map(s => s.stall_name).join(', ')}`, 
        403
      );
    }

    const invalidStalls = stallsToRank.filter(s => s.school_id !== student.school_id);
    if (invalidStalls.length > 0) {
      return errorResponse(res, `You can only rank stalls from YOUR school. Invalid: ${invalidStalls.map(s => s.stall_name).join(', ')}`, 403);
    }

    // Verify all stalls belong to current event
    const wrongEventStalls = stallsToRank.filter(s => s.event_id !== currentEventId);
    if (wrongEventStalls.length > 0) {
      return errorResponse(res, `All stalls must be from your current event. Invalid: ${wrongEventStalls.map(s => s.stall_name).join(', ')}`, 403);
    }

    try {
      await query('BEGIN');

      const rankingData = rankings.map(r => ({
        student_id: req.user.id,
        stall_id: r.stall_id,
        rank: r.rank,
        event_id: currentEventId
      }));

      await Ranking.bulkCreate(rankingData, query);

      // Record per-event ranking completion
      await query(
        `INSERT INTO student_event_rankings (student_id, event_id, has_completed_ranking, completed_at)
         VALUES ($1, $2, true, NOW())
         ON CONFLICT (student_id, event_id) 
         DO UPDATE SET has_completed_ranking = true, completed_at = NOW()`,
        [req.user.id, currentEventId]
      );

      // Update global flag and category if first time ranking
      await query(
        `UPDATE students 
         SET has_completed_ranking = true,
             selected_category = 'CATEGORY_2',
             updated_at = NOW()
         WHERE id = $1 AND has_completed_ranking = false`,
        [req.user.id]
      );

      for (const ranking of rankings) {
        const columnName = ranking.rank === 1 ? 'rank_1_votes' 
                         : ranking.rank === 2 ? 'rank_2_votes' 
                         : 'rank_3_votes';
        
        await query(
          `UPDATE stalls 
           SET ${columnName} = ${columnName} + 1,
               weighted_score = (rank_1_votes * 5) + (rank_2_votes * 3) + (rank_3_votes * 1),
               updated_at = NOW()
           WHERE id = $1`,
          [ranking.stall_id]
        );
      }

      await query('COMMIT');

      const rankedStallsQuery = `
        SELECT r.rank, st.stall_name, st.stall_number
        FROM rankings r
        LEFT JOIN stalls st ON r.stall_id = st.id
        WHERE r.student_id = $1 AND r.event_id = $2
        ORDER BY r.rank ASC
      `;
      
      const rankedStalls = await query(rankedStallsQuery, [req.user.id, currentEventId]);

      return successResponse(res, {
        message: '🎉 Rankings submitted successfully!',
        submitted_rankings: rankedStalls.map(r => ({
          rank: r.rank,
          stall_name: r.stall_name,
          stall_number: r.stall_number
        })),
        note: 'Your rankings are recorded and cannot be changed.'
      }, 'School rankings submitted', 201);

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    next(error);
  }
};

/**
 * Get student's submitted school ranking (view only)
 * @route GET /api/student/my-school-ranking
 */
const getMySchoolRanking = async (req, res, next) => {
  try {
    const student = await Student.findById(req.user.id, query);
    
    if (!student) {
      return errorResponse(res, 'Student not found', 404);
    }

    // Get current event from active check-in
    const activeCheckInResult = await query(
      `SELECT event_id FROM check_in_outs 
       WHERE student_id = $1 AND scan_type = 'CHECKIN' 
       ORDER BY scanned_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (!activeCheckInResult || activeCheckInResult.length === 0) {
      return errorResponse(res, 'You must be checked in to view your rankings', 403);
    }

    const currentEventId = activeCheckInResult[0].event_id;

    // Check if student has completed ranking for THIS event
    const rankingCompletionCheck = await query(
      `SELECT has_completed_ranking FROM student_event_rankings 
       WHERE student_id = $1 AND event_id = $2`,
      [req.user.id, currentEventId]
    );

    if (rankingCompletionCheck.length === 0 || !rankingCompletionCheck[0].has_completed_ranking) {
      return errorResponse(res, 'No rankings submitted for this event yet', 404);
    }

    const queryText = `
      SELECT 
        r.rank,
        r.submitted_at,
        st.stall_name,
        st.stall_number,
        st.description
      FROM rankings r
      LEFT JOIN stalls st ON r.stall_id = st.id
      WHERE r.student_id = $1 AND r.event_id = $2
      ORDER BY r.rank ASC
    `;

    const rankings = await query(queryText, [req.user.id, currentEventId]);

    return successResponse(res, {
      rankings: rankings.map(r => ({
        rank: r.rank,
        stall_name: r.stall_name,
        stall_number: r.stall_number,
        description: r.description
      })),
      submitted_at: rankings[0].submitted_at,
      note: 'This ranking was ONE-TIME and cannot be changed.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify reset credentials - Step 1 of password reset
 * Validates DOB and pincode before allowing password reset
 * @route POST /api/student/verify-reset-credentials
 */
const verifyResetCredentials = async (req, res, next) => {
  try {
    const { registration_no, date_of_birth, pincode } = req.body;

    // Validate required fields
    if (!registration_no || !date_of_birth || !pincode) {
      return errorResponse(res, 'Registration number, date of birth, and pincode are required', 400);
    }

    // Validate pincode format using model validation method
    if (!Student.isValidPincode(pincode)) {
      return errorResponse(res, 'Pincode must be exactly 6 digits', 400);
    }

    // Validate date of birth format and age using model validation method
    if (!Student.isValidDateOfBirth(date_of_birth)) {
      return errorResponse(res, 'Invalid date of birth format or age requirement not met', 400);
    }

    // Verify credentials match
    const student = await Student.verifyResetCredentials(
      registration_no,
      date_of_birth,
      pincode,
      query
    );

    if (!student) {
      return errorResponse(res, 'Invalid credentials. Please check your details.', 401);
    }

    // Generate temporary reset token (valid for 10 minutes)
    const resetToken = jwt.sign(
      { 
        id: student.id, 
        registration_no: student.registration_no,
        purpose: 'password_reset' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    return successResponse(res, {
      reset_token: resetToken,
      registration_no: student.registration_no,
      full_name: student.full_name,
      expires_in: '10 minutes'
    }, 'Credentials verified successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password - Step 2 of password reset
 * Updates password using the reset token
 * @route POST /api/student/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const { reset_token, new_password, confirm_password } = req.body;

    // Validate required fields
    if (!reset_token || !new_password || !confirm_password) {
      return errorResponse(res, 'Reset token and passwords are required', 400);
    }

    // Validate passwords match
    if (new_password !== confirm_password) {
      return errorResponse(res, 'Passwords do not match', 400);
    }

    // Validate password strength using model validation method
    if (!Student.isValidPassword(new_password)) {
      return errorResponse(res, 'Password must be at least 8 characters with at least one letter and one number', 400);
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(reset_token, process.env.JWT_SECRET);
      
      if (decoded.purpose !== 'password_reset') {
        return errorResponse(res, 'Invalid reset token', 401);
      }
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return errorResponse(res, 'Reset token has expired. Please verify credentials again.', 401);
      }
      return errorResponse(res, 'Invalid reset token', 401);
    }

    // Reset password
    const updatedStudent = await Student.resetPassword(decoded.id, new_password, query);

    if (!updatedStudent) {
      return errorResponse(res, 'Failed to reset password', 500);
    }

    // Generate new auth token
    const authToken = jwt.sign(
      { 
        id: updatedStudent.id, 
        registration_no: updatedStudent.registration_no, 
        email: updatedStudent.email,
        role: updatedStudent.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set secure HTTP-Only cookie
    setAuthCookie(res, authToken);

    return successResponse(res, {
      token: authToken,
      student: {
        id: updatedStudent.id,
        full_name: updatedStudent.full_name,
        registration_no: updatedStudent.registration_no,
        email: updatedStudent.email
      }
    }, 'Password reset successful. You are now logged in.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get available events (free and paid)
 * @route GET /api/student/events
 */
const getAvailableEvents = async (req, res, next) => {
  try {
    const { event_type, event_category, search, page, limit, exclude_registered } = req.query;
    const studentId = req.user.id; // Get logged-in student ID

    const result = await EventModel.getVisibleEvents({
      event_type,
      event_category,
      search,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      upcoming_only: true
    });

    // Add registration status for each event
    const eventsWithRegistration = await Promise.all(
      result.data.map(async (event) => {
        const registration = await EventRegistrationModel.getByStudentAndEvent(
          event.id,
          studentId
        );
        
        return {
          ...event,
          is_registered: !!registration,
          registration_status: registration ? registration.registration_status : null,
          payment_status: registration ? registration.payment_status : null
        };
      })
    );

    // Filter out registered events if requested
    const filteredEvents = exclude_registered === 'true' 
      ? eventsWithRegistration.filter(e => !e.is_registered)
      : eventsWithRegistration;

    return successResponse(res, {
      data: filteredEvents,
      pagination: result.pagination
    }, 'Events retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get single event details
 * @route GET /api/student/events/:eventId
 */
const getEventDetails = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const studentId = req.user.id;

    const event = await EventModel.findById(eventId);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Check if student is already registered
    const registration = await EventRegistrationModel.findByEventAndStudent(
      eventId,
      studentId
    );

    // Check registration status
    const registrationStatus = await EventModel.isRegistrationOpen(eventId);

    return successResponse(res, {
      event,
      is_registered: !!registration,
      registration: registration || null,
      registration_open: registrationStatus.open,
      registration_message: registrationStatus.reason || 'Registration is open'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Register for free event
 * @route POST /api/student/events/:eventId/register
 */
const registerForFreeEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const studentId = req.user.id;

    // Get event details
    const event = await EventModel.findById(eventId);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Check if event is free
    if (event.event_type !== 'FREE') {
      return errorResponse(res, 'This is a paid event. Use payment endpoint.', 400);
    }

    // Check registration status
    const registrationStatus = await EventModel.isRegistrationOpen(eventId);
    if (!registrationStatus.open) {
      return errorResponse(res, registrationStatus.reason, 400);
    }

    // Check if already registered
    const existing = await EventRegistrationModel.findByEventAndStudent(
      eventId,
      studentId
    );
    if (existing) {
      return errorResponse(res, 'You are already registered for this event', 400);
    }

    // ✅ CRITICAL: Check event capacity before registration
    if (event.max_capacity && event.current_registrations >= event.max_capacity) {
      if (event.waitlist_enabled) {
        console.log(`⚠️ [REGISTRATION] Event full, waitlist enabled: ${event.event_name}`);
        return errorResponse(res, 
          `Event is full (${event.max_capacity} capacity reached). Waitlist feature coming soon.`, 
          400
        );
      } else {
        console.log(`❌ [REGISTRATION] Event full, no waitlist: ${event.event_name}`);
        return errorResponse(res, 
          `Event is full. Registration closed. Capacity: ${event.max_capacity}`, 
          400
        );
      }
    }

    console.log(`✅ [REGISTRATION] Capacity check passed: ${event.current_registrations}/${event.max_capacity || 'unlimited'}`);

    // Create registration
    const registration = await EventRegistrationModel.createFreeRegistration(
      eventId,
      studentId
    );

    return successResponse(
      res,
      { registration },
      'Successfully registered for the event',
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate payment for paid event
 * @route POST /api/student/events/:eventId/payment/initiate
 */
const initiatePaidEventPayment = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const studentId = req.user.id;

    // Get event details
    const event = await EventModel.findById(eventId);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Check if event is paid
    if (event.event_type !== 'PAID') {
      return errorResponse(res, 'This is a free event. Use free registration endpoint.', 400);
    }

    // Check registration status
    const registrationStatus = await EventModel.isRegistrationOpen(eventId);
    if (!registrationStatus.open) {
      return errorResponse(res, registrationStatus.reason, 400);
    }

    // Check if already registered
    const existing = await EventRegistrationModel.findByEventAndStudent(
      eventId,
      studentId
    );
    if (existing && existing.payment_status === 'COMPLETED') {
      return errorResponse(res, 'You are already registered for this event', 400);
    }

    // ✅ CRITICAL: Check event capacity before payment initiation
    if (event.max_capacity && event.current_registrations >= event.max_capacity) {
      if (event.waitlist_enabled) {
        console.log(`⚠️ [PAYMENT] Event full, waitlist enabled: ${event.event_name}`);
        return errorResponse(res, 
          `Event is full (${event.max_capacity} capacity reached). Waitlist feature coming soon.`, 
          400
        );
      } else {
        console.log(`❌ [PAYMENT] Event full, no waitlist: ${event.event_name}`);
        return errorResponse(res, 
          `Event is full. Registration closed. Capacity: ${event.max_capacity}`, 
          400
        );
      }
    }

    console.log(`✅ [PAYMENT] Capacity check passed: ${event.current_registrations}/${event.max_capacity || 'unlimited'}`);

    // Get student details
    const student = await Student.findById(studentId, query);

    // Create Razorpay order
    const order = await PaymentService.createOrder({
      amount: event.price,
      currency: event.currency,
      event_id: eventId,
      student_id: studentId,
      event_code: event.event_code
    });

    // Create or update registration record
    let registration;
    if (existing && existing.payment_status === 'PENDING') {
      // Update existing pending registration
      registration = await EventRegistrationModel.completePayment(existing.id, {
        razorpay_payment_id: null,
        razorpay_signature: null
      });
    } else {
      // Create new registration
      registration = await EventRegistrationModel.createPaidRegistration(
        eventId,
        studentId,
        {
          amount: event.price,
          currency: event.currency,
          razorpay_order_id: order.order_id
        }
      );
    }

    return successResponse(
      res,
      {
        order,
        registration_id: registration.id,
        razorpay_key: PaymentService.getPublicKey(),
        student: {
          name: student.full_name,
          email: student.email,
          contact: student.phone
        },
        event: {
          name: event.event_name,
          code: event.event_code
        }
      },
      'Payment order created successfully',
      201
    );
  } catch (error) {
    console.error('Payment initiation error:', error);
    next(error);
  }
};

/**
 * Verify payment and complete registration
 * @route POST /api/student/events/:eventId/payment/verify
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const studentId = req.user.id;

    // Validate inputs
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return errorResponse(res, 'Invalid payment data', 400);
    }

    // Verify signature (skip in development with mock signatures)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isMockSignature = razorpay_signature.includes('mock') || razorpay_signature.includes('test');
    
    let isValid = false;
    if (isDevelopment && isMockSignature) {
      console.log('⚠️  [DEV MODE] Accepting mock signature for testing');
      isValid = true;
    } else {
      isValid = PaymentService.verifyPaymentSignature({
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        signature: razorpay_signature
      });
    }

    if (!isValid) {
      return errorResponse(res, 'Payment verification failed. Invalid signature.', 400);
    }

    // Find registration by order ID
    const registration = await EventRegistrationModel.findByOrderId(razorpay_order_id);
    if (!registration) {
      return errorResponse(res, 'Registration not found', 404);
    }

    // Verify ownership
    if (registration.student_id !== studentId) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Complete payment
    const updated = await EventRegistrationModel.completePayment(registration.id, {
      razorpay_payment_id,
      razorpay_signature
    });

    return successResponse(
      res,
      { registration: updated },
      'Payment verified successfully. You are now registered for the event!'
    );
  } catch (error) {
    console.error('Payment verification error:', error);
    next(error);
  }
};

/**
 * Get student's registered events
 * @route GET /api/student/my-events
 */
const getMyRegisteredEvents = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { status, payment_status } = req.query;

    const registrations = await EventRegistrationModel.getStudentRegistrations(
      studentId,
      { status, payment_status }
    );

    return successResponse(res, { registrations });
  } catch (error) {
    next(error);
  }
};

/**
 * Get universal student QR code (works for ALL registered events)
 * @route GET /api/student/qr-code
 * 
 * UNIVERSAL QR CODE DESIGN:
 * - One rotating QR per student (based on registration_no)
 * - Works for ANY event student is registered for (free or paid)
 * - Volunteer specifies event during scanning (route parameter)
 * - Backend validates student registration for that specific event
 * - Simpler UX: Student shows ONE QR for all events
 */
const getEventQRCode = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // Get student details
    const student = await Student.findById(studentId, query);

    if (!student) {
      return errorResponse(res, 'Student not found', 404);
    }

    // Generate UNIVERSAL rotating QR code (no event_id needed)
    // This QR works for ALL events the student is registered for
    const qrImage = await QRCodeService.generateRotatingQRCodeImage(student);

    const secondsUntilRotation = QRCodeService.getSecondsUntilRotation();

    return successResponse(res, {
      qr_code: qrImage,
      rotation_info: {
        seconds_until_rotation: secondsUntilRotation,
        rotation_interval_seconds: QRCodeService.ROTATION_INTERVAL_SECONDS,
        grace_period_seconds: QRCodeService.GRACE_PERIOD_WINDOWS * QRCodeService.ROTATION_INTERVAL_SECONDS
      },
      student: {
        registration_no: student.registration_no,
        full_name: student.full_name
      },
      usage: {
        type: 'UNIVERSAL',
        description: 'This QR code works for ALL events you are registered for',
        instructions: 'Show this QR code to volunteers at ANY event check-in'
      }
    }, 'Universal QR code generated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================
 * EVENT-SCOPED METHODS (New - Backward Compatible)
 * ============================================
 */

/**
 * Submit feedback for event-scoped operation
 * @route POST /api/student/events/:eventId/submit-feedback
 * Dynamic limit based on stall count in event
 */
const submitEventFeedback = async (req, res, next) => {
  try {
    const { stall_id, rating, comment } = req.body;
    const { eventId, user, activeCheckIn } = req;

    // Validation
    if (!stall_id || !rating) {
      return errorResponse(res, 'Stall ID and rating are required', 400);
    }

    if (rating < 1 || rating > 5) {
      return errorResponse(res, 'Rating must be between 1 and 5', 400);
    }

    // Get dynamic feedback limit based on stall count in this event
    const stallCount = await Stall.countByEvent(eventId, query);
    if (stallCount === 0) {
      return errorResponse(res, 'No stalls found for this event', 404);
    }

    // Check feedback limit (max = stall count for this event)
    const feedbackCount = await Feedback.countByStudentAndEvent(user.id, eventId, query);
    if (feedbackCount >= stallCount) {
      return errorResponse(
        res, 
        `You have reached the maximum feedback limit for this event (${stallCount} stalls)`, 
        403
      );
    }

    // Check if stall exists and belongs to this event
    const stall = await Stall.findById(stall_id, query);
    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    if (stall.event_id !== eventId) {
      return errorResponse(res, 'This stall does not belong to the specified event', 403);
    }

    // Check if already gave feedback to this stall
    const existingFeedback = await Feedback.findByStudentAndStall(user.id, stall_id, query);
    if (existingFeedback) {
      return errorResponse(res, 'You have already submitted feedback for this stall', 409);
    }

    // Create feedback with event_id
    const feedback = await Feedback.create({
      student_id: user.id,
      stall_id: stall_id,
      rating: rating,
      comment: comment || null,
      event_id: eventId
    }, query);

    // Increment stall's feedback count
    await query(
      `UPDATE stalls 
       SET total_feedback_count = total_feedback_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [stall_id]
    );

    return successResponse(res, {
      feedback,
      event_stats: {
        event_id: eventId,
        your_feedbacks: feedbackCount + 1,
        max_feedbacks: stallCount,
        remaining: stallCount - feedbackCount - 1
      }
    }, 'Feedback submitted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's visits/feedbacks for specific event
 * @route GET /api/student/events/:eventId/my-visits
 */
const getEventVisits = async (req, res, next) => {
  try {
    const { eventId, user } = req;

    // Get all feedbacks for this event
    const feedbacks = await Feedback.getByStudentAndEvent(user.id, eventId, query);

    // Get stall count for this event
    const stallCount = await Stall.countByEvent(eventId, query);

    return successResponse(res, {
      event_id: eventId,
      feedbacks: feedbacks,
      stats: {
        total_feedbacks: feedbacks.length,
        max_allowed: stallCount,
        remaining: stallCount - feedbacks.length
      }
    }, 'Event visits retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Submit school ranking for specific event
 * @route POST /api/student/events/:eventId/submit-school-ranking
 * Per-event ranking completion tracking
 */
const submitEventRanking = async (req, res, next) => {
  try {
    const { rankings } = req.body; // [{ stall_id, rank }]
    const { eventId, user, activeCheckIn } = req;

    if (!Array.isArray(rankings) || rankings.length !== 3) {
      return errorResponse(res, 'Must provide exactly 3 stall rankings', 400);
    }

    const ranks = rankings.map(r => r.rank).sort();
    if (ranks.join(',') !== '1,2,3') {
      return errorResponse(res, 'Rankings must be exactly 1, 2, and 3 (no duplicates)', 400);
    }

    const stallIds = rankings.map(r => r.stall_id);
    if (new Set(stallIds).size !== 3) {
      return errorResponse(res, 'Must rank 3 different stalls', 400);
    }

    const student = await Student.findById(user.id, query);
    if (!student) {
      return errorResponse(res, 'Student not found', 404);
    }

    // Check if already completed ranking for THIS event
    const hasCompleted = await StudentEventRanking.hasCompleted(user.id, eventId, query);
    if (hasCompleted) {
      return errorResponse(res, 'You have already submitted your rankings for this event', 409);
    }

    // Verify ALL stalls belong to student's school AND this event
    const stallCheckQuery = `
      SELECT st.id, st.stall_name, st.school_id, st.event_id, sc.school_name
      FROM stalls st
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE st.id = ANY($1::uuid[])
    `;
    
    const stallsToRank = await query(stallCheckQuery, [stallIds]);

    if (stallsToRank.length !== 3) {
      return errorResponse(res, 'One or more stalls not found', 404);
    }

    // Check event membership
    const wrongEventStalls = stallsToRank.filter(s => s.event_id !== eventId);
    if (wrongEventStalls.length > 0) {
      return errorResponse(
        res, 
        `All stalls must belong to this event. Invalid: ${wrongEventStalls.map(s => s.stall_name).join(', ')}`, 
        403
      );
    }

    // Check school membership
    const invalidStalls = stallsToRank.filter(s => s.school_id !== student.school_id);
    if (invalidStalls.length > 0) {
      return errorResponse(
        res, 
        `You can only rank stalls from YOUR school. Invalid: ${invalidStalls.map(s => s.stall_name).join(', ')}`, 
        403
      );
    }

    try {
      await query('BEGIN');

      const rankingData = rankings.map(r => ({
        student_id: user.id,
        stall_id: r.stall_id,
        rank: r.rank,
        event_id: eventId
      }));

      await Ranking.bulkCreate(rankingData, query);

      // Mark ranking as completed for this event
      await StudentEventRanking.markCompleted(user.id, eventId, query);

      // Update stall vote counts
      for (const ranking of rankings) {
        const columnName = ranking.rank === 1 ? 'rank_1_votes' 
                         : ranking.rank === 2 ? 'rank_2_votes' 
                         : 'rank_3_votes';
        
        await query(
          `UPDATE stalls 
           SET ${columnName} = ${columnName} + 1,
               weighted_score = (rank_1_votes * 3) + (rank_2_votes * 2) + (rank_3_votes * 1),
               updated_at = NOW()
           WHERE id = $1`,
          [ranking.stall_id]
        );
      }

      await query('COMMIT');

      return successResponse(res, {
        rankings: rankingData,
        event_id: eventId,
        message: 'Rankings submitted successfully for this event'
      }, 'School ranking submitted successfully');

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get event-specific statistics for student
 * @route GET /api/student/events/:eventId/stats
 */
const getEventStats = async (req, res, next) => {
  try {
    const { eventId, user } = req;

    // Get student's stats for this event
    const feedbackCount = await Feedback.countByStudentAndEvent(user.id, eventId, query);
    const stallCount = await Stall.countByEvent(eventId, query);
    const hasCompletedRanking = await StudentEventRanking.hasCompleted(user.id, eventId, query);
    const checkInHistory = await CheckInOut.getEventCheckInHistory(user.id, eventId, query);

    return successResponse(res, {
      event_id: eventId,
      feedbacks: {
        submitted: feedbackCount,
        max_allowed: stallCount,
        remaining: stallCount - feedbackCount
      },
      ranking: {
        completed: hasCompletedRanking
      },
      check_ins: {
        total: checkInHistory.length,
        history: checkInHistory
      }
    }, 'Event statistics retrieved successfully');
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  logout,
  getProfile,
  getQRCode,
  getCheckInHistory,
  updateProfile,
  scanStall,
  submitFeedback,
  getMyVisits,
  getMySchoolStalls,
  submitSchoolRanking,
  getMySchoolRanking,
  verifyResetCredentials,
  resetPassword,
  // Event-related methods
  getAvailableEvents,
  getEventDetails,
  registerForFreeEvent,
  initiatePaidEventPayment,
  verifyPayment,
  getMyRegisteredEvents,
  getEventQRCode,
  // Event-scoped methods (NEW)
  submitEventFeedback,
  getEventVisits,
  submitEventRanking,
  getEventStats
};
