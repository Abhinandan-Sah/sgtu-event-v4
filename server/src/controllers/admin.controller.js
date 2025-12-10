import Admin from '../models/Admin.model.js';
import Student from '../models/Student.model.js';
import Volunteer from '../models/Volunteer.model.js';
import Stall from '../models/Stall.model.js';
import School from '../models/School.model.js';
import CheckInOut from '../models/CheckInOut.model.js';
import EventManagerModel from '../models/EventManager.model.js'; // ✅ Fixed: consistent naming
import EventModel from '../models/Event.model.js'; // ✅ Fixed: consistent naming
import EventRegistration from '../models/EventRegistration.model.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { successResponse, errorResponse } from '../helpers/response.js';
import { setAuthCookie, clearAuthCookie } from '../helpers/cookie.js';
import { pool, query } from '../config/db.js';
import { 
  parseStudentFile, 
  validateStudents, 
  generateStudentTemplate,
  exportStudentsToExcel,
  parseEventRegistrationFile,
  generateEventRegistrationTemplate,
  validateEventRegistrationData
} from '../utils/excelParser.js';
import {
  validateEventEligibility,
  validateAndFetchStudents,
  checkExistingRegistrations,
  checkCapacityLimit,
  checkCumulativeLimit
} from '../services/bulkRegistrationService.js';
import { sanitizeString } from '../middleware/sanitizer.js';

/**
 * Admin Controller
 * Handles admin authentication and management operations
 */

/**
 * Admin login
 * @route POST /api/admin/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 'Email and password are required', 400);
    }

    const admin = await Admin.findByEmail(email, query);
    if (!admin) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    const isValidPassword = await admin.comparePassword(password);
    if (!isValidPassword) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set secure HTTP-Only cookie
    setAuthCookie(res, token);

    return successResponse(res, {
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role
      }
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Get admin profile
 * @route GET /api/admin/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.user.id, query);
    if (!admin) {
      return errorResponse(res, 'Admin not found', 404);
    }

    return successResponse(res, {
      id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
      created_at: admin.created_at
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin logout
 * @route POST /api/admin/logout
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
 * Update admin profile
 * @route PUT /api/admin/profile
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

    const updatedAdmin = await Admin.update(req.user.id, updateData, query);
    if (!updatedAdmin) {
      return errorResponse(res, 'Admin not found', 404);
    }

    return successResponse(res, {
      id: updatedAdmin.id,
      email: updatedAdmin.email,
      full_name: updatedAdmin.full_name
    }, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get all students (admin view)
 * @route GET /api/admin/students
 */
const getAllStudents = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const students = await Student.findAll(limit, offset, query);
    return successResponse(res, students);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all volunteers (admin view)
 * @route GET /api/admin/volunteers
 */
