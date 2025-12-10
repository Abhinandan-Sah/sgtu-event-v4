/**
 * Bulk Registration Service
 * Handles validation, rate limiting, and business logic for bulk student event registrations
 */

import { pool } from '../config/db.js';

/**
 * Check if user has exceeded rate limits for bulk uploads
 * @param {string} userId - User UUID
 * @param {string} role - User role (ADMIN or EVENT_MANAGER)
 * @returns {Promise<Object>} - { allowed: boolean, reason: string, cooldown_minutes: number }
 */
export const checkRateLimit = async (userId, role) => {
  // Admins have no rate limits
  if (role === 'ADMIN') {
    return { allowed: true };
  }

  // Check 15-minute cooldown for event managers
  const recentUpload = await pool`
    SELECT created_at 
    FROM bulk_registration_logs
    WHERE uploaded_by_user_id = ${userId}
      AND uploaded_by_role = ${role}
      AND total_students_attempted >= 50
      AND created_at > NOW() - INTERVAL '15 minutes'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (recentUpload.length > 0) {
    const uploadedAt = new Date(recentUpload[0].created_at);
    const minutesAgo = Math.floor((Date.now() - uploadedAt.getTime()) / 60000);
    const cooldownRemaining = 15 - minutesAgo;

    return {
      allowed: false,
      reason: `Rate limit: Please wait ${cooldownRemaining} more minute(s) before uploading again`,
      cooldown_minutes: cooldownRemaining
    };
  }

  // Check daily limit (20 uploads per day)
  const todayUploads = await pool`
    SELECT COUNT(*) as count 
    FROM bulk_registration_logs
    WHERE uploaded_by_user_id = ${userId}
      AND uploaded_by_role = ${role}
      AND created_at > NOW() - INTERVAL '24 hours'
  `;

  const uploadCount = parseInt(todayUploads[0].count);

  if (uploadCount >= 20) {
    return {
      allowed: false,
      reason: 'Daily limit reached: Maximum 20 bulk uploads per day. Try again tomorrow.',
      daily_count: uploadCount
    };
  }

  // Check daily student limit (5000 students per day)
  const todayStudents = await pool`
    SELECT COALESCE(SUM(successful_registrations), 0) as total_students
    FROM bulk_registration_logs
    WHERE uploaded_by_user_id = ${userId}
      AND uploaded_by_role = ${role}
      AND created_at > NOW() - INTERVAL '24 hours'
  `;

  const studentCount = parseInt(todayStudents[0].total_students);

  if (studentCount >= 5000) {
    return {
      allowed: false,
      reason: 'Daily student limit reached: Maximum 5000 students per day. Try again tomorrow.',
      daily_students: studentCount
    };
  }

  return {
    allowed: true,
    daily_count: uploadCount,
    daily_students: studentCount
  };
};

/**
 * Validate event eligibility for bulk registration
 * @param {string} eventId - Event UUID
 * @param {string} userId - User UUID (null for admin)
 * @param {string} role - User role
 * @returns {Promise<Object>} - Validation result with event data
 */
export const validateEventEligibility = async (eventId, userId = null, role = 'ADMIN') => {
  // Fetch event with manager details
  const events = await pool`
    SELECT 
      e.*,
      em.school_id as manager_school_id,
      em.full_name as manager_name
    FROM events e
    LEFT JOIN event_managers em ON e.created_by_manager_id = em.id
    WHERE e.id = ${eventId}
  `;

  if (events.length === 0) {
    throw new Error('Event not found');
  }

  const event = events[0];

  // Event managers: check ownership
  if (role === 'EVENT_MANAGER') {
    if (event.created_by_manager_id !== userId) {
      throw new Error('Unauthorized: You can only register students to your own events');
    }

    // Event managers: check event status (only DRAFT or REJECTED allowed)
    if (!['DRAFT', 'REJECTED'].includes(event.status)) {
      throw new Error(`Cannot register students to events with status: ${event.status}. Only DRAFT and REJECTED events can be modified.`);
    }
  }

  // Check if event accepts registrations (must be DRAFT, REJECTED, APPROVED, or ACTIVE)
  const validStatuses = ['DRAFT', 'REJECTED', 'APPROVED', 'ACTIVE'];
  if (!validStatuses.includes(event.status)) {
    throw new Error(`Event status ${event.status} does not accept registrations`);
  }

  return {
    event,
    school_id: event.manager_school_id,
    can_register: true
  };
};

/**
 * Validate and fetch students by registration numbers
 * @param {Array} registrationNumbers - Array of registration numbers
 * @param {string} schoolId - School UUID for filtering (null for admin - all schools)
 * @returns {Promise<Object>} - { validStudents, invalidRegistrationNumbers, schoolMismatches }
 */
export const validateAndFetchStudents = async (registrationNumbers, schoolId = null) => {
  // Fetch students from database with optional school filter
  const query = schoolId
    ? pool`
        SELECT 
          s.id, 
          s.registration_no, 
          s.school_id, 
          s.full_name,
          s.email
        FROM students s
        WHERE s.registration_no = ANY(${registrationNumbers})
          AND s.school_id = ${schoolId}
      `
    : pool`
        SELECT 
          s.id, 
          s.registration_no, 
          s.school_id, 
          s.full_name,
          s.email
        FROM students s
        WHERE s.registration_no = ANY(${registrationNumbers})
      `;

  const students = await query;

  const foundRegNos = students.map(s => s.registration_no);
  const notFoundRegNos = registrationNumbers.filter(rn => !foundRegNos.includes(rn));

  // If school filtering is enabled, check for students that exist but in different school
  let schoolMismatches = [];
  if (schoolId && notFoundRegNos.length > 0) {
    const mismatched = await pool`
      SELECT registration_no, school_id
      FROM students
      WHERE registration_no = ANY(${notFoundRegNos})
    `;
    schoolMismatches = mismatched.map(s => s.registration_no);
  }

  return {
    validStudents: students,
    invalidRegistrationNumbers: notFoundRegNos.filter(rn => !schoolMismatches.includes(rn)),
    schoolMismatches
  };
};

/**
 * Check which students are already registered for the event
 * @param {string} eventId - Event UUID
 * @param {Array} studentIds - Array of student UUIDs
 * @returns {Promise<Array>} - Array of student IDs already registered
 */
export const checkExistingRegistrations = async (eventId, studentIds) => {
  const existing = await pool`
    SELECT student_id 
    FROM event_registrations
    WHERE event_id = ${eventId}
      AND student_id = ANY(${studentIds})
  `;

  return existing.map(e => e.student_id);
};

/**
 * Check if bulk upload would exceed event capacity
 * @param {Object} event - Event object with max_capacity and current_registrations
 * @param {number} newRegistrationsCount - Number of new registrations to add
 * @param {boolean} bypassCapacity - Admin bypass flag
 * @returns {Object} - { allowed: boolean, reason: string, capacity_exceeded: boolean }
 */
export const checkCapacityLimit = (event, newRegistrationsCount, bypassCapacity = false) => {
  if (bypassCapacity) {
    return { allowed: true, capacity_overridden: true };
  }

  if (!event.max_capacity) {
    return { allowed: true, capacity_exceeded: false };
  }

  const afterRegistration = event.current_registrations + newRegistrationsCount;
  
  if (afterRegistration > event.max_capacity) {
    return {
      allowed: false,
      reason: `Capacity exceeded: Event capacity is ${event.max_capacity}, currently ${event.current_registrations}. Adding ${newRegistrationsCount} would exceed capacity.`,
      capacity_exceeded: true,
      available_slots: event.max_capacity - event.current_registrations
    };
  }

  return { allowed: true, capacity_exceeded: false };
};

/**
 * Check cumulative uploads in 24-hour window (security measure)
 * @param {string} eventId - Event UUID
 * @param {string} userId - User UUID
 * @param {number} newCount - New upload count
 * @returns {Promise<Object>} - { total_in_window: number, attention_required: boolean }
 */
export const checkCumulativeLimit = async (eventId, userId, newCount) => {
  const recentUploads = await pool`
    SELECT COALESCE(SUM(successful_registrations), 0) as total_students
    FROM bulk_registration_logs
    WHERE event_id = ${eventId}
      AND uploaded_by_user_id = ${userId}
      AND created_at > NOW() - INTERVAL '24 hours'
  `;

  const totalInWindow = parseInt(recentUploads[0].total_students) + newCount;
  
  // Flag if cumulative > 500 in 24h (potential abuse)
  const attentionRequired = totalInWindow > 500;

  return {
    total_in_window: totalInWindow,
    attention_required: attentionRequired
  };
};

/**
 * Get eligibility check for event manager
 * @param {string} eventId - Event UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Object>} - Comprehensive eligibility status
 */
export const getEligibilityStatus = async (eventId, userId) => {
  try {
    // Check event eligibility
    const { event, school_id } = await validateEventEligibility(eventId, userId, 'EVENT_MANAGER');

    // Check rate limits
    const rateLimit = await checkRateLimit(userId, 'EVENT_MANAGER');

    // Get recent upload stats
    const recentStats = await pool`
      SELECT 
        COUNT(*) as upload_count,
        COALESCE(SUM(successful_registrations), 0) as student_count
      FROM bulk_registration_logs
      WHERE uploaded_by_user_id = ${userId}
        AND created_at > NOW() - INTERVAL '24 hours'
    `;

    const stats = recentStats[0];

    return {
      can_upload: rateLimit.allowed && ['DRAFT', 'REJECTED'].includes(event.status),
      constraints: {
        rate_limit: {
          allowed: rateLimit.allowed,
          reason: rateLimit.reason,
          cooldown_remaining: rateLimit.cooldown_minutes || 0,
          daily_count: parseInt(stats.upload_count),
          daily_count_max: 20,
          daily_students: parseInt(stats.student_count),
          daily_students_max: 5000
        },
        event_status: {
          current: event.status,
          can_bulk_register: ['DRAFT', 'REJECTED'].includes(event.status),
          reason: ['DRAFT', 'REJECTED'].includes(event.status) 
            ? 'Event is in editable state' 
            : 'Only DRAFT and REJECTED events can be modified'
        },
        capacity: {
          current: event.current_registrations,
          max: event.max_capacity,
          available: event.max_capacity ? (event.max_capacity - event.current_registrations) : null,
          requires_approval_if_over: 200
        }
      },
      event: {
        id: event.id,
        event_name: event.event_name,
        event_code: event.event_code,
        status: event.status
      }
    };
  } catch (error) {
    throw error;
  }
};

export default {
  checkRateLimit,
  validateEventEligibility,
  validateAndFetchStudents,
  checkExistingRegistrations,
  checkCapacityLimit,
  checkCumulativeLimit,
  getEligibilityStatus
};
