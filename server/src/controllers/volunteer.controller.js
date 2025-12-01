import Volunteer from '../models/Volunteer.model.js';
import Student from '../models/Student.model.js';
import Stall from '../models/Stall.model.js';
import CheckInOut from '../models/CheckInOut.model.js';
import EventVolunteerModel from '../models/EventVolunteer.model.js';
import EventRegistrationModel from '../models/EventRegistration.model.js';
import QRCodeService from '../services/qrCode.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { successResponse, errorResponse } from '../helpers/response.js';
import { setAuthCookie, clearAuthCookie } from '../helpers/cookie.js';
import { query } from '../config/db.js';

/**
 * Volunteer Controller
 * Handles volunteer authentication, QR code scanning and check-in/out
 */

/**
 * Volunteer login
 * @route POST /api/volunteer/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 'Email and password are required', 400);
    }

    const volunteer = await Volunteer.findByEmail(email, query);
    if (!volunteer) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    // Check if volunteer is active
    if (!volunteer.is_active) {
      return errorResponse(res, 'Account is deactivated. Contact admin.', 403);
    }

    // Verify password using model method
    const isValidPassword = await volunteer.comparePassword(password);
    if (!isValidPassword) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    // Check if password reset is required (first login with default password)
    if (volunteer.password_reset_required) {
      // Issue short-lived token for verification
      const token = jwt.sign(
        { 
          id: volunteer.id, 
          email: volunteer.email,
          role: volunteer.role,
          requires_verification: true
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      // Set secure HTTP-Only cookie (so frontend can use it automatically)
      setAuthCookie(res, token);

      return successResponse(res, {
        token,
        requires_verification: true,
        volunteer: {
          id: volunteer.id,
          email: volunteer.email,
          full_name: volunteer.full_name
        },
        message: 'Please verify your identity with event code and phone number'
      }, 'Identity verification required');
    }

    const token = jwt.sign(
      { 
        id: volunteer.id, 
        email: volunteer.email,
        role: volunteer.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set secure HTTP-Only cookie
    setAuthCookie(res, token);

    return successResponse(res, {
      token,
      volunteer: {
        id: volunteer.id,
        email: volunteer.email,
        full_name: volunteer.full_name,
        phone: volunteer.phone,
        assigned_location: volunteer.assigned_location,
        event_id: volunteer.event_id,
        total_scans_performed: volunteer.total_scans_performed
      }
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Volunteer registration
 * @route POST /api/volunteer/register
 */