const getAllVolunteers = async (req, res, next) => {
  try {
    const volunteers = await Volunteer.findAllActive(query);
    return successResponse(res, volunteers);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all stalls (admin view)
 * @route GET /api/admin/stalls
 */
const getAllStalls = async (req, res, next) => {
  try {
    const stalls = await Stall.findAll(query);
    return successResponse(res, stalls);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EVENT MANAGER & EVENT APPROVAL OPERATIONS (Multi-Event)
// ============================================================

/**
 * Create a new event manager (Admin only)
 * @route POST /api/admin/event-managers
 */
const createEventManager = async (req, res, next) => {
  try {
    let { full_name, email, password, phone, school_id, organization } = req.body;
    const adminId = req.user.id;

    // Validation - password is optional, school_id is required
    if (!full_name || !email || !phone || !school_id) {
      return errorResponse(res, 'Full name, email, phone, and school_id are required', 400);
    }

    // Sanitize full_name to prevent XSS
    full_name = full_name.trim().replace(/<[^>]*>/g, '');
    if (full_name.length === 0) {
      return errorResponse(res, 'Full name cannot be empty or contain only HTML tags', 400);
    }

    // Validate phone number (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return errorResponse(res, 'Phone number must be exactly 10 digits', 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 'Invalid email format', 400);
    }

    // Validate password strength if provided (optional now)
    if (password && password.trim() !== '') {
      if (password.length < 8) {
        return errorResponse(res, 'Password must be at least 8 characters long', 400);
      }

      // Check password complexity
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
        return errorResponse(
          res,
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
          400
        );
      }
    }

    // Check if email already exists
    const existingManager = await EventManagerModel.findByEmail(email);
    if (existingManager) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // Create event manager using model (will auto-generate password if not provided)
    const eventManager = await EventManagerModel.create({
      full_name,
      email,
      password,
      phone,
      school_id,
      organization
    });

    // Update approval status (pre-approved by admin)
    await query(
      `UPDATE event_managers 
       SET is_approved_by_admin = true, approved_by_admin_id = $1, approved_at = NOW(), is_active = true
       WHERE id = $2`,
      [adminId, eventManager.id]
    );

    // Prepare response
    const responseData = {
      event_manager: {
        id: eventManager.id,
        full_name: eventManager.full_name,
        email: eventManager.email,
        phone: eventManager.phone,
        school_id: eventManager.school_id,
        organization: eventManager.organization,
        is_approved_by_admin: true,
        is_active: true,
        password_reset_required: eventManager.password_reset_required,
        created_at: eventManager.created_at
      }
    };

    // Include generated password in response if auto-generated
    if (eventManager.generated_password) {
      responseData.generated_password = eventManager.generated_password;
    }

    const message = eventManager.generated_password
      ? `Event manager created successfully with default password: ${eventManager.generated_password}`
      : 'Event manager created successfully';

    return successResponse(res, responseData, message, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get details of a specific event manager
 * @route GET /api/admin/event-managers/:id
 */
const getEventManagerDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        em.id,
        em.full_name,
        em.email,
        em.phone,
        em.school_id,
        s.school_name,
        em.is_approved_by_admin,
        em.is_active,
        em.created_at,
        em.approved_at,
        em.total_events_created,
        em.total_events_completed,
        a.full_name as approved_by_name,
        COUNT(e.id) as total_events,
        SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_events
      FROM event_managers em
      LEFT JOIN schools s ON em.school_id = s.id
      LEFT JOIN events e ON em.id = e.created_by_manager_id
      LEFT JOIN admins a ON em.approved_by_admin_id = a.id
      WHERE em.id = $1
      GROUP BY em.id, s.school_name, a.full_name`,
      [id]
    );

    if (result.length === 0) {
      return errorResponse(res, 'Event manager not found', 404);
    }

    return successResponse(res, {
      event_manager: result[0]
    }, 'Event manager details retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Update event manager details
 * @route PUT /api/admin/event-managers/:id
 */
const updateEventManager = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, organization, password } = req.body;

    // Check if manager exists
    const existing = await query(
      'SELECT id FROM event_managers WHERE id = $1',
      [id]
    );
    if (existing.length === 0) {
      return errorResponse(res, 'Event manager not found', 404);
    }

    // Check if new email is already taken by another manager
    if (email) {
      const emailCheck = await query(
        'SELECT id FROM event_managers WHERE email = $1 AND id != $2',
        [email, id]
      );
      if (emailCheck.length > 0) {
        return errorResponse(res, 'Email already in use by another manager', 400);
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (full_name) {
      updates.push(`full_name = $${paramCount++}`);
      values.push(full_name);
    }
    if (email) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (phone) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (organization !== undefined) {
      updates.push(`organization = $${paramCount++}`);
      values.push(organization);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 400);
    }

    values.push(id);
    const result = await query(
      `UPDATE event_managers 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, full_name, email, phone, organization, 
                 is_approved_by_admin, is_active, created_at, approved_at`,
      values
    );

    return successResponse(res, {
      event_manager: result[0]
    }, 'Event manager updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Delete event manager
 * @route DELETE /api/admin/event-managers/:id
 */
const deleteEventManager = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if manager has any active events
    const activeEvents = await query(
      `SELECT COUNT(*) as count 
       FROM events 
       WHERE created_by_manager_id = $1 
         AND status = 'ACTIVE'`,
      [id]
    );

    if (parseInt(activeEvents[0].count) > 0) {
      return errorResponse(
        res,
        'Cannot delete event manager with active events. Please deactivate or reassign events first.',
        400
      );
    }

    // Delete the event manager
    const result = await query(
      'DELETE FROM event_managers WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.length === 0) {
      return errorResponse(res, 'Event manager not found', 404);
    }

    return successResponse(res, {
      deleted_id: id
    }, 'Event manager deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get all event managers
 * @route GET /api/admin/event-managers
 */
const getAllEventManagers = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT 
        em.id,
        em.full_name,
        em.email,
        em.phone,
        em.school_id,
        s.school_name,
        em.is_approved_by_admin,
        em.is_active,
        em.created_at,
        em.approved_at,
        em.total_events_created,
        em.total_events_completed,
        COUNT(e.id) as current_events,
        SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_events,
        a.full_name as approved_by_name
      FROM event_managers em
      LEFT JOIN schools s ON em.school_id = s.id
      LEFT JOIN events e ON em.id = e.created_by_manager_id
      LEFT JOIN admins a ON em.approved_by_admin_id = a.id
      GROUP BY em.id, s.school_name, a.full_name
      ORDER BY em.created_at DESC
    `);

    return successResponse(res, {
      event_managers: result,
      total: result.length
    }, 'Event managers retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EVENT APPROVAL MANAGEMENT
// ============================================================

/**
 * Get all pending event approval requests
 * @route GET /api/admin/events/pending
 */
const getPendingEvents = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT 
        e.id,
        e.event_name,
        e.event_code,
        e.description,
        e.event_type,
        e.price,
        e.currency,
        e.event_category,
        e.venue,
        e.start_date,
        e.end_date,
        e.registration_start_date,
        e.registration_end_date,
        e.max_capacity,
        e.current_registrations,
        e.status,
        e.created_at,
        em.full_name as event_manager_name,
        em.email as event_manager_email,
        em.school_id,
        s.school_name
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
      LEFT JOIN schools s ON em.school_id = s.id
      WHERE e.status = 'PENDING_APPROVAL'
      ORDER BY e.created_at ASC
    `);

    return successResponse(res, {
      pending_events: result,
      total_pending: result.length
    }, 'Pending events retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get all events with optional filters
 * @route GET /api/admin/events?status=ACTIVE&event_type=PAID
 */
const getAllEvents = async (req, res, next) => {
  try {
    const { status, event_type, event_manager_id } = req.query;
    
    let queryText = `
      SELECT 
        e.id,
        e.event_name,
        e.event_code,
        e.description,
        e.event_type,
        e.price,
        e.currency,
        e.event_category,
        e.venue,
        e.start_date,
        e.end_date,
        e.registration_start_date,
        e.registration_end_date,
        e.max_capacity,
        e.current_registrations,
        e.status,
        e.total_registrations,
        e.total_paid_registrations,
        e.total_revenue,
        e.created_at,
        e.admin_approved_at,
        em.full_name as event_manager_name,
        em.school_id,
        s.school_name,
        a.full_name as approved_by_name
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
      LEFT JOIN schools s ON em.school_id = s.id
      LEFT JOIN admins a ON e.approved_by_admin_id = a.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (status) {
      queryText += ` AND e.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (event_type) {
      queryText += ` AND e.event_type = $${paramCount}`;
      params.push(event_type);
      paramCount++;
    }

    if (event_manager_id) {
      queryText += ` AND e.created_by_manager_id = $${paramCount}`;
      params.push(event_manager_id);
      paramCount++;
    }

    queryText += ' ORDER BY e.start_date DESC, e.created_at DESC';

    const result = await query(queryText, params);

    return successResponse(res, {
      events: result,
      total: result.length
    }, 'Events retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Approve event
 * @route POST /api/admin/events/:id/approve
 */
const approveEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const event = await EventModel.approveByAdmin(id, adminId);
    if (!event) {
      return errorResponse(res, 'Event not found or already processed', 404);
    }

    // Check if it was already approved
    if (event.already_approved) {
      return res.status(409).json({
        success: false,
        message: 'Event was already approved',
        data: { event },
        timestamp: new Date().toISOString()
      });
    }

    return successResponse(res, {
      event
    }, 'Event approved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Reject event
 * @route POST /api/admin/events/:id/reject
 */
const rejectEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const adminId = req.user.id;

    if (!rejection_reason || rejection_reason.trim().length < 10) {
      return errorResponse(res, 'Rejection reason must be at least 10 characters', 400);
    }

    const event = await EventModel.rejectByAdmin(id, adminId, rejection_reason);
    if (!event) {
      return errorResponse(res, 'Event not found or already processed', 404);
    }

    // Check if it was already rejected
    if (event.already_rejected) {
      return res.status(409).json({
        success: false,
        message: 'Event was already rejected',
        data: { event },
        timestamp: new Date().toISOString()
      });
    }

    return successResponse(res, {
      event
    }, 'Event rejected successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get event details with registration stats
 * @route GET /api/admin/events/:id
 */
const getEventDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const eventResult = await query(`
      SELECT 
        e.*,
        em.full_name as event_manager_name,
        em.email as event_manager_email,
        em.phone as event_manager_phone,
        em.school_id,
        s.school_name,
        a.full_name as approved_by_name,
        COUNT(DISTINCT er.id) as total_registrations,
        COUNT(DISTINCT CASE WHEN er.payment_status = 'COMPLETED' THEN er.id END) as paid_registrations,
        COUNT(DISTINCT ev.volunteer_id) as total_volunteers
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
      LEFT JOIN schools s ON em.school_id = s.id
      LEFT JOIN admins a ON e.approved_by_admin_id = a.id
      LEFT JOIN event_registrations er ON e.id = er.event_id
      LEFT JOIN event_volunteers ev ON e.id = ev.event_id
      WHERE e.id = $1
      GROUP BY e.id, em.full_name, em.email, em.phone, em.school_id, s.school_name, a.full_name
    `, [id]);

    if (eventResult.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }

    const event = eventResult[0];

    // Get recent registrations
    const recentRegistrations = await query(`
      SELECT 
        er.id,
        er.payment_status,
        er.payment_amount,
        er.payment_currency,
        er.registered_at,
        s.registration_no,
        s.full_name as student_name,
        s.email as student_email,
        sch.school_name
      FROM event_registrations er
      INNER JOIN students s ON er.student_id = s.id
      INNER JOIN schools sch ON s.school_id = sch.id
      WHERE er.event_id = $1
      ORDER BY er.registered_at DESC
      LIMIT 10
    `, [id]);

    return successResponse(res, {
      event,
      recent_registrations: recentRegistrations
    }, 'Event details retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get event approval preview (for pending events)
 * @route GET /api/admin/events/:id/approval-preview
 */
const getEventApprovalPreview = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get event details with manager info
    const eventResult = await query(`
      SELECT 
        e.*,
        em.full_name as manager_name,
        em.email as manager_email,
        em.phone as manager_phone,
        em.school_id as manager_school_id,
        s.school_name as manager_school_name
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
      LEFT JOIN schools s ON em.school_id = s.id
      WHERE e.id = $1
    `, [id]);

    if (eventResult.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }

    const event = eventResult[0];

    // Get all stalls for this event
    const stallsResult = await query(`
      SELECT 
        s.id,
        s.stall_name,
        s.stall_number,
        s.description,
        s.location,
        s.image_url,
        s.qr_code_token,
        s.is_active,
        sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.event_id = $1 AND s.is_active = true
      ORDER BY s.stall_number ASC
    `, [id]);

    // Get all volunteers for this event
    const volunteersResult = await query(`
      SELECT 
        v.id,
        v.full_name,
        v.email,
        v.phone,
        v.role,
        v.is_active,
        ev.assigned_location,
        ev.permissions,
        ev.assigned_at
      FROM volunteers v
      INNER JOIN event_volunteers ev ON v.id = ev.volunteer_id
      WHERE ev.event_id = $1 AND ev.is_active = true
      ORDER BY v.full_name ASC
    `, [id]);

    return successResponse(res, {
      event: {
        id: event.id,
        event_name: event.event_name,
        event_code: event.event_code,
        event_type: event.event_type,
        description: event.description,
        banner_image_url: event.banner_image_url,
        image_url: event.image_url,
        start_date: event.start_date,
        end_date: event.end_date,
        registration_start_date: event.registration_start_date,
        registration_end_date: event.registration_end_date,
        venue: event.venue,
        max_capacity: event.max_capacity,
        price: event.price,
        status: event.status,
        created_at: event.created_at
      },
      manager: {
        name: event.manager_name,
        email: event.manager_email,
        phone: event.manager_phone,
        organization: event.manager_organization
      },
      stalls: stallsResult,
      volunteers: volunteersResult,
      totals: {
        total_stalls: stallsResult.length,
        total_volunteers: volunteersResult.length
      }
    }, 'Event approval preview retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get comprehensive event analytics (for all approved events)
 * @route GET /api/admin/events/:id/analytics
 */
const getEventAnalytics = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get event details
    const event = await EventModel.findById(id);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Only allow analytics for approved events
    if (event.status !== 'APPROVED' && event.status !== 'ACTIVE' && event.status !== 'COMPLETED') {
      return errorResponse(res, 'Analytics are only available for approved events', 400);
    }

    // Get total registrations
    const registrationsQuery = `
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN payment_status = 'COMPLETED' THEN 1 ELSE 0 END) as paid,
             SUM(CASE WHEN attendance_status = 'PRESENT' THEN 1 ELSE 0 END) as attended
      FROM event_registrations
      WHERE event_id = $1
    `;
    const registrationResult = await query(registrationsQuery, [id]);
    const registrations = {
      total: parseInt(registrationResult[0].total) || 0,
      paid: parseInt(registrationResult[0].paid) || 0,
      attended: parseInt(registrationResult[0].attended) || 0
    };

    // Calculate revenue
    const revenueQuery = `
      SELECT COALESCE(SUM(amount_paid), 0) as total_revenue
      FROM event_registrations
      WHERE event_id = $1 AND payment_status = 'COMPLETED'
    `;
    const revenueResult = await query(revenueQuery, [id]);
    const revenue = parseFloat(revenueResult[0].total_revenue) || 0;

    // Get feedback stats
    const feedbackQuery = `
      SELECT 
        COUNT(*) as total_feedbacks,
        ROUND(AVG(overall_rating), 2) as average_rating,
        COUNT(CASE WHEN overall_rating = 5 THEN 1 END) as rating_5,
        COUNT(CASE WHEN overall_rating = 4 THEN 1 END) as rating_4,
        COUNT(CASE WHEN overall_rating = 3 THEN 1 END) as rating_3,
        COUNT(CASE WHEN overall_rating = 2 THEN 1 END) as rating_2,
        COUNT(CASE WHEN overall_rating = 1 THEN 1 END) as rating_1
      FROM feedbacks
      WHERE event_id = $1
    `;
    const feedbackResult = await query(feedbackQuery, [id]);
    const feedback = {
      total_feedbacks: parseInt(feedbackResult[0].total_feedbacks) || 0,
      average_rating: parseFloat(feedbackResult[0].average_rating) || 0,
      rating_distribution: {
        5: parseInt(feedbackResult[0].rating_5) || 0,
        4: parseInt(feedbackResult[0].rating_4) || 0,
        3: parseInt(feedbackResult[0].rating_3) || 0,
        2: parseInt(feedbackResult[0].rating_2) || 0,
        1: parseInt(feedbackResult[0].rating_1) || 0
      }
    };

    // Get stall rankings
    const rankingsQuery = `
      SELECT r.stall_id, r.rank, r.total_votes, r.percentage,
             s.stall_name, s.stall_number, s.image_url,
             sc.school_name
      FROM rankings r
      JOIN stalls s ON r.stall_id = s.id
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE r.event_id = $1
      ORDER BY r.rank ASC
      LIMIT 10
    `;
    const rankingsResult = await query(rankingsQuery, [id]);
    const rankings = rankingsResult.map(r => ({
      stall_id: r.stall_id,
      stall_name: r.stall_name,
      stall_number: r.stall_number,
      stall_image: r.image_url,
      school_name: r.school_name,
      rank: r.rank,
      total_votes: parseInt(r.total_votes) || 0,
      percentage: parseFloat(r.percentage) || 0
    }));

    // Get detailed stall statistics
    const stallsQuery = `
      SELECT 
        s.id, s.stall_name, s.stall_number, s.image_url,
        sc.school_name,
        COUNT(DISTINCT f.id) as total_feedbacks,
        ROUND(AVG(f.overall_rating), 2) as average_rating,
        COUNT(CASE WHEN f.overall_rating = 5 THEN 1 END) as rating_5,
        COUNT(CASE WHEN f.overall_rating = 4 THEN 1 END) as rating_4,
        COUNT(CASE WHEN f.overall_rating = 3 THEN 1 END) as rating_3,
        COUNT(CASE WHEN f.overall_rating = 2 THEN 1 END) as rating_2,
        COUNT(CASE WHEN f.overall_rating = 1 THEN 1 END) as rating_1,
        r.rank as ranking_position,
        r.total_votes as ranking_votes
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      LEFT JOIN feedbacks f ON s.id = f.stall_id
      LEFT JOIN rankings r ON s.id = r.stall_id AND r.event_id = $1
      WHERE s.event_id = $1 AND s.is_active = true
      GROUP BY s.id, sc.school_name, r.rank, r.total_votes
      ORDER BY s.stall_number ASC
    `;
    const stallsResult = await query(stallsQuery, [id]);
    const stalls = stallsResult.map(st => ({
      stall_id: st.id,
      stall_name: st.stall_name,
      stall_number: st.stall_number,
      stall_image: st.image_url,
      school_name: st.school_name,
      total_feedbacks: parseInt(st.total_feedbacks) || 0,
      average_rating: parseFloat(st.average_rating) || 0,
      rating_distribution: {
        5: parseInt(st.rating_5) || 0,
        4: parseInt(st.rating_4) || 0,
        3: parseInt(st.rating_3) || 0,
        2: parseInt(st.rating_2) || 0,
        1: parseInt(st.rating_1) || 0
      },
      ranking_position: st.ranking_position || null,
      ranking_votes: parseInt(st.ranking_votes) || 0
    }));

    // Get volunteer statistics with scan details
    const volunteersQuery = `
      SELECT 
        v.id, v.volunteer_name, v.email, v.phone,
        COUNT(DISTINCT cio.id) as total_scans,
        COUNT(DISTINCT CASE WHEN cio.check_type = 'CHECK_IN' THEN cio.id END) as total_checkins,
        COUNT(DISTINCT CASE WHEN cio.check_type = 'CHECK_OUT' THEN cio.id END) as total_checkouts,
        MIN(cio.check_time) as first_scan_time,
        MAX(cio.check_time) as last_scan_time
      FROM volunteers v
      JOIN event_volunteers ev ON v.id = ev.volunteer_id
      LEFT JOIN check_in_out cio ON v.id = cio.scanned_by_volunteer_id AND cio.event_id = $1
      WHERE ev.event_id = $1
      GROUP BY v.id
      ORDER BY total_scans DESC
    `;
    const volunteersResult = await query(volunteersQuery, [id]);
    const volunteers = volunteersResult.map(vol => {
      const totalScans = parseInt(vol.total_scans) || 0;
      const firstScanTime = vol.first_scan_time ? new Date(vol.first_scan_time) : null;
      const lastScanTime = vol.last_scan_time ? new Date(vol.last_scan_time) : null;
      
      let activeHours = 0;
      let averageScansPerHour = 0;
      
      if (firstScanTime && lastScanTime && totalScans > 0) {
        const diffMs = lastScanTime - firstScanTime;
        activeHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
        if (activeHours > 0) {
          averageScansPerHour = parseFloat((totalScans / activeHours).toFixed(2));
        }
      }

      return {
        volunteer_id: vol.id,
        volunteer_name: vol.volunteer_name,
        email: vol.email,
        phone: vol.phone,
        total_scans: totalScans,
        total_checkins: parseInt(vol.total_checkins) || 0,
        total_checkouts: parseInt(vol.total_checkouts) || 0,
        active_hours: activeHours,
        average_scans_per_hour: averageScansPerHour,
        first_scan_time: firstScanTime,
        last_scan_time: lastScanTime
      };
    });

    // Get check-in/out stats
    const checkInOutQuery = `
      SELECT 
        COUNT(*) as total_scans,
        COUNT(CASE WHEN check_type = 'CHECK_IN' THEN 1 END) as total_checkins,
        COUNT(CASE WHEN check_type = 'CHECK_OUT' THEN 1 END) as total_checkouts
      FROM check_in_out
      WHERE event_id = $1
    `;
    const checkInOutResult = await query(checkInOutQuery, [id]);
    const checkInOut = {
      total_scans: parseInt(checkInOutResult[0].total_scans) || 0,
      total_checkins: parseInt(checkInOutResult[0].total_checkins) || 0,
      total_checkouts: parseInt(checkInOutResult[0].total_checkouts) || 0
    };

    return successResponse(res, {
      event: {
        id: event.id,
        event_name: event.event_name,
        event_code: event.event_code,
        event_type: event.event_type,
        status: event.status,
        start_date: event.start_date,
        end_date: event.end_date
      },
      registrations,
      revenue,
      feedback,
      top_stalls: rankings,
      stalls,
      volunteers,
      check_in_out: checkInOut
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all schools
 * @route GET /api/admin/schools
 */
const getAllSchools = async (req, res, next) => {
  try {
    const schools = await School.findAll(query);

    return successResponse(res, {
      schools,
      total: schools.length
    }, 'Schools retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// RANKING ROUTES (Multi-Event Support - Comprehensive Rankings)
// ============================================================

/**
 * Get comprehensive ranking summary across all events
 * @route GET /api/admin/rankings/all
 */
const getAllEventsRankingsSummary = async (req, res, next) => {
  try {
    const RankingController = await import('./ranking.controller.js');
    return await RankingController.default.getAllEventsRankingsSummary(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * Get rankings grouped by event
 * @route GET /api/admin/rankings/by-event
 */
const getRankingsByEvent = async (req, res, next) => {
  try {
    const RankingController = await import('./ranking.controller.js');
    return await RankingController.default.getRankingsByEvent(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * Get stall rankings for specific event
 * @route GET /api/admin/events/:eventId/rankings/stalls
 */
const getEventStallRankings = async (req, res, next) => {
  try {
    const RankingController = await import('./ranking.controller.js');
    return await RankingController.default.getTopStallRankings(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * Get student rankings for specific event
 * @route GET /api/admin/events/:eventId/rankings/students
 */
const getEventStudentRankings = async (req, res, next) => {
  try {
    const RankingController = await import('./ranking.controller.js');
    return await RankingController.default.getTopStudentRankings(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * Get school rankings for specific event
 * @route GET /api/admin/events/:eventId/rankings/schools
 */
const getEventSchoolRankings = async (req, res, next) => {
  try {
    const RankingController = await import('./ranking.controller.js');
    return await RankingController.default.getTopSchools(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * Publish event rankings (make visible to public)
 * @route PATCH /api/admin/events/:id/publish-rankings
 */
const publishRankings = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if event exists
    const event = await EventModel.findById(id);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Update rankings_published to TRUE (force show)
    const updateQuery = `
      UPDATE events 
      SET rankings_published = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, event_name, status, rankings_published
    `;
    
    const result = await query(updateQuery, [id]);
    const updatedEvent = result[0];

    return successResponse(res, {
      event_id: updatedEvent.id,
      event_name: updatedEvent.event_name,
      status: updatedEvent.status,
      rankings_published: updatedEvent.rankings_published,
      message: 'Rankings are now visible to the public'
    }, 'Rankings published successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Unpublish event rankings (hide from public)
 * @route PATCH /api/admin/events/:id/unpublish-rankings
 */
const unpublishRankings = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if event exists
    const event = await EventModel.findById(id);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Update rankings_published to FALSE (force hide)
    const updateQuery = `
      UPDATE events 
      SET rankings_published = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, event_name, status, rankings_published
    `;
    
    const result = await query(updateQuery, [id]);
    const updatedEvent = result[0];

    return successResponse(res, {
      event_id: updatedEvent.id,
      event_name: updatedEvent.event_name,
      status: updatedEvent.status,
      rankings_published: updatedEvent.rankings_published,
      message: 'Rankings are now hidden from public view'
    }, 'Rankings unpublished successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Reset rankings visibility to auto-mode (NULL)
 * @route PATCH /api/admin/events/:id/reset-rankings-visibility
 */
const resetRankingsVisibility = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if event exists
    const event = await EventModel.findById(id);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Update rankings_published to NULL (auto-logic)
    const updateQuery = `
      UPDATE events 
      SET rankings_published = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, event_name, status, rankings_published
    `;
    
    const result = await query(updateQuery, [id]);
    const updatedEvent = result[0];

    const autoStatus = updatedEvent.status === 'COMPLETED' 
      ? 'Rankings will be visible (event completed)' 
      : 'Rankings will be hidden until event completes';

    return successResponse(res, {
      event_id: updatedEvent.id,
      event_name: updatedEvent.event_name,
      status: updatedEvent.status,
      rankings_published: updatedEvent.rankings_published,
      auto_status: autoStatus,
      message: 'Rankings visibility reset to automatic mode'
    }, 'Rankings visibility reset successfully');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// STUDENT BULK UPLOAD CONTROLLERS
// ============================================================

/**
 * Bulk upload students from Excel file
 * @route POST /api/admin/students/bulk-upload
 */
const bulkUploadStudents = async (req, res, next) => {
  const startTime = Date.now();

  try {
    // Validate file upload
    if (!req.file) {
      return errorResponse(res, 'No file uploaded. Please upload an Excel file (.xlsx or .xls)', 400);
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 'Uploaded file is empty', 400);
    }

    // Parse Excel file
    let parsedData;
    try {
      parsedData = await parseStudentFile(req.file.buffer);
    } catch (parseError) {
      return errorResponse(res, `Failed to parse Excel file: ${parseError.message}`, 400);
    }

    const { students, totalRows } = parsedData;

    if (totalRows === 0) {
      return errorResponse(res, 'No student data found in Excel file', 400);
    }

    // Validate all students
    const validationResult = validateStudents(students);

    if (!validationResult.valid) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed. Please fix errors in Excel file and try again.',
        data: {
          totalRows: validationResult.totalRows,
          validRows: validationResult.validRows,
          invalidRows: validationResult.invalidRows,
          errors: validationResult.errors.slice(0, 50), // Limit to first 50 errors
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Extract unique school IDs to validate
    const uniqueSchoolIds = [...new Set(validationResult.validStudents.map((s) => s.school_id))];

    // Validate school IDs exist in database
    const schoolCheckQuery = `
      SELECT id FROM schools WHERE id = ANY($1::uuid[])
    `;
    const existingSchools = await query(schoolCheckQuery, [uniqueSchoolIds]);
    const existingSchoolIds = existingSchools.map((s) => s.id);

    // Find invalid school IDs
    const invalidSchoolIds = uniqueSchoolIds.filter(
      (id) => !existingSchoolIds.includes(id)
    );

    if (invalidSchoolIds.length > 0) {
      // Find rows with invalid school IDs
      const invalidSchoolErrors = validationResult.validStudents
        .filter((s) => invalidSchoolIds.includes(s.school_id))
        .map((s) => ({
          row: s._rowNumber,
          field: 'school_id',
          value: s.school_id,
          error: 'School ID not found in database',
        }));

      return res.status(422).json({
        success: false,
        message: `Found ${invalidSchoolIds.length} invalid school ID(s). Please verify school IDs and try again.`,
        data: {
          totalRows: validationResult.totalRows,
          invalidSchoolIds,
          errors: invalidSchoolErrors.slice(0, 50),
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Sanitize student data and auto-generate passwords
    const sanitizedStudents = validationResult.validStudents.map((student) => {
      // Auto-generate password from date_of_birth + pincode
      // Format: YYYYMMDD + pincode (e.g., 2005-05-15 + 110001 = 20050515110001)
      const dobFormatted = student.date_of_birth.replace(/-/g, ''); // Remove dashes from YYYY-MM-DD
      const autoPassword = dobFormatted + student.pincode;

      return {
        ...student,
        full_name: sanitizeString(student.full_name),
        email: student.email ? sanitizeString(student.email.toLowerCase()) : null,
        password: autoPassword, // Auto-generated password
        address: student.address ? sanitizeString(student.address) : null,
        program_name: student.program_name ? sanitizeString(student.program_name) : null,
      };
    });

    // Perform bulk insert
    let bulkResult;
    try {
      bulkResult = await Student.bulkCreate(sanitizedStudents, query, 1000);
    } catch (bulkError) {
      return errorResponse(
        res,
        `Bulk upload failed: ${bulkError.message}`,
        500
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return successResponse(
      res,
      {
        totalRows: bulkResult.total,
        successful: bulkResult.inserted,
        failed: bulkResult.failed,
        duration: `${duration} seconds`,
        errors: bulkResult.errors,
      },
      `Successfully uploaded ${bulkResult.inserted} student(s)`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Validate student Excel file without inserting to database
 * @route POST /api/admin/students/validate-upload
 */
const validateStudentUpload = async (req, res, next) => {
  try {
    // Validate file upload
    if (!req.file) {
      return errorResponse(res, 'No file uploaded. Please upload an Excel file (.xlsx or .xls)', 400);
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 'Uploaded file is empty', 400);
    }

    // Parse Excel file
    let parsedData;
    try {
      parsedData = await parseStudentFile(req.file.buffer);
    } catch (parseError) {
      return errorResponse(res, `Failed to parse Excel file: ${parseError.message}`, 400);
    }

    const { students, totalRows } = parsedData;

    if (totalRows === 0) {
      return errorResponse(res, 'No student data found in Excel file', 400);
    }

    // Validate all students
    const validationResult = validateStudents(students);

    // Extract unique school IDs to validate
    const uniqueSchoolIds = [...new Set(students.map((s) => s.school_id).filter(Boolean))];

    // Validate school IDs exist in database
    const schoolCheckQuery = `
      SELECT id FROM schools WHERE id = ANY($1::uuid[])
    `;
    const existingSchools = await query(schoolCheckQuery, [uniqueSchoolIds]);
    const existingSchoolIds = existingSchools.map((s) => s.id);

    // Find invalid school IDs
    const invalidSchoolIds = uniqueSchoolIds.filter(
      (id) => !existingSchoolIds.includes(id)
    );

    // Add school validation errors
    if (invalidSchoolIds.length > 0) {
      students.forEach((student) => {
        if (invalidSchoolIds.includes(student.school_id)) {
          const existingError = validationResult.errors.find(
            (e) => e.row === student._rowNumber
          );
          if (existingError) {
            existingError.errors.push({
              field: 'school_id',
              error: 'School ID not found in database',
            });
          } else {
            validationResult.errors.push({
              row: student._rowNumber,
              errors: [
                {
                  field: 'school_id',
                  error: 'School ID not found in database',
                },
              ],
            });
          }
        }
      });

      validationResult.valid = false;
      validationResult.invalidRows = validationResult.errors.length;
      validationResult.validRows = totalRows - validationResult.errors.length;
    }

    // Return validation results
    if (!validationResult.valid) {
      return res.status(200).json({
        success: true,
        message: 'Validation completed with errors',
        data: {
          valid: false,
          totalRows: validationResult.totalRows,
          validRows: validationResult.validRows,
          invalidRows: validationResult.invalidRows,
          errors: validationResult.errors.slice(0, 100), // Return first 100 errors
          summary: `Found ${validationResult.invalidRows} error(s) in ${validationResult.totalRows} row(s)`,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return successResponse(
      res,
      {
        valid: true,
        totalRows: validationResult.totalRows,
        validRows: validationResult.validRows,
        message: 'All rows are valid! Ready to upload.',
      },
      'Validation successful'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Download Excel template for student bulk upload
 * @route GET /api/admin/students/upload-template
 */
const downloadStudentTemplate = async (req, res, next) => {
  try {
    // Generate template
    const templateBuffer = await generateStudentTemplate();

    // Set response headers for file download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="student_upload_template.xlsx"'
    );
    res.setHeader('Content-Length', templateBuffer.length);

    // Send file
    res.send(templateBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Export all students data to Excel file
 * @route GET /api/admin/students/export
 */
const exportStudents = async (req, res, next) => {
  try {
    // Get all students with school information
    const studentsQuery = `
      SELECT 
        s.id,
        s.registration_no,
        s.email,
        s.full_name,
        s.phone,
        s.date_of_birth,
        s.pincode,
        s.address,
        s.program_name,
        s.batch,
        s.total_scan_count,
        s.feedback_count,
        s.is_inside_event,
        s.total_events_registered,
        s.created_at,
        sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      ORDER BY s.created_at DESC
    `;

    const students = await query(studentsQuery);

    if (!students || students.length === 0) {
      return errorResponse(res, 'No students found in database', 404);
    }

    // Generate Excel file
    const excelBuffer = await exportStudentsToExcel(students);

    // Create filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `students_export_${timestamp}.xlsx`;

    // Set response headers for file download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);

    // Send file
    res.send(excelBuffer);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EVENT BULK REGISTRATION CONTROLLERS
// ============================================================

/**
 * Validate bulk registration file (pre-upload check)
 * POST /api/admin/events/:eventId/bulk-register/validate
 */
const validateBulkRegistration = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const adminId = req.user.id;

    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 400);
    }

    // Parse Excel file
    const parsed = await parseEventRegistrationFile(req.file.buffer);

    if (parsed.errors.length > 0) {
      return errorResponse(res, 'Excel file contains formatting errors', 400, {
        errors: parsed.errors
      });
    }

    // Validate event
    const { event } = await validateEventEligibility(eventId, null, 'ADMIN');

    // Validate registration numbers
    const validation = validateEventRegistrationData(parsed.registrationNumbers);

    if (!validation.valid) {
      return successResponse(res, {
        valid: false,
        errors: validation.errors,
        totalRows: validation.totalRows
      }, 'Validation completed with errors');
    }

    // Fetch students from database
    const { validStudents, invalidRegistrationNumbers } = await validateAndFetchStudents(
      validation.validRegistrationNumbers,
      null // Admin can register from all schools
    );

    // Check existing registrations
    const studentIds = validStudents.map(s => s.id);
    const existingStudentIds = await checkExistingRegistrations(eventId, studentIds);

    const duplicateCount = existingStudentIds.length;
    const newRegistrations = validStudents.length - duplicateCount;

    // Check capacity
    const capacityCheck = checkCapacityLimit(event, newRegistrations, false);

    return successResponse(res, {
      valid: true,
      summary: {
        total_in_file: parsed.totalRows,
        unique_in_file: parsed.uniqueCount,
        duplicates_in_file: parsed.duplicateCount,
        valid_students: validStudents.length,
        invalid_students: invalidRegistrationNumbers.length,
        already_registered: duplicateCount,
        new_registrations: newRegistrations
      },
      capacity: {
        current: event.current_registrations,
        max: event.max_capacity,
        after_upload: event.current_registrations + newRegistrations,
        exceeds_capacity: !capacityCheck.allowed,
        available_slots: capacityCheck.available_slots
      },
      errors: invalidRegistrationNumbers.map(regNo => ({
        registration_no: regNo,
        error: 'STUDENT_NOT_FOUND',
        message: 'Student not found in system'
      })),
      warnings: capacityCheck.allowed ? [] : [{
        type: 'CAPACITY_WARNING',
        message: capacityCheck.reason
      }]
    }, 'Validation completed successfully');

  } catch (error) {
    next(error);
  }
};

/**
 * Bulk register students to event
 * POST /api/admin/events/:eventId/bulk-register
 */
const bulkRegisterStudents = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { eventId } = req.params;
    const adminId = req.user.id;
    const bypassCapacity = req.body.bypass_capacity === 'true' || req.body.bypass_capacity === true;

    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 400);
    }

    // Parse Excel file
    const parsed = await parseEventRegistrationFile(req.file.buffer);

    if (parsed.errors.length > 0) {
      return errorResponse(res, 'Excel file contains errors', 400, {
        errors: parsed.errors.slice(0, 50)
      });
    }

    // Validate data format
    const validation = validateEventRegistrationData(parsed.registrationNumbers);

    if (!validation.valid) {
      return errorResponse(res, 'Validation failed', 422, {
        errors: validation.errors.slice(0, 50)
      });
    }

    // Validate event
    const { event } = await validateEventEligibility(eventId, null, 'ADMIN');

    // Fetch students
    const { validStudents, invalidRegistrationNumbers, schoolMismatches } = 
      await validateAndFetchStudents(validation.validRegistrationNumbers, null);

    if (validStudents.length === 0) {
      return errorResponse(res, 'No valid students found in upload', 400);
    }

    // Check existing registrations
    const studentIds = validStudents.map(s => s.id);
    const existingStudentIds = await checkExistingRegistrations(eventId, studentIds);

    // Filter out already registered students
    const studentsToRegister = validStudents.filter(s => !existingStudentIds.includes(s.id));

    if (studentsToRegister.length === 0) {
      return errorResponse(res, 'All students are already registered for this event', 400);
    }

    // Check capacity
    const capacityCheck = checkCapacityLimit(event, studentsToRegister.length, bypassCapacity);

    if (!capacityCheck.allowed) {
      return errorResponse(res, capacityCheck.reason, 400, {
        capacity: {
          max: event.max_capacity,
          current: event.current_registrations,
          requested: studentsToRegister.length,
          available: capacityCheck.available_slots
        }
      });
    }

    // Check cumulative limit
    const cumulativeCheck = await checkCumulativeLimit(eventId, adminId, studentsToRegister.length);

    // Perform bulk registration
    const bulkResult = await EventRegistration.bulkCreate(
      studentsToRegister,
      eventId,
      event.event_type,
      { skip_capacity_check: bypassCapacity }
    );

    // Prepare error details
    const errorDetails = [];

    invalidRegistrationNumbers.forEach(regNo => {
      errorDetails.push({
        registration_no: regNo,
        error: 'STUDENT_NOT_FOUND',
        message: 'Student not found in system'
      });
    });

    existingStudentIds.forEach(studentId => {
      const student = validStudents.find(s => s.id === studentId);
      if (student) {
        errorDetails.push({
          registration_no: student.registration_no,
          error: 'ALREADY_REGISTERED',
          message: 'Student already registered for this event'
        });
      }
    });

    // Create log entry
    const logEntry = await pool`
      INSERT INTO bulk_registration_logs (
        event_id,
        uploaded_by_user_id,
        uploaded_by_role,
        total_students_attempted,
        successful_registrations,
        failed_registrations,
        duplicate_registrations,
        file_name,
        status,
        capacity_overridden,
        attention_required,
        error_details
      ) VALUES (
        ${eventId},
        ${adminId},
        'ADMIN',
        ${parsed.totalRows},
        ${bulkResult.inserted},
        ${invalidRegistrationNumbers.length},
        ${existingStudentIds.length},
        ${req.file.originalname},
        ${bulkResult.inserted > 0 ? 'COMPLETED' : 'FAILED'},
        ${bypassCapacity},
        ${cumulativeCheck.attention_required},
        ${JSON.stringify(errorDetails)}
      )
      RETURNING id
    `;

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return successResponse(res, {
      log_id: logEntry[0].id,
      summary: {
        total_attempted: parsed.totalRows,
        successful: bulkResult.inserted,
        failed: invalidRegistrationNumbers.length,
        duplicates: existingStudentIds.length,
        duration: `${duration} seconds`
      },
      capacity_overridden: bypassCapacity,
      errors: errorDetails.slice(0, 100)
    }, 'Bulk registration completed');

  } catch (error) {
    next(error);
  }
};

/**
 * Download event registration template
 * GET /api/admin/events/:eventId/bulk-register/template
 */
const downloadEventRegistrationTemplate = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Fetch event details
    const events = await pool`
      SELECT 
        e.event_name,
        e.event_code,
        e.max_capacity,
        e.current_registrations
      FROM events e
      WHERE e.id = ${eventId}
    `;

    if (events.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }

    const event = events[0];

    const buffer = await generateEventRegistrationTemplate({
      event_name: event.event_name,
      event_code: event.event_code,
      max_capacity: event.max_capacity,
      current_registrations: event.current_registrations
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=event-registration-template-${event.event_code}.xlsx`);
    res.send(buffer);

  } catch (error) {
    next(error);
  }
};

/**
 * Download generic bulk registration template (no event required)
 * GET /api/admin/bulk-register/template
 */
const downloadGenericBulkRegistrationTemplate = async (req, res, next) => {
  try {
    // Generate generic template without event-specific info
    const buffer = await generateEventRegistrationTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Bulk_Registration_Template.xlsx');
    res.send(buffer);

  } catch (error) {
    next(error);
  }
};

/**
 * Get all bulk registration logs across all events
 * GET /api/admin/bulk-register/logs
 */
const getAllBulkRegistrationLogs = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      event_id,
      uploaded_by, 
      uploaded_by_role,
      from_date,
      to_date,
      include 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [];
    const params = [];
    let paramCount = 1;

    // Optional filters
    if (event_id) {
      conditions.push(`brl.event_id = $${paramCount}`);
      params.push(event_id);
      paramCount++;
    }

    if (uploaded_by) {
      conditions.push(`brl.uploaded_by_user_id = $${paramCount}`);
      params.push(uploaded_by);
      paramCount++;
    }

    if (uploaded_by_role) {
      conditions.push(`brl.uploaded_by_role = $${paramCount}`);
      params.push(uploaded_by_role);
      paramCount++;
    }

    if (from_date) {
      conditions.push(`brl.created_at >= $${paramCount}`);
      params.push(from_date);
      paramCount++;
    }

    if (to_date) {
      conditions.push(`brl.created_at <= $${paramCount}`);
      params.push(to_date);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Build select fields
    const selectFields = include === 'errors' 
      ? 'brl.*, e.event_name, e.event_code, ' +
        'COALESCE(a.full_name, em.full_name) as uploaded_by_name, ' +
        'COALESCE(a.email, em.email) as uploaded_by_email'
      : 'brl.id, brl.event_id, e.event_name, e.event_code, brl.uploaded_by_user_id, ' +
        'COALESCE(a.full_name, em.full_name) as uploaded_by_name, ' +
        'COALESCE(a.email, em.email) as uploaded_by_email, ' +
        'brl.uploaded_by_role, ' +
        'brl.total_students_attempted, brl.successful_registrations, brl.failed_registrations, ' +
        'brl.duplicate_registrations, brl.file_name, brl.created_at';

    const queryText = `
      SELECT 
        ${selectFields},
        COUNT(*) OVER() as total_count
      FROM bulk_registration_logs brl
      LEFT JOIN events e ON e.id = brl.event_id
      LEFT JOIN admins a ON a.id = brl.uploaded_by_user_id AND brl.uploaded_by_role = 'ADMIN'
      LEFT JOIN event_managers em ON em.id = brl.uploaded_by_user_id AND brl.uploaded_by_role = 'EVENT_MANAGER'
      ${whereClause}
      ORDER BY brl.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(parseInt(limit), offset);

    const result = await pool(queryText, params);

    // Database has UTC, convert to IST (UTC + 5:30)
    const logsWithIST = result.map(log => ({
      ...log,
      created_at: log.created_at ? (() => {
        const utcDate = new Date(log.created_at);
        const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
        const year = istDate.getFullYear();
        const month = String(istDate.getMonth() + 1).padStart(2, '0');
        const day = String(istDate.getDate()).padStart(2, '0');
        const hours = String(istDate.getHours()).padStart(2, '0');
        const minutes = String(istDate.getMinutes()).padStart(2, '0');
        const seconds = String(istDate.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} IST`;
      })() : null
    }));

    return successResponse(res, {
      logs: logsWithIST,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil((result[0]?.total_count || 0) / parseInt(limit)),
        total_records: parseInt(result[0]?.total_count || 0),
        limit: parseInt(limit)
      }
    }, 'All bulk registration logs retrieved');

  } catch (error) {
    next(error);
  }
};

