import Admin from '../models/Admin.model.js';
import Student from '../models/Student.model.js';
import Volunteer from '../models/Volunteer.model.js';
import Stall from '../models/Stall.model.js';
import CheckInOut from '../models/CheckInOut.model.js';
import EventManagerModel from '../models/EventManager.model.js'; // ✅ Fixed: consistent naming
import EventModel from '../models/Event.model.js'; // ✅ Fixed: consistent naming
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { successResponse, errorResponse } from '../helpers/response.js';
import { setAuthCookie, clearAuthCookie } from '../helpers/cookie.js';
import { query } from '../config/db.js';

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

/**
 * Get system statistics
 * @route GET /api/admin/stats
 */
const getStats = async (req, res, next) => {
  try {
    const [students, volunteers, stalls] = await Promise.all([
      Student.findAll(100, 0, query),
      Volunteer.findAllActive(query),
      Stall.findAll(query)
    ]);

    return successResponse(res, {
      totalStudents: students.length,
      totalVolunteers: volunteers.length,
      totalStalls: stalls.length,
      activeCheckIns: 0 // TODO: Implement check-in counting
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get top schools based on student rankings (Category 2 - ADMIN ONLY)
 * @route GET /api/admin/top-schools
 */
const getTopSchools = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const queryText = `
      SELECT 
        sc.id as school_id,
        sc.school_name,
        COUNT(DISTINCT s.id) as total_students_ranked,
        SUM(CASE WHEN st.school_id = sc.id THEN 
          CASE r.rank
            WHEN 1 THEN 5
            WHEN 2 THEN 3
            WHEN 3 THEN 1
            ELSE 0
          END
        ELSE 0 END) as school_score,
        SUM(CASE WHEN st.school_id = sc.id AND r.rank = 1 THEN 1 ELSE 0 END) as rank_1_count,
        SUM(CASE WHEN st.school_id = sc.id AND r.rank = 2 THEN 1 ELSE 0 END) as rank_2_count,
        SUM(CASE WHEN st.school_id = sc.id AND r.rank = 3 THEN 1 ELSE 0 END) as rank_3_count,
        COUNT(DISTINCT CASE WHEN st.school_id = sc.id THEN st.id END) as ranked_stalls_count
      FROM schools sc
      LEFT JOIN students s ON s.school_id = sc.id AND s.has_completed_ranking = true
      LEFT JOIN rankings r ON r.student_id = s.id
      LEFT JOIN stalls st ON r.stall_id = st.id
      WHERE s.has_completed_ranking = true
      GROUP BY sc.id, sc.school_name
      HAVING SUM(CASE WHEN st.school_id = sc.id THEN 
        CASE r.rank
          WHEN 1 THEN 5
          WHEN 2 THEN 3
          WHEN 3 THEN 1
          ELSE 0
        END
      ELSE 0 END) > 0
      ORDER BY school_score DESC, total_students_ranked DESC
      LIMIT $1
    `;

    const topSchools = await query(queryText, [limit]);

    // Get overall stats
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT s.id) as total_students_participated,
        COUNT(DISTINCT sc.id) as total_schools_participated,
        COUNT(DISTINCT st.id) as total_stalls_ranked
      FROM students s
      LEFT JOIN rankings r ON r.student_id = s.id
      LEFT JOIN stalls st ON r.stall_id = st.id
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.has_completed_ranking = true
    `;

    const stats = await query(statsQuery);

    return successResponse(res, {
      top_schools: topSchools.map((school, index) => ({
        position: index + 1,
        school_id: school.school_id,
        school_name: school.school_name,
        total_score: parseInt(school.school_score),
        breakdown: {
          rank_1_votes: parseInt(school.rank_1_count),
          rank_2_votes: parseInt(school.rank_2_count),
          rank_3_votes: parseInt(school.rank_3_count)
        },
        students_participated: parseInt(school.total_students_ranked),
        stalls_ranked: parseInt(school.ranked_stalls_count)
      })),
      scoring_system: {
        rank_1: '5 points',
        rank_2: '3 points',
        rank_3: '1 point',
        description: 'Schools earn points when their stalls are ranked by students from their own school'
      },
      overall_stats: {
        total_students_participated: parseInt(stats[0].total_students_participated),
        total_schools_participated: parseInt(stats[0].total_schools_participated),
        total_stalls_ranked: parseInt(stats[0].total_stalls_ranked)
      }
    }, 'Top schools retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get top-ranked stalls (Category 2 - ADMIN ONLY)
 * @route GET /api/admin/top-stalls
 */
const getTopStalls = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const queryText = `
      SELECT 
        st.id as stall_id,
        st.stall_number,
        st.stall_name,
        st.description,
        st.location,
        sc.id as school_id,
        sc.school_name,
        st.rank_1_votes,
        st.rank_2_votes,
        st.rank_3_votes,
        st.weighted_score,
        (st.rank_1_votes + st.rank_2_votes + st.rank_3_votes) as total_votes
      FROM stalls st
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE (st.rank_1_votes + st.rank_2_votes + st.rank_3_votes) > 0
      ORDER BY st.weighted_score DESC, st.rank_1_votes DESC, st.stall_number ASC
      LIMIT $1
    `;

    const topStalls = await query(queryText, [limit]);

    // Get overall ranking stats
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT stall_id) as total_stalls_ranked,
        SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) as total_rank_1_votes,
        SUM(CASE WHEN rank = 2 THEN 1 ELSE 0 END) as total_rank_2_votes,
        SUM(CASE WHEN rank = 3 THEN 1 ELSE 0 END) as total_rank_3_votes,
        COUNT(DISTINCT student_id) as total_students_voted
      FROM rankings
    `;

    const stats = await query(statsQuery);

    return successResponse(res, {
      top_stalls: topStalls.map((stall, index) => ({
        position: index + 1,
        stall_id: stall.stall_id,
        stall_number: stall.stall_number,
        stall_name: stall.stall_name,
        description: stall.description,
        location: stall.location,
        school: {
          school_id: stall.school_id,
          school_name: stall.school_name
        },
        ranking_stats: {
          rank_1_votes: parseInt(stall.rank_1_votes),
          rank_2_votes: parseInt(stall.rank_2_votes),
          rank_3_votes: parseInt(stall.rank_3_votes),
          total_votes: parseInt(stall.total_votes),
          weighted_score: parseInt(stall.weighted_score)
        }
      })),
      scoring_system: {
        rank_1: '5 points',
        rank_2: '3 points',
        rank_3: '1 point',
        formula: 'weighted_score = (rank_1_votes × 5) + (rank_2_votes × 3) + (rank_3_votes × 1)'
      },
      overall_stats: {
        total_stalls_ranked: parseInt(stats[0].total_stalls_ranked),
        total_students_voted: parseInt(stats[0].total_students_voted),
        breakdown: {
          rank_1_votes: parseInt(stats[0].total_rank_1_votes),
          rank_2_votes: parseInt(stats[0].total_rank_2_votes),
          rank_3_votes: parseInt(stats[0].total_rank_3_votes)
        }
      }
    }, 'Top stalls retrieved successfully');
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
    let { full_name, email, password, phone, organization } = req.body;
    const adminId = req.user.id;

    // Validation
    if (!full_name || !email || !password || !phone) {
      return errorResponse(res, 'Full name, email, password, and phone are required', 400);
    }

    // Sanitize full_name to prevent XSS
    full_name = full_name.trim().replace(/<[^>]*>/g, '');
    if (full_name.length === 0) {
      return errorResponse(res, 'Full name cannot be empty or contain only HTML tags', 400);
    }

    // Sanitize organization if provided
    if (organization) {
      organization = organization.trim().replace(/<[^>]*>/g, '');
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

    // Validate password strength
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

    // Check if email already exists
    const existingManager = await query(
      'SELECT id FROM event_managers WHERE email = $1',
      [email]
    );
    if (existingManager.length > 0) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create event manager (pre-approved by admin)
    const result = await query(
      `INSERT INTO event_managers 
       (full_name, email, password_hash, phone, organization, 
        is_approved_by_admin, approved_by_admin_id, approved_at, is_active)
       VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), true)
       RETURNING id, full_name, email, phone, organization, 
                 is_approved_by_admin, is_active, created_at, approved_at`,
      [full_name, email, hashedPassword, phone, organization || null, adminId]
    );

    return successResponse(res, {
      event_manager: result[0]
    }, 'Event manager created successfully', 201);
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
        em.organization,
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
      LEFT JOIN events e ON em.id = e.created_by_manager_id
      LEFT JOIN admins a ON em.approved_by_admin_id = a.id
      WHERE em.id = $1
      GROUP BY em.id, a.full_name`,
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
        em.organization,
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
      LEFT JOIN events e ON em.id = e.created_by_manager_id
      LEFT JOIN admins a ON em.approved_by_admin_id = a.id
      GROUP BY em.id, a.full_name
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
        em.organization
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
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
        em.organization,
        a.full_name as approved_by_name
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
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
        em.organization,
        a.full_name as approved_by_name,
        COUNT(DISTINCT er.id) as total_registrations,
        COUNT(DISTINCT CASE WHEN er.payment_status = 'COMPLETED' THEN er.id END) as paid_registrations,
        COUNT(DISTINCT ev.volunteer_id) as total_volunteers
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
      LEFT JOIN admins a ON e.approved_by_admin_id = a.id
      LEFT JOIN event_registrations er ON e.id = er.event_id
      LEFT JOIN event_volunteers ev ON e.id = ev.event_id
      WHERE e.id = $1
      GROUP BY e.id, em.full_name, em.email, em.phone, em.organization, a.full_name
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
        em.organization as manager_organization
      FROM events e
      INNER JOIN event_managers em ON e.created_by_manager_id = em.id
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
        v.volunteer_name,
        v.email,
        v.phone,
        v.assigned_location,
        v.is_active,
        ev.assigned_at
      FROM volunteers v
      INNER JOIN event_volunteers ev ON v.id = ev.volunteer_id
      WHERE ev.event_id = $1
      ORDER BY v.volunteer_name ASC
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

export default {
  login,
  logout,
  getProfile,
  updateProfile,
  getAllStudents,
  getAllVolunteers,
  getAllStalls,
  getStats,
  getTopSchools,
  getTopStalls,
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
  getEventAnalytics
};