const register = async (req, res, next) => {
  try {
    const { email, password, full_name, phone, assigned_location } = req.body;

    if (!email || !password || !full_name) {
      return errorResponse(res, 'Email, password, and full name are required', 400);
    }

    // Check if volunteer already exists
    const existingVolunteer = await Volunteer.findByEmail(email, query);
    if (existingVolunteer) {
      return errorResponse(res, 'Email already registered', 409);
    }

    // Create volunteer using model method (handles password hashing)
    const newVolunteer = await Volunteer.create({
      email,
      password,
      full_name,
      phone,
      assigned_location
    }, query);

    // Generate token
    const token = jwt.sign(
      { 
        id: newVolunteer.id, 
        email: newVolunteer.email,
        role: newVolunteer.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set secure HTTP-Only cookie
    setAuthCookie(res, token);

    return successResponse(res, {
      token,
      volunteer: {
        id: newVolunteer.id,
        email: newVolunteer.email,
        full_name: newVolunteer.full_name,
        phone: newVolunteer.phone,
        assigned_location: newVolunteer.assigned_location
      }
    }, 'Registration successful', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get volunteer profile
 * @route GET /api/volunteer/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const volunteer = await Volunteer.findById(req.user.id, query);
    if (!volunteer) {
      return errorResponse(res, 'Volunteer not found', 404);
    }

    return successResponse(res, {
      id: volunteer.id,
      email: volunteer.email,
      full_name: volunteer.full_name,
      phone: volunteer.phone,
      assigned_location: volunteer.assigned_location,
      is_active: volunteer.is_active,
      total_scans_performed: volunteer.total_scans_performed,
      created_at: volunteer.created_at
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Volunteer logout
 * @route POST /api/volunteer/logout
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
 * Smart scan - Automatically handles check-in OR check-out
 * @route POST /api/volunteer/scan/student
 * @access Protected (Volunteer only - enforced by authorizeRoles middleware)
 * 
 * @description
 * Allows authenticated volunteers to scan ANY student's QR code for entry/exit management.
 * The QR code token contains the student's registration number, which is used to identify
 * and process the check-in/out operation.
 * 
 * Security Model:
 * - JWT token validates the VOLUNTEER role (via middleware)
 * - QR token identifies the STUDENT being scanned
 * - No need to verify volunteer owns the QR code (volunteers scan other people)
 * 
 * Flow:
 * 1. Decode QR token to extract student registration number
 * 2. Find student in database
 * 3. Determine action (ENTRY if outside, EXIT if inside)
 * 4. Process check-in/out and update timestamps
 * 5. Calculate duration for EXIT actions
 * 6. Update volunteer scan count
 * 
 * @param {string} req.body.qr_code_token - JWT token from student's QR code
 * @returns {Object} Student info, action type (ENTRY/EXIT), scan details
 */
const scanStudentQR = async (req, res, next) => {
  try {
    const { qr_code_token } = req.body;

    if (!qr_code_token) {
      return errorResponse(res, 'QR code token is required', 400);
    }

    console.log('🔍 [SCAN] Received QR token (first 50 chars):', qr_code_token.substring(0, 50) + '...');

    // 1️⃣ Verify QR code token (try rotating first, fallback to static)
    let decoded = QRCodeService.verifyRotatingStudentToken(qr_code_token);
    
    // If not a valid rotating token, try static token verification
    if (!decoded.valid && decoded.isStatic) {
      console.log('🔄 [SCAN] Not a rotating token, trying static verification...');
      decoded = await QRCodeService.verifyStudentQRToken(qr_code_token);
    }
    
    if (!decoded || !decoded.valid) {
      console.log('❌ [SCAN] Invalid QR token');
      return errorResponse(res, 'Invalid QR code', 400);
    }

    console.log('✅ [SCAN] QR token verified:', decoded.registration_no);

    // 2️⃣ Find student by registration number
    const student = await Student.findByRegistrationNo(decoded.registration_no, query);
    
    if (!student) {
      console.log('❌ [SCAN] Student not found:', decoded.registration_no);
      
      // Debug: Check if ANY students exist
      const sampleStudents = await query('SELECT registration_no, full_name FROM students LIMIT 5');
      console.log('📊 [DEBUG] Sample students in database:', sampleStudents);
      
      return errorResponse(res, `Student not found. Registration: ${decoded.registration_no}`, 404);
    }

    console.log('✅ [SCAN] Student found:', student.full_name);

    // 3️⃣ Verify volunteer is active (optional check, can be removed if not needed)
    const volunteer = await Volunteer.findById(req.user.id, query);
    if (volunteer && !volunteer.is_active) {
      console.log('⚠️ [SCAN] Inactive volunteer attempted scan:', volunteer.email);
      return errorResponse(res, 'Your volunteer account is inactive. Contact admin.', 403);
    }

    if (volunteer) {
      console.log('✅ [SCAN] Volunteer:', volunteer.full_name, '| Location:', volunteer.assigned_location);
    }

    // 🔒 CRITICAL: Multi-Event Context Validation (Security Layer)
    const volunteerAssignment = await EventVolunteerModel.findActiveAssignment(req.user.id);
    let eventContext = null;

    if (volunteerAssignment) {
      console.log(`🎯 [SCAN] Volunteer assigned to event: ${volunteerAssignment.event_name} (${volunteerAssignment.event_type})`);
      
      // Verify student is registered for THIS specific event
      const registration = await EventRegistrationModel.findByEventAndStudent(
        volunteerAssignment.event_id,
        student.id
      );

      if (!registration) {
        console.log(`❌ [SCAN] Student not registered for event: ${volunteerAssignment.event_name}`);
        return errorResponse(res, 
          `Student is not registered for "${volunteerAssignment.event_name}". Please register first.`, 
          403
        );
      }

      // For paid events, verify payment is completed
      if (registration.registration_type === 'PAID') {
        if (registration.payment_status !== 'COMPLETED') {
          console.log(`❌ [SCAN] Payment not completed for paid event`);
          return errorResponse(res, 
            `Payment pending for "${volunteerAssignment.event_name}". Amount: ${volunteerAssignment.currency} ${volunteerAssignment.price}`, 
            402 // Payment Required
          );
        }
        console.log(`✅ [SCAN] Payment verified: ${registration.payment_status}`);
      }

      console.log(`✅ [SCAN] Student authorized for event: ${volunteerAssignment.event_name}`);
      eventContext = volunteerAssignment;
    } else {
      console.log('ℹ️ [SCAN] No active event assignment - using legacy single-event mode');
    }

    // 4️⃣ 🎯 SMART LOGIC: Determine action based on current status
    const isCurrentlyInside = student.is_inside_event;
    const action = isCurrentlyInside ? 'EXIT' : 'ENTRY';
    
    console.log(`🎯 [SCAN] Current status: ${isCurrentlyInside ? 'INSIDE' : 'OUTSIDE'}`);
    console.log(`🎯 [SCAN] Action to perform: ${action}`);

    // 5️⃣ Store the check-in time BEFORE updating (for duration calculation)
    const previousCheckInTime = student.last_checkin_at;

    // 6️⃣ Process check-in/out FIRST (toggles is_inside_event automatically and updates timestamps)
    const updatedStudent = await Student.processCheckInOut(student.id, query);

    // 7️⃣ Calculate duration AFTER checkout using the previous check-in time
    let durationMinutes = 0;
    let checkInOutRecord = null;

    if (action === 'ENTRY') {
      // 🔥 FIX: Save check-in record to database with event context
      checkInOutRecord = await CheckInOut.create({
        student_id: student.id,
        volunteer_id: req.user.id,
        event_id: eventContext?.event_id || null, // ✅ Add event context for multi-event tracking
        scan_type: 'CHECKIN',
        scan_number: updatedStudent.total_scan_count,
        duration_minutes: null
      }, query);
      
      console.log('✅ [DB] Check-in record saved:', checkInOutRecord.id);
      if (eventContext) {
        console.log(`✅ [DB] Event context recorded: ${eventContext.event_name}`);
      }
      
    } else if (action === 'EXIT' && previousCheckInTime) {
      const MAX_DURATION_HOURS = 10;
      const MAX_DURATION_MINUTES = MAX_DURATION_HOURS * 60; // 600 minutes
      
      const checkInTime = new Date(previousCheckInTime);
      const checkOutTime = new Date(updatedStudent.last_checkout_at);
      const actualDurationMinutes = Math.floor((checkOutTime - checkInTime) / (1000 * 60));
      
      // Cap duration at 10 hours
      durationMinutes = Math.min(actualDurationMinutes, MAX_DURATION_MINUTES);
      const wasCapped = actualDurationMinutes > MAX_DURATION_MINUTES;
      
      console.log(`⏱️ [SCAN] Actual duration: ${actualDurationMinutes} minutes (${Math.floor(actualDurationMinutes / 60)}h ${actualDurationMinutes % 60}m)`);
      if (wasCapped) {
        console.log(`⚠️ [SCAN] Duration capped at ${MAX_DURATION_HOURS} hours for leaderboard fairness`);
      }
      console.log(`⏱️ [SCAN] Check-in: ${checkInTime.toISOString()}, Check-out: ${checkOutTime.toISOString()}`);
      
      // 🔥 FIX: Save check-out record to database with event context
      checkInOutRecord = await CheckInOut.create({
        student_id: student.id,
        volunteer_id: req.user.id,
        event_id: eventContext?.event_id || null, // ✅ Add event context for multi-event tracking
        scan_type: 'CHECKOUT',
        scan_number: updatedStudent.total_scan_count,
        duration_minutes: durationMinutes // Capped duration
      }, query);
      
      console.log('✅ [DB] Check-out record saved:', checkInOutRecord.id);
      if (eventContext) {
        console.log(`✅ [DB] Event context recorded: ${eventContext.event_name}`);
      }
      
      // Update total active duration with CAPPED duration
      await Student.updateActiveDuration(student.id, durationMinutes, query);
    }

    // 8️⃣ Update volunteer's scan count
    await query(
      'UPDATE volunteers SET total_scans_performed = total_scans_performed + 1 WHERE id = $1',
      [req.user.id]
    );

    console.log(`✅ [SCAN] ${action} successful for ${student.full_name}`);

    // 9️⃣ Return different response based on action
    const responseData = {
      student: {
        id: updatedStudent.id,
        full_name: updatedStudent.full_name,
        registration_no: updatedStudent.registration_no,
        school_name: updatedStudent.school_name,
        is_inside_event: updatedStudent.is_inside_event,
        total_scan_count: updatedStudent.total_scan_count
      },
      action: action,
      scan_details: {
        timestamp: new Date().toISOString(),
        volunteer_id: req.user.id,
        volunteer_email: req.user.email
      }
    };

    // Add action-specific fields
    if (action === 'ENTRY') {
      responseData.student.check_in_time = updatedStudent.last_checkin_at;
      responseData.message = `Welcome ${student.full_name}! Enjoy the event.`;
    } else {
      responseData.student.check_out_time = updatedStudent.last_checkout_at;
      responseData.student.duration_minutes = durationMinutes;
      responseData.student.duration_formatted = `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;
      responseData.message = `Goodbye ${student.full_name}! You spent ${responseData.student.duration_formatted} at the event.`;
    }

    return successResponse(
      res, 
      responseData,
      action === 'ENTRY' 
        ? 'Student checked in successfully at entry gate' 
        : 'Student checked out successfully at exit gate',
      action === 'ENTRY' ? 201 : 200
    );

  } catch (error) {
    console.error('❌ [SCAN] Error:', error);
    next(error);
  }
};

/**
 * Scan stall QR code and verify
 * @route POST /api/volunteer/scan/stall
 */
const scanStallQR = async (req, res, next) => {
  try {
    const { qr_code_token } = req.body;

    if (!qr_code_token) {
      return errorResponse(res, 'QR code token is required', 400);
    }

    // Verify QR code token
    const decoded = await QRCodeService.verifyStallQRToken(qr_code_token);
    if (!decoded) {
      return errorResponse(res, 'Invalid QR code', 400);
    }

    // Find stall
    const stall = await Stall.findByQRToken(qr_code_token, query);
    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    return successResponse(res, {
      stall: {
        id: stall.id,
        stall_name: stall.stall_name,
        stall_number: stall.stall_number,
        school_name: stall.school_name,
        description: stall.description
      }
    }, 'QR code verified successfully');
  } catch (error) {
    next(error);
  }
};



/**
 * Get volunteer's check-in history
 * @route GET /api/volunteer/history
 */
const getHistory = async (req, res, next) => {
  try {
    // Verify volunteer exists
    const volunteer = await Volunteer.findById(req.user.id, query);
    if (!volunteer) {
      return errorResponse(res, 'Volunteer not found', 404);
    }

    // Get volunteer's current active event assignment
    const assignment = await EventVolunteerModel.findActiveAssignment(req.user.id, query);
    if (!assignment) {
      return errorResponse(res, 'No active event assignment found', 404);
    }

    // Get history filtered by current event
    const history = await CheckInOut.findByVolunteerAndEvent(
      req.user.id,
      assignment.event_id,
      query
    );
    
    return successResponse(res, {
      volunteer_id: req.user.id,
      volunteer_name: volunteer.full_name,
      event_id: assignment.event_id,
      event_name: assignment.event_name,
      total_scans: history.length,
      history: history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get events assigned to volunteer
 * @route GET /api/volunteer/assigned-events
 */
const getAssignedEvents = async (req, res, next) => {
  try {
    const volunteerId = req.user.id;
    const { event_status } = req.query;

    const events = await EventVolunteerModel.getVolunteerEvents(volunteerId, {
      event_status,
      is_active: true
    });

    return successResponse(res, {
      total_events: events.length,
      events,
      note: 'Use universal /scan/student endpoint for all scanning operations'
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// MANAGEMENT OPERATIONS (Admin and Event Manager only)
// ============================================================

/**
 * Get all volunteers
 * @route GET /api/volunteer
 */
const getAllVolunteers = async (req, res, next) => {
  try {
    const { is_active, event_id } = req.query;

    let volunteers;
    if (is_active === 'true') {
      volunteers = await Volunteer.findAllActive(query);
    } else {
      volunteers = await Volunteer.findAll(query);
    }

    // If event_id is provided, get only volunteers assigned to that event
    if (event_id) {
      const eventVolunteers = await query(
        'SELECT volunteer_id FROM event_volunteers WHERE event_id = $1 AND is_active = true',
        [event_id]
      );
      const volunteerIds = new Set(eventVolunteers.map(ev => ev.volunteer_id));
      volunteers = volunteers.filter(v => volunteerIds.has(v.id));
    }

    // Get event assignments for each volunteer
    const volunteersWithEvents = await Promise.all(volunteers.map(async (v) => {
      const events = await EventVolunteerModel.getVolunteerEvents(v.id, { is_active: true });
      return {
        id: v.id,
        email: v.email,
        full_name: v.full_name,
        phone: v.phone,
        assigned_location: v.assigned_location,
        is_active: v.is_active,
        total_scans_performed: v.total_scans_performed,
        assigned_events: events.map(e => ({
          event_id: e.event_id,
          event_name: e.event_name,
          event_type: e.event_type,
          assigned_location: e.assigned_location,
          total_scans_for_event: e.total_scans_for_event
        })),
        created_at: v.created_at
      };
    }));

    return successResponse(res, {
      total: volunteersWithEvents.length,
      volunteers: volunteersWithEvents
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get volunteer by ID
 * @route GET /api/volunteer/:id
 */
const getVolunteerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const volunteer = await Volunteer.findById(id, query);
    if (!volunteer) {
      return errorResponse(res, 'Volunteer not found', 404);
    }

    // Get event assignments
    const events = await EventVolunteerModel.getVolunteerEvents(id, { is_active: true });

    return successResponse(res, {
      id: volunteer.id,
      email: volunteer.email,
      full_name: volunteer.full_name,
      phone: volunteer.phone,
      assigned_location: volunteer.assigned_location,
      is_active: volunteer.is_active,
      total_scans_performed: volunteer.total_scans_performed,
      assigned_events: events.map(e => ({
        event_id: e.event_id,
        event_name: e.event_name,
        event_type: e.event_type,
        assigned_location: e.assigned_location,
        total_scans_for_event: e.total_scans_for_event,
        assigned_at: e.assigned_at
      })),
      created_at: volunteer.created_at,
      updated_at: volunteer.updated_at
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new volunteer
 * @route POST /api/volunteer
 */
const createVolunteer = async (req, res, next) => {
  try {
    const { email, password, full_name, phone, assigned_location, event_id } = req.body;

    // Validate required fields
    if (!email || !full_name || !event_id) {
      return errorResponse(res, 'Email, full name, and event_id are required', 400);
    }

    // Check if volunteer already exists
    const existingVolunteer = await Volunteer.findByEmail(email, query);
    if (existingVolunteer) {
      return errorResponse(res, 'Email already registered', 409);
    }

    // Verify event exists and get event_code
    const eventCheck = await query('SELECT id, event_name, event_code FROM events WHERE id = $1', [event_id]);
    if (eventCheck.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }
    const event_code = eventCheck[0].event_code;

    // Check if password was provided
    const wasPasswordProvided = password && password.trim() !== '';

    // Create volunteer (let model generate password if not provided)
    const newVolunteer = await Volunteer.create({
      email,
      ...(wasPasswordProvided && { password }), // Only pass password if provided
      full_name,
      phone,
      assigned_location,
      event_id,
      event_code // For password generation
    }, query);

    // Get the generated password for response (if it was auto-generated)
    const generatedPassword = !wasPasswordProvided 
      ? Volunteer.generateDefaultPassword({ full_name, event_code })
      : null;

    // Create event_volunteer assignment
    // Note: assigned_by_manager_id should be NULL for ADMINs (not in event_managers table)
    let eventAssignment = null;
    const assignedByManagerId = req.user.role === 'EVENT_MANAGER' ? req.user.id : null;
    
    eventAssignment = await EventVolunteerModel.assignVolunteer(
      event_id,
      newVolunteer.id,
      assignedByManagerId,
      { assigned_location: assigned_location || null }
    );

    return successResponse(res, {
      id: newVolunteer.id,
      email: newVolunteer.email,
      full_name: newVolunteer.full_name,
      phone: newVolunteer.phone,
      assigned_location: newVolunteer.assigned_location,
      event_id: newVolunteer.event_id,
      is_active: newVolunteer.is_active,
      password_reset_required: newVolunteer.password_reset_required,
      ...(generatedPassword && { generated_password: generatedPassword }),
      event_assignment: {
        event_id: eventAssignment.event_id,
        event_name: eventCheck[0].event_name,
        event_code: event_code,
        assigned_at: eventAssignment.assigned_at
      }
    }, generatedPassword 
      ? `Volunteer created with default password: ${generatedPassword}` 
      : 'Volunteer created successfully', 201);
  } catch (error) {
    next(error);
  }
};
 

/**
 * Update volunteer
 * @route PUT /api/volunteer/:id
 */
const updateVolunteer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, assigned_location, is_active } = req.body;

    // Check if volunteer exists
    const existingVolunteer = await Volunteer.findById(id, query);
    if (!existingVolunteer) {
      return errorResponse(res, 'Volunteer not found', 404);
    }

    // If email is being updated, check for conflicts
    if (email && email !== existingVolunteer.email) {
      const emailExists = await Volunteer.findByEmail(email, query);
      if (emailExists) {
        return errorResponse(res, 'Email already in use', 409);
      }
    }

    // Update volunteer
    const updatedVolunteer = await Volunteer.update(id, {
      full_name,
      email,
      phone,
      assigned_location,
      is_active
    }, query);

    return successResponse(res, {
      id: updatedVolunteer.id,
      email: updatedVolunteer.email,
      full_name: updatedVolunteer.full_name,
      phone: updatedVolunteer.phone,
      assigned_location: updatedVolunteer.assigned_location,
      is_active: updatedVolunteer.is_active,
      total_scans_performed: updatedVolunteer.total_scans_performed,
      updated_at: updatedVolunteer.updated_at
    }, 'Volunteer updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Delete volunteer (soft delete - mark inactive)
 * @route DELETE /api/volunteer/:id
 */
const deleteVolunteer = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if volunteer exists
    const volunteer = await Volunteer.findById(id, query);
    if (!volunteer) {
      return errorResponse(res, 'Volunteer not found', 404);
    }

    // Soft delete - mark as inactive
    await Volunteer.update(id, { is_active: false }, query);

    return successResponse(res, null, 'Volunteer deleted (soft delete - marked inactive)');
  } catch (error) {
    next(error);
  }
};

/**
 * Verify volunteer identity (event_code + phone number)
 * @route POST /api/volunteer/verify-identity
 */
const verifyIdentity = async (req, res, next) => {
  try {
    const { event_code, phone } = req.body;

    if (!event_code || !phone) {
      return errorResponse(res, 'Event code and phone number are required for verification', 400);
    }

    // Get volunteer
    const volunteer = await Volunteer.findById(req.user.id, query);
    if (!volunteer) {
      return errorResponse(res, 'Volunteer not found', 404);
    }

    // Get event_code from volunteer's assigned event
    const eventResult = await query('SELECT event_code FROM events WHERE id = $1', [volunteer.event_id]);
    if (eventResult.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Verify event_code matches
    if (eventResult[0].event_code !== event_code) {
      return errorResponse(res, 'Event code does not match', 401);
    }

    // Verify phone matches
    if (volunteer.phone !== phone) {
      return errorResponse(res, 'Phone number does not match our records', 401);
    }

    // Issue full access token after verification
    const token = jwt.sign(
      { 
        id: volunteer.id, 
        email: volunteer.email,
        role: volunteer.role,
        verified: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    setAuthCookie(res, token);

    return successResponse(res, {
      token,
      verified: true,
      message: 'Identity verified. You can now reset your password.'
    }, 'Identity verified successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password (after verification) - Updates password directly
 * @route POST /api/volunteer/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body;

    if (!new_password) {
      return errorResponse(res, 'New password is required', 400);
    }

    if (new_password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', 400);
    }

    // Get volunteer
    const volunteer = await Volunteer.findById(req.user.id, query);
    if (!volunteer) {
      return errorResponse(res, 'Volunteer not found', 404);
    }

    // Update password directly (clears password_reset_required flag)
    await Volunteer.changePassword(req.user.id, new_password, query);

    return successResponse(res, null, 'Password changed successfully. You can now login with your new password.');
  } catch (error) {
    next(error);
  }
};

/**
 * Admin/Manager reset volunteer password to default (no re-verification needed)
 * @route POST /api/volunteer/:id/reset-to-default
 */
const resetToDefaultPassword = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Admin can directly reset without requiring volunteer to verify again
    // Just sets password_reset_required = true for next login
    const result = await Volunteer.resetToDefaultPassword(id, query);

    return successResponse(res, {
      default_password: result.default_password,
      message: 'Volunteer must verify identity (event_code + phone) on next login to set new password'
    }, `Password reset to default: ${result.default_password}`);
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  register,
  logout,
  getProfile,
  scanStudentQR,  // ✅ Universal scanner - handles ALL scenarios
  scanStallQR,
  getHistory,
  // Multi-event support
  getAssignedEvents,  // Volunteers can see their assigned events
  // Management operations (ADMIN, EVENT_MANAGER only)
  getAllVolunteers,
  getVolunteerById,
  createVolunteer,
  updateVolunteer,
  deleteVolunteer,
  // Password management
  verifyIdentity,           // Verify identity with event_code + phone
  resetPassword,            // Reset password after verification
  resetToDefaultPassword    // Admin resets to default password
};