/**
 * Get bulk registration logs for an event
 * GET /api/admin/events/:eventId/bulk-register/logs
 */
const getBulkRegistrationLogs = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      uploaded_by, 
      status,
      include 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['event_id = $1'];
    const params = [eventId];
    let paramCount = 2;

    if (uploaded_by) {
      conditions.push(`uploaded_by_user_id = $${paramCount}`);
      params.push(uploaded_by);
      paramCount++;
    }

    if (status) {
      conditions.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    const whereClause = conditions.join(' AND ');

    // Build select fields
    const selectFields = include === 'errors' 
      ? 'brl.*, error_details'
      : 'brl.id, brl.event_id, brl.uploaded_by_user_id, brl.uploaded_by_role, ' +
        'brl.total_students_attempted, brl.successful_registrations, brl.failed_registrations, ' +
        'brl.duplicate_registrations, brl.file_name, brl.status, brl.capacity_overridden, ' +
        'brl.attention_required, brl.created_at';

    const queryText = `
      SELECT 
        ${selectFields},
        COUNT(*) OVER() as total_count
      FROM bulk_registration_logs brl
      WHERE ${whereClause}
      ORDER BY brl.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(parseInt(limit), offset);

    const result = await pool(queryText, params);

    // Database has UTC, convert to IST (UTC + 5:30)
    const logsWithIST = result.map(log => ({
      ...log,
      created_at: log.created_at ? (() => {
        const utcDate = new Date(log.created_at);
        const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
        const year = istDate.getFullYear();
        const month = String(istDate.getMonth() + 1).padStart(2, '0');
        const day = String(istDate.getDate()).padStart(2, '0');
        const hours = String(istDate.getHours()).padStart(2, '0');
        const minutes = String(istDate.getMinutes()).padStart(2, '0');
        const seconds = String(istDate.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} IST`;
      })() : null
    }));

    return successResponse(res, {
      logs: logsWithIST,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result[0]?.total_count || 0,
        totalPages: Math.ceil((result[0]?.total_count || 0) / parseInt(limit))
      }
    }, 'Bulk registration logs retrieved');

  } catch (error) {
    next(error);
  }
};

/**
 * Export all bulk registration logs to CSV (across all events)
 * GET /api/admin/bulk-register/logs/export
 */
const exportAllBulkRegistrationLogs = async (req, res, next) => {
  try {
    const { event_id, uploaded_by_role, from_date, to_date } = req.query;

    let conditions = [];
    const params = [];
    let paramCount = 1;

    if (event_id) {
      conditions.push(`brl.event_id = $${paramCount}`);
      params.push(event_id);
      paramCount++;
    }

    if (uploaded_by_role) {
      conditions.push(`brl.uploaded_by_role = $${paramCount}`);
      params.push(uploaded_by_role);
      paramCount++;
    }

    if (from_date) {
      conditions.push(`brl.created_at >= $${paramCount}`);
      params.push(from_date);
      paramCount++;
    }

    if (to_date) {
      conditions.push(`brl.created_at <= $${paramCount}`);
      params.push(to_date);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const queryText = `
      SELECT 
        brl.id,
        e.event_name,
        e.event_code,
        brl.uploaded_by_user_id,
        COALESCE(a.full_name, em.full_name) as uploaded_by_name,
        COALESCE(a.email, em.email) as uploaded_by_email,
        brl.uploaded_by_role,
        brl.total_students_attempted,
        brl.successful_registrations,
        brl.failed_registrations,
        brl.duplicate_registrations,
        brl.file_name,
        brl.created_at
      FROM bulk_registration_logs brl
      LEFT JOIN events e ON e.id = brl.event_id
      LEFT JOIN admins a ON a.id = brl.uploaded_by_user_id AND brl.uploaded_by_role = 'ADMIN'
      LEFT JOIN event_managers em ON em.id = brl.uploaded_by_user_id AND brl.uploaded_by_role = 'EVENT_MANAGER'
      ${whereClause}
      ORDER BY brl.created_at DESC
    `;

    const logs = await pool(queryText, params);

    if (logs.length === 0) {
      return errorResponse(res, 'No bulk registration logs found', 404);
    }

    const headers = [
      'Log ID',
      'Event Name',
      'Event Code',
      'Uploaded By User ID',
      'Uploaded By Name',
      'Uploaded By Email',
      'Uploaded By Role',
      'Total Attempted',
      'Successful',
      'Failed',
      'Duplicates',
      'File Name',
      'Created At (IST)'
    ];

    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      // Database has UTC, convert to IST (UTC + 5:30)
      const utcDate = new Date(log.created_at);
      const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
      const year = istDate.getFullYear();
      const month = String(istDate.getMonth() + 1).padStart(2, '0');
      const day = String(istDate.getDate()).padStart(2, '0');
      const hours = String(istDate.getHours()).padStart(2, '0');
      const minutes = String(istDate.getMinutes()).padStart(2, '0');
      const seconds = String(istDate.getSeconds()).padStart(2, '0');
      const istString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} IST`;
      
      const row = [
        log.id,
        `"${log.event_name || 'N/A'}"`,
        log.event_code || 'N/A',
        log.uploaded_by_user_id,
        `"${log.uploaded_by_name || 'Unknown'}"`,
        log.uploaded_by_email || 'N/A',
        log.uploaded_by_role,
        log.total_students_attempted,
        log.successful_registrations,
        log.failed_registrations,
        log.duplicate_registrations,
        `"${log.file_name || ''}"`,
        istString
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');
    const filename = `all_bulk_registration_logs_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);

  } catch (error) {
    next(error);
  }
};

/**
 * Export bulk registration logs to CSV
 * GET /api/admin/events/:eventId/bulk-register/logs/export
 */
const exportBulkRegistrationLogs = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const logs = await pool`
      SELECT 
        brl.id,
        brl.uploaded_by_user_id,
        COALESCE(a.full_name, em.full_name) as uploaded_by_name,
        COALESCE(a.email, em.email) as uploaded_by_email,
        brl.uploaded_by_role,
        brl.total_students_attempted,
        brl.successful_registrations,
        brl.failed_registrations,
        brl.duplicate_registrations,
        brl.file_name,
        brl.status,
        brl.capacity_overridden,
        brl.attention_required,
        brl.created_at
      FROM bulk_registration_logs brl
      LEFT JOIN admins a ON a.id = brl.uploaded_by_user_id AND brl.uploaded_by_role = 'ADMIN'
      LEFT JOIN event_managers em ON em.id = brl.uploaded_by_user_id AND brl.uploaded_by_role = 'EVENT_MANAGER'
      WHERE brl.event_id = ${eventId}
      ORDER BY brl.created_at DESC
    `;

    // Generate CSV
    const headers = [
      'Log ID', 'Uploaded By User ID', 'Uploaded By Name', 'Uploaded By Email', 'Role',
      'Total Attempted', 'Successful', 'Failed', 
      'Duplicates', 'File Name', 'Status', 'Capacity Overridden', 
      'Attention Required', 'Created At (IST)'
    ];

    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      // Database has UTC, convert to IST (UTC + 5:30)
      const utcDate = new Date(log.created_at);
      const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
      const year = istDate.getFullYear();
      const month = String(istDate.getMonth() + 1).padStart(2, '0');
      const day = String(istDate.getDate()).padStart(2, '0');
      const hours = String(istDate.getHours()).padStart(2, '0');
      const minutes = String(istDate.getMinutes()).padStart(2, '0');
      const seconds = String(istDate.getSeconds()).padStart(2, '0');
      const istString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} IST`;
      
      const row = [
        log.id,
        log.uploaded_by_user_id,
        `"${log.uploaded_by_name || 'Unknown'}"`,
        log.uploaded_by_email || 'N/A',
        log.uploaded_by_role,
        log.total_students_attempted,
        log.successful_registrations,
        log.failed_registrations,
        log.duplicate_registrations,
        `"${log.file_name || ''}"`,
        log.status,
        log.capacity_overridden,
        log.attention_required,
        istString
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bulk-registration-logs.csv');
    res.send(csv);

  } catch (error) {
    next(error);
  }
};

/**
 * Get pending bulk registration requests (>200 students)
 * GET /api/admin/bulk-registrations/pending
 */
const getPendingBulkRegistrations = async (req, res, next) => {
  try {
    const { event_id, sort_by = 'created_at' } = req.query;

    let conditions = ["status = 'PENDING'"];
    const params = [];
    let paramCount = 1;

    if (event_id) {
      conditions.push(`brr.event_id = $${paramCount}`);
      params.push(event_id);
      paramCount++;
    }

    const whereClause = conditions.join(' AND ');

    // Determine sort order
    let orderBy = 'brr.created_at DESC';
    if (sort_by === 'urgency') {
      orderBy = 'EXTRACT(EPOCH FROM (brr.expires_at - NOW())) ASC, brr.total_count DESC';
    } else if (sort_by === 'oldest') {
      orderBy = 'brr.created_at ASC';
    } else if (sort_by === 'largest') {
      orderBy = 'brr.total_count DESC';
    }

    const queryText = `
      SELECT 
        brr.id,
        brr.event_id,
        brr.requested_by_user_id,
        brr.requested_by_role,
        brr.total_count,
        brr.status,
        brr.expires_at,
        brr.created_at,
        e.event_name,
        e.event_code,
        e.max_capacity,
        e.current_registrations,
        em.full_name as requester_name,
        em.email as requester_email,
        EXTRACT(EPOCH FROM (brr.expires_at - NOW())) / 3600 as expires_in_hours
      FROM bulk_registration_requests brr
      JOIN events e ON brr.event_id = e.id
      JOIN event_managers em ON brr.requested_by_user_id = em.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
    `;

    const requests = await pool(queryText, params);

    // Calculate summary
    const summary = {
      total_pending: requests.length,
      total_students: requests.reduce((sum, r) => sum + r.total_count, 0),
      expiring_soon: requests.filter(r => r.expires_in_hours < 24).length
    };

    return successResponse(res, {
      pending_requests: requests,
      summary
    }, 'Pending bulk registration requests retrieved');

  } catch (error) {
    next(error);
  }
};

/**
 * Approve bulk registration request
 * POST /api/admin/bulk-registrations/:requestId/approve
 */
const approveBulkRegistration = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user.id;

    // Fetch request
    const requests = await pool`
      SELECT * FROM bulk_registration_requests
      WHERE id = ${requestId}
    `;

    if (requests.length === 0) {
      return errorResponse(res, 'Request not found', 404);
    }

    const request = requests[0];

    // Check if already processed
    if (request.status !== 'PENDING') {
      return errorResponse(res, `Request already ${request.status.toLowerCase()}`, 409);
    }

    // Update request status to PROCESSING
    await pool`
      UPDATE bulk_registration_requests
      SET 
        status = 'PROCESSING',
        processing_started_at = NOW(),
        updated_at = NOW()
      WHERE id = ${requestId}
    `;

    // Fetch event
    const events = await pool`
      SELECT * FROM events WHERE id = ${request.event_id}
    `;

    if (events.length === 0) {
      await pool`
        UPDATE bulk_registration_requests
        SET status = 'EXPIRED', updated_at = NOW()
        WHERE id = ${requestId}
      `;
      return errorResponse(res, 'Event not found or deleted', 404);
    }

    const event = events[0];

    // Parse student data
    const studentData = request.student_data;
    const studentIds = studentData.map(s => s.student_id);

    // Fetch students
    const students = await pool`
      SELECT id, registration_no, full_name FROM students
      WHERE id = ANY(${studentIds})
    `;

    // Perform bulk registration
    const bulkResult = await EventRegistration.bulkCreate(
      students,
      request.event_id,
      event.event_type,
      { skip_capacity_check: false }
    );

    // Update request as approved
    await pool`
      UPDATE bulk_registration_requests
      SET 
        status = 'APPROVED',
        approved_by_admin_id = ${adminId},
        approved_at = NOW(),
        processing_completed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${requestId}
    `;

    // Update log entry
    if (request.bulk_log_id) {
      await pool`
        UPDATE bulk_registration_logs
        SET 
          status = 'COMPLETED',
          successful_registrations = ${bulkResult.inserted},
          duplicate_registrations = ${bulkResult.duplicates},
          updated_at = NOW()
        WHERE id = ${request.bulk_log_id}
      `;
    }

    return successResponse(res, {
      request_id: requestId,
      status: 'APPROVED',
      processed: {
        total_attempted: request.total_count,
        successful: bulkResult.inserted,
        duplicates: bulkResult.duplicates,
        failed: bulkResult.failed
      }
    }, 'Bulk registration approved and processed');

  } catch (error) {
    // Rollback request status on error
    try {
      await pool`
        UPDATE bulk_registration_requests
        SET status = 'PENDING', updated_at = NOW()
        WHERE id = ${req.params.requestId}
      `;
    } catch (rollbackError) {
      console.error('Failed to rollback request status:', rollbackError);
    }
    next(error);
  }
};

/**
 * Reject bulk registration request
 * POST /api/admin/bulk-registrations/:requestId/reject
 */
const rejectBulkRegistration = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user.id;
    const { rejection_reason_code, rejection_reason_text } = req.body;

    if (!rejection_reason_text || rejection_reason_text.trim().length < 10) {
      return errorResponse(res, 'Rejection reason must be at least 10 characters', 400);
    }

    // Fetch request
    const requests = await pool`
      SELECT * FROM bulk_registration_requests
      WHERE id = ${requestId}
    `;

    if (requests.length === 0) {
      return errorResponse(res, 'Request not found', 404);
    }

    const request = requests[0];

    // Check if already processed
    if (request.status !== 'PENDING') {
      return errorResponse(res, `Request already ${request.status.toLowerCase()}`, 409);
    }

    // Update request as rejected
    await pool`
      UPDATE bulk_registration_requests
      SET 
        status = 'REJECTED',
        rejected_by_admin_id = ${adminId},
        rejected_at = NOW(),
        rejection_reason_code = ${rejection_reason_code || 'CUSTOM'},
        rejection_reason_text = ${rejection_reason_text},
        updated_at = NOW()
      WHERE id = ${requestId}
    `;

    // Update log entry
    if (request.bulk_log_id) {
      await pool`
        UPDATE bulk_registration_logs
        SET 
          status = 'FAILED',
          updated_at = NOW()
        WHERE id = ${request.bulk_log_id}
      `;
    }

    return successResponse(res, {
      request_id: requestId,
      status: 'REJECTED',
      rejection_details: {
        reason_code: rejection_reason_code || 'CUSTOM',
        reason_text: rejection_reason_text
      }
    }, 'Bulk registration request rejected');

  } catch (error) {
    next(error);
  }
};

/**
 * Update event capacity
 * PATCH /api/admin/events/:eventId/capacity
 */
const updateEventCapacity = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { max_capacity, force = false } = req.body;

    if (!max_capacity || max_capacity < 0) {
      return errorResponse(res, 'Valid max_capacity is required (must be >= 0)', 400);
    }

    // Fetch event
    const events = await pool`
      SELECT * FROM events WHERE id = ${eventId}
    `;

    if (events.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }

    const event = events[0];

    // Check if reducing below current registrations
    if (max_capacity < event.current_registrations && !force) {
      return res.status(409).json({
        success: false,
        message: 'New capacity is below current registrations',
        data: {
          requested_capacity: max_capacity,
          current_registrations: event.current_registrations,
          over_capacity_by: event.current_registrations - max_capacity,
          warning: 'This will create over-capacity situation',
          action_required: 'Set force=true to confirm'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update capacity
    await pool`
      UPDATE events
      SET 
        max_capacity = ${max_capacity},
        updated_at = NOW()
      WHERE id = ${eventId}
    `;

    const updated = await pool`
      SELECT id, event_name, max_capacity, current_registrations
      FROM events WHERE id = ${eventId}
    `;

    return successResponse(res, {
      event: updated[0],
      change_log: {
        old_capacity: event.max_capacity,
        new_capacity: max_capacity,
        changed_by: req.user.id,
        changed_at: new Date().toISOString()
      }
    }, 'Event capacity updated successfully');

  } catch (error) {
    next(error);
  }
};

/**
 * Cancel single registration (admin override)
 * POST /api/admin/registrations/:registrationId/cancel
 */
const cancelRegistration = async (req, res, next) => {
  try {
    const { registrationId } = req.params;
    const { force = false, custom_refund_amount, reason = 'Admin cancellation' } = req.body;
    const adminId = req.user.id;

    // Import services
    const { calculateRefund } = await import('../utils/refundCalculator.js');
    const { promoteFromWaitlist } = await import('../services/waitlist.service.js');
    const PaymentService = (await import('../services/payment.js')).default;

    // Find registration
    const registrationResult = await pool`
      SELECT er.*, e.event_name, e.event_type, e.price, e.start_date, 
             e.refund_enabled, e.cancellation_deadline_hours, e.refund_tiers
      FROM event_registrations er
      JOIN events e ON er.event_id = e.id
      WHERE er.id = ${registrationId}
    `;

    if (registrationResult.length === 0) {
      return errorResponse(res, 'Registration not found', 404);
    }

    const registration = registrationResult[0];

    // Check if already cancelled
    if (registration.registration_status === 'CANCELLED') {
      return errorResponse(res, 'Registration already cancelled', 400);
    }

    // Check if registration is confirmed
    if (registration.registration_status !== 'CONFIRMED') {
      return errorResponse(res, 'Only confirmed registrations can be cancelled', 400);
    }

    await pool('BEGIN');

    try {
      let refundInfo = null;

      // Handle paid events
      if (registration.event_type === 'PAID' && registration.payment_status === 'COMPLETED') {
        let refundAmount;
        let refundReason;

        if (force && custom_refund_amount !== undefined) {
          // Admin override with custom amount
          refundAmount = parseFloat(custom_refund_amount);
          refundReason = reason;
        } else if (force) {
          // Admin override with full refund
          refundAmount = parseFloat(registration.payment_amount);
          refundReason = reason;
        } else {
          // Calculate refund based on policy
          const event = {
            event_type: registration.event_type,
            price: registration.price,
            start_date: registration.start_date,
            refund_enabled: registration.refund_enabled,
            cancellation_deadline_hours: registration.cancellation_deadline_hours,
            refund_tiers: registration.refund_tiers
          };

          const refundCalculation = calculateRefund(event, new Date());

          if (!refundCalculation.eligible) {
            await pool('ROLLBACK');
            return errorResponse(res, refundCalculation.reason, 400);
          }

          refundAmount = refundCalculation.amount;
          refundReason = refundCalculation.reason;
        }

        // Process refund in database
        await EventRegistration.processRefund(
          registration.id,
          refundAmount,
          refundReason
        );

        // Process refund via Razorpay
        const razorpayRefund = await PaymentService.processRefund({
          payment_id: registration.razorpay_payment_id,
          amount: refundAmount,
          notes: {
            reason: reason,
            admin_id: adminId,
            admin_override: force
          }
        });

        refundInfo = {
          refund_amount: refundAmount,
          refund_id: razorpayRefund.id,
          refund_status: razorpayRefund.status,
          admin_override: force
        };
      } else {
        // Cancel free event registration
        await EventRegistration.cancel(registration.id);
      }

      // Log admin action
      await pool`
        INSERT INTO audit_logs (
          event_type,
          user_id,
          user_role,
          resource_type,
          resource_id,
          metadata
        ) VALUES (
          'ADMIN_CANCEL_REGISTRATION',
          ${adminId},
          'ADMIN',
          'REGISTRATION',
          ${registrationId},
          ${JSON.stringify({
            student_id: registration.student_id,
            event_id: registration.event_id,
            event_name: registration.event_name,
            reason: reason,
            force_override: force,
            refund_amount: refundInfo?.refund_amount
          })}
        )
      `;

      // Promote from waitlist
      const waitlistResult = await promoteFromWaitlist(registration.event_id, 1);

      await pool('COMMIT');

      return successResponse(res, {
        success: true,
        message: 'Registration cancelled by admin',
        registration_id: registrationId,
        event_name: registration.event_name,
        admin_override: force,
        reason: reason,
        waitlist_promoted: waitlistResult.promoted_count,
        ...refundInfo
      }, 'Registration cancelled successfully');
    } catch (error) {
      await pool('ROLLBACK');
      console.error('Admin cancellation error:', error);
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel entire event (cascade all registrations with refunds)
 * DELETE /api/admin/events/:eventId
 */
const cancelEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { reason = 'Event cancelled by admin' } = req.body;
    const adminId = req.user.id;

    // Check if event exists
    const event = await EventModel.findById(eventId);
    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Check if event is already cancelled
    if (event.status === 'CANCELLED') {
      return errorResponse(res, 'Event is already cancelled', 400);
    }

    // Delete event (cascade cancellations)
    const result = await EventModel.delete(eventId, reason);

    // Log admin action
    await pool`
      INSERT INTO audit_logs (
        event_type,
        user_id,
        user_role,
        resource_type,
        resource_id,
        metadata
      ) VALUES (
        'ADMIN_CANCEL_EVENT',
        ${adminId},
        'ADMIN',
        'EVENT',
        ${eventId},
        ${JSON.stringify({
          event_name: event.event_name,
          event_code: event.event_code,
          reason: reason,
          registrations_affected: result.registrations_cancelled,
          refunds_processed: result.refunds_processed,
          total_refunded: result.total_refunded
        })}
      )
    `;

    return successResponse(res, {
      ...result,
      event_name: event.event_name,
      event_code: event.event_code,
      cancellation_reason: reason,
      message: `Event cancelled. ${result.registrations_cancelled} registrations cancelled, ${result.refunds_processed} refunds processed (₹${result.total_refunded})`
    }, 'Event cancelled successfully');
  } catch (error) {
    next(error);
  }
};

// Search students by name, email, phone, registration_no, or school
const searchStudents = async (req, res, next) => {
  try {
    const { q } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchPattern = `%${q.trim()}%`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM students
      WHERE 
        name ILIKE $1 OR 
        email ILIKE $1 OR 
        phone ILIKE $1 OR 
        registration_no ILIKE $1 OR
        school_name ILIKE $1
    `;

    const countResult = await pool.query(countQuery, [searchPattern]);
    const total = parseInt(countResult.rows[0].total);

    const searchQuery = `
      SELECT 
        id,
        name,
        email,
        phone,
        registration_no,
        school_name,
        course,
        branch,
        semester,
        division,
        created_at
      FROM students
      WHERE 
        name ILIKE $1 OR 
        email ILIKE $1 OR 
        phone ILIKE $1 OR 
        registration_no ILIKE $1 OR
        school_name ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(searchQuery, [searchPattern, limit, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// Search events by name, code, description, or manager name
const searchEvents = async (req, res, next) => {
  try {
    const { q } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchPattern = `%${q.trim()}%`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM events e
      LEFT JOIN event_managers em ON e.event_manager_id = em.id
      WHERE 
        e.event_name ILIKE $1 OR 
        e.event_code ILIKE $1 OR 
        e.description ILIKE $1 OR
        em.name ILIKE $1
    `;

    const countResult = await pool.query(countQuery, [searchPattern]);
    const total = parseInt(countResult.rows[0].total);

    const searchQuery = `
      SELECT 
        e.id,
        e.event_name,
        e.event_code,
        e.description,
        e.event_manager_id,
        em.name as manager_name,
        em.email as manager_email,
        e.max_participants,
        e.start_date,
        e.end_date,
        e.created_at
      FROM events e
      LEFT JOIN event_managers em ON e.event_manager_id = em.id
      WHERE 
        e.event_name ILIKE $1 OR 
        e.event_code ILIKE $1 OR 
        e.description ILIKE $1 OR
        em.name ILIKE $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(searchQuery, [searchPattern, limit, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get platform-wide refund history with aggregated stats
const getPlatformRefunds = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Get aggregated refund stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_refunds,
        COALESCE(SUM(refund_amount), 0) as total_refund_amount,
        COUNT(DISTINCT event_id) as events_with_refunds,
        COUNT(DISTINCT student_id) as unique_students_refunded
      FROM event_registrations
      WHERE status = 'cancelled' AND refund_amount > 0
    `;

    const statsResult = await pool.query(statsQuery);

    // Get paginated refund history
    const refundsQuery = `
      SELECT 
        er.id,
        er.event_id,
        e.event_name,
        e.event_code,
        er.student_id,
        s.name as student_name,
        s.email as student_email,
        s.registration_no,
        er.registration_fee,
        er.refund_amount,
        er.cancellation_reason,
        er.cancelled_at,
        em.name as cancelled_by_manager
      FROM event_registrations er
      INNER JOIN events e ON er.event_id = e.id
      INNER JOIN students s ON er.student_id = s.id
      LEFT JOIN event_managers em ON e.event_manager_id = em.id
      WHERE er.status = 'cancelled' AND er.refund_amount > 0
      ORDER BY er.cancelled_at DESC
      LIMIT $1 OFFSET $2
    `;

    const refundsResult = await pool.query(refundsQuery, [limit, offset]);
    const total = parseInt(statsResult.rows[0].total_refunds);

    res.json({
      success: true,
      data: refundsResult.rows,
      summary: {
        totalRefunds: parseInt(statsResult.rows[0].total_refunds),
        totalRefundAmount: parseFloat(statsResult.rows[0].total_refund_amount),
        eventsWithRefunds: parseInt(statsResult.rows[0].events_with_refunds),
        uniqueStudentsRefunded: parseInt(statsResult.rows[0].unique_students_refunded)
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  logout,
  getProfile,
  updateProfile,
  getAllStudents,
  getAllVolunteers,
  getAllStalls,
  getAllSchools,
  // Multi-Event Support - Event Manager CRUD
  createEventManager,
  getEventManagerDetails,
  updateEventManager,
  deleteEventManager,
  getAllEventManagers,
  // Multi-Event Support - Event Management
  getPendingEvents,
  getAllEvents,
  approveEvent,
  rejectEvent,
  getEventDetails,
  getEventApprovalPreview,
  getEventAnalytics,
  // Multi-Event Support - Comprehensive Rankings
  getAllEventsRankingsSummary,
  getRankingsByEvent,
  getEventStallRankings,
  getEventStudentRankings,
  getEventSchoolRankings,
  // Ranking Visibility Control
  publishRankings,
  unpublishRankings,
  resetRankingsVisibility,
  // Student Bulk Upload
  bulkUploadStudents,
  validateStudentUpload,
  downloadStudentTemplate,
  exportStudents,
  // Event Bulk Registration
  validateBulkRegistration,
  bulkRegisterStudents,
  downloadEventRegistrationTemplate,
  downloadGenericBulkRegistrationTemplate,
  getAllBulkRegistrationLogs,
  getBulkRegistrationLogs,
  exportAllBulkRegistrationLogs,
  exportBulkRegistrationLogs,
  getPendingBulkRegistrations,
  approveBulkRegistration,
  rejectBulkRegistration,
  updateEventCapacity,
  // Deregistration and Refunds
  cancelRegistration,
  cancelEvent,
  // Search and Platform Refunds
  searchStudents,
  searchEvents,
  getPlatformRefunds,
};
