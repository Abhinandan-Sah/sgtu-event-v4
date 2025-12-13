// Event Manager Controller - Event creation, volunteer assignment, analytics
import { pool, query } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { successResponse, errorResponse, validationErrorResponse } from '../helpers/response.js';
import School from '../models/School.model.js';
import { setAuthCookie, clearAuthCookie } from '../helpers/cookie.js';
import {
  EventManagerModel,
  EventModel,
  EventVolunteerModel,
  EventRegistrationModel
} from '../models/index.js';
import EventRegistration from '../models/EventRegistration.model.js';
import { logAuditEvent, AuditEventType } from '../utils/auditLogger.js';
import { uploadEventBanner, uploadEventImage } from '../services/cloudinary.js';
import {
  parseEventRegistrationFile,
  generateEventRegistrationTemplate,
  validateEventRegistrationData
} from '../utils/excelParser.js';
import {
  checkRateLimit,
  validateEventEligibility,
  validateAndFetchStudents,
  checkExistingRegistrations,
  checkCapacityLimit,
  checkCumulativeLimit,
  getEligibilityStatus
} from '../services/bulkRegistrationService.js';

class EventManagerController {
  /**
   * Login event manager
   * POST /api/event-managers/login
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        return validationErrorResponse(res, [
          { msg: 'Email and password are required' }
        ]);
      }

      // Find manager
      const manager = await EventManagerModel.findByEmail(email);
      if (!manager) {
        return errorResponse(res, 'Invalid credentials', 401);
      }

      // Check if account is active
      if (!manager.is_active) {
        return errorResponse(res, 'Account is deactivated. Contact admin.', 403);
      }

      // Verify password
      const isValid = await EventManagerModel.verifyPassword(password, manager.password_hash);
      if (!isValid) {
        return errorResponse(res, 'Invalid credentials', 401);
      }

      // Check if password reset is required
      if (manager.password_reset_required) {
        // Generate limited token for identity verification only
        const limitedToken = jwt.sign(
          {
            id: manager.id,
            email: manager.email,
            role: manager.role,
            limited_access: true
          },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );

        // Set HTTP-only cookie (so frontend can use it automatically)
        setAuthCookie(res, limitedToken);

        return successResponse(
          res,
          {
            token: limitedToken,
            password_reset_required: true,
            manager: {
              id: manager.id,
              email: manager.email,
              full_name: manager.full_name
            },
            message: 'Password reset required. Please verify your identity first.'
          },
          'Login successful - verification required',
          200
        );
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: manager.id,
          email: manager.email,
          role: manager.role
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      // Set HTTP-only cookie
      setAuthCookie(res, token);

      // Get school name if school_id exists
      let schoolName = null;
      if (manager.school_id) {
        const schoolResult = await query('SELECT school_name FROM schools WHERE id = $1', [manager.school_id]);
        if (schoolResult && schoolResult.length > 0) {
          schoolName = schoolResult[0].school_name;
        }
      }

      return successResponse(
        res,
        {
          manager: {
            id: manager.id,
            email: manager.email,
            full_name: manager.full_name,
            school_id: manager.school_id,
            school_name: schoolName,
            role: manager.role,
            is_approved_by_admin: manager.is_approved_by_admin,
            total_events_created: manager.total_events_created
          },
          token,
          approval_status: manager.is_approved_by_admin 
            ? 'approved' 
            : 'pending_approval'
        },
        'Login successful'
      );
    } catch (error) {
      console.error('Event manager login error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Logout event manager
   * POST /api/event-managers/logout
   */
  static async logout(req, res) {
    try {
      clearAuthCookie(res);
      return successResponse(res, null, 'Logged out successfully');
    } catch (error) {
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Verify event manager identity (phone + school_id)
   * POST /api/event-manager/verify-identity
   */
  static async verifyIdentity(req, res) {
    try {
      const { phone, school_id } = req.body;

      if (!phone) {
        return errorResponse(res, 'Phone number is required for verification', 400);
      }

      // Get event manager
      const manager = await EventManagerModel.findById(req.user.id);
      if (!manager) {
        return errorResponse(res, 'Event manager not found', 404);
      }

      // Verify phone matches
      if (manager.phone !== phone) {
        return errorResponse(res, 'Phone number does not match our records', 401);
      }

      // Verify school_id matches (only if manager has school_id)
      if (manager.school_id) {
        if (!school_id) {
          return errorResponse(res, 'School ID is required for verification', 400);
        }
        if (manager.school_id !== school_id) {
          return errorResponse(res, 'School does not match our records', 401);
        }
      } else {
        // Legacy manager without school_id - only verify phone
        console.log(`⚠️ Legacy event manager ${manager.id} verified with phone only (no school_id)`);
      }

      // Issue full access token after verification
      const token = jwt.sign(
        { 
          id: manager.id, 
          email: manager.email,
          role: manager.role,
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
      console.error('Event manager identity verification error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Reset password after identity verification
   * POST /api/event-manager/reset-password
   */
  static async resetPassword(req, res) {
    try {
      const { new_password } = req.body;

      if (!new_password) {
        return errorResponse(res, 'New password is required', 400);
      }

      // Validate password strength
      if (new_password.length < 8) {
        return errorResponse(res, 'Password must be at least 8 characters long', 400);
      }

      const hasUpperCase = /[A-Z]/.test(new_password);
      const hasLowerCase = /[a-z]/.test(new_password);
      const hasNumber = /[0-9]/.test(new_password);
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(new_password);

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
        return errorResponse(
          res,
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
          400
        );
      }

      // Check if user has verified identity
      if (!req.user.verified && req.user.limited_access) {
        return errorResponse(res, 'Please verify your identity first', 403);
      }

      // Update password
      const salt = await bcrypt.genSalt(12);
      const password_hash = await bcrypt.hash(new_password, salt);

      await query(
        'UPDATE event_managers SET password_hash = $1, password_reset_required = false, updated_at = NOW() WHERE id = $2',
        [password_hash, req.user.id]
      );

      return successResponse(res, null, 'Password reset successfully. Please login with your new password.');
    } catch (error) {
      console.error('Event manager password reset error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Logout event manager
   * POST /api/event-managers/logout
   */
  static async logoutOld(req, res) {
    try {
      clearAuthCookie(res);
      return successResponse(res, null, 'Logged out successfully');
    } catch (error) {
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get event manager profile
   * GET /api/event-managers/profile
   */
  static async getProfile(req, res) {
    try {
      const managerId = req.user.id;

      const manager = await EventManagerModel.findById(managerId);
      if (!manager) {
        return errorResponse(res, 'Manager not found', 404);
      }

      // Get stats
      const stats = await EventManagerModel.getStats(managerId);

      // Get school name if school_id exists
      let schoolName = null;
      if (manager.school_id) {
        const schoolResult = await query('SELECT school_name FROM schools WHERE id = $1', [manager.school_id]);
        if (schoolResult && schoolResult.length > 0) {
          schoolName = schoolResult[0].school_name;
        }
      }

      return successResponse(res, {
        manager: {
          id: manager.id,
          email: manager.email,
          full_name: manager.full_name,
          phone: manager.phone,
          school_id: manager.school_id,
          school_name: schoolName,
          role: manager.role,
          is_approved_by_admin: manager.is_approved_by_admin,
          approved_at: manager.approved_at,
          approved_by_admin_name: manager.approved_by_admin_name,
          created_at: manager.created_at
        },
        stats
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Update event manager profile
   * PUT /api/event-managers/profile
   */
  static async updateProfile(req, res) {
    try {
      const managerId = req.user.id;
      const { full_name, phone, organization, password } = req.body;

      const updates = {};
      if (full_name) updates.full_name = full_name;
      if (phone) updates.phone = phone;
      if (organization) updates.organization = organization;
      if (password) updates.password = password;

      const updated = await EventManagerModel.update(managerId, updates);

      return successResponse(res, { manager: updated }, 'Profile updated successfully');
    } catch (error) {
      console.error('Update profile error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Create new event
   * POST /api/event-managers/events
   */
  static async createEvent(req, res) {
    try {
      const managerId = req.user.id;

      // Check if manager is approved and active
      const manager = await EventManagerModel.findById(managerId);
      if (!manager.is_approved_by_admin) {
        return errorResponse(
          res,
          'Your account is not approved by admin. You cannot create events yet.',
          403
        );
      }

      if (!manager.is_active) {
        return errorResponse(
          res,
          'Your account is deactivated. Contact admin to reactivate.',
          403
        );
      }

      const eventData = req.body;

      // Validate required fields
      const required = [
        'event_name', 'event_code', 'event_type',
        'start_date', 'end_date', 'registration_start_date', 'registration_end_date'
      ];

      for (const field of required) {
        if (!eventData[field]) {
          return validationErrorResponse(res, [
            { msg: `${field} is required` }
          ]);
        }
      }

      // Validate event_code format (alphanumeric, hyphens, underscores only)
      const eventCodeRegex = /^[A-Z0-9_-]+$/;
      if (!eventCodeRegex.test(eventData.event_code)) {
        return validationErrorResponse(res, [
          { msg: 'Event code must contain only uppercase letters, numbers, hyphens, and underscores' }
        ]);
      }

      // Validate event_type
      if (!['FREE', 'PAID'].includes(eventData.event_type)) {
        return validationErrorResponse(res, [
          { msg: 'Event type must be either FREE or PAID' }
        ]);
      }

      // Validate price for paid events
      if (eventData.event_type === 'PAID') {
        const price = parseFloat(eventData.price);
        if (isNaN(price) || price <= 0) {
          return validationErrorResponse(res, [
            { msg: 'Paid events must have a price greater than 0' }
          ]);
        }
        if (price > 100000) {
          return validationErrorResponse(res, [
            { msg: 'Price cannot exceed 100,000' }
          ]);
        }
      }

      // Validate dates
      const startDate = new Date(eventData.start_date);
      const endDate = new Date(eventData.end_date);
      const regStartDate = new Date(eventData.registration_start_date);
      const regEndDate = new Date(eventData.registration_end_date);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || 
          isNaN(regStartDate.getTime()) || isNaN(regEndDate.getTime())) {
        return validationErrorResponse(res, [
          { msg: 'Invalid date format' }
        ]);
      }

      if (startDate >= endDate) {
        return validationErrorResponse(res, [
          { msg: 'Event start date must be before end date' }
        ]);
      }

      if (regStartDate >= regEndDate) {
        return validationErrorResponse(res, [
          { msg: 'Registration start date must be before registration end date' }
        ]);
      }

      if (regEndDate > startDate) {
        return validationErrorResponse(res, [
          { msg: 'Registration must close before event starts' }
        ]);
      }

      // Validate max_capacity
      if (eventData.max_capacity !== null && eventData.max_capacity !== undefined) {
        const capacity = parseInt(eventData.max_capacity);
        if (isNaN(capacity) || capacity < 1) {
          return validationErrorResponse(res, [
            { msg: 'Max capacity must be a positive number or null for unlimited' }
          ]);
        }
        if (capacity > 100000) {
          return validationErrorResponse(res, [
            { msg: 'Max capacity cannot exceed 100,000' }
          ]);
        }
      }

      // Check if event code is unique
      const existing = await EventModel.findByCode(eventData.event_code);
      if (existing) {
        return errorResponse(res, 'Event code already exists', 400);
      }

      // Handle banner image upload if provided
      if (eventData.banner_image_base64) {
        try {
          // Create event first to get event ID for Cloudinary folder
          const tempEvent = await EventModel.create({ ...eventData, banner_image_url: null, image_url: null }, managerId);
          const eventId = tempEvent.id;

          const bannerUrl = await uploadEventBanner(eventData.banner_image_base64, eventId);
          eventData.banner_image_url = bannerUrl;

          // Handle regular image upload if provided
          if (eventData.image_base64) {
            const imageUrl = await uploadEventImage(eventData.image_base64, eventId);
            eventData.image_url = imageUrl;
          }

          // Update event with image URLs
          await EventModel.update(eventId, {
            banner_image_url: eventData.banner_image_url,
            image_url: eventData.image_url
          });

          const event = await EventModel.findById(eventId);

          // Log audit event
          await logAuditEvent({
            event_type: AuditEventType.EVENT_CREATED,
            user_id: managerId,
            user_role: 'EVENT_MANAGER',
            resource_type: 'EVENT',
            resource_id: event.id,
            metadata: {
              event_name: event.event_name,
              event_code: event.event_code,
              event_type: event.event_type,
              status: event.status,
              has_banner: !!eventData.banner_image_url,
              has_image: !!eventData.image_url
            },
            ip_address: req.ip,
            user_agent: req.get('user-agent')
          });

          return successResponse(
            res,
            { event },
            'Event created successfully with images. Status: DRAFT',
            201
          );
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          return errorResponse(res, 'Failed to upload event images. Please try again.', 500);
        }
      }

      // Create event without images
      const event = await EventModel.create(eventData, managerId);

      // Log audit event
      await logAuditEvent({
        event_type: AuditEventType.EVENT_CREATED,
        user_id: managerId,
        user_role: 'EVENT_MANAGER',
        resource_type: 'EVENT',
        resource_id: event.id,
        metadata: {
          event_name: event.event_name,
          event_code: event.event_code,
          event_type: event.event_type,
          status: event.status
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      return successResponse(
        res,
        { event },
        'Event created successfully. Status: DRAFT',
        201
      );
    } catch (error) {
      console.error('Create event error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get all events created by manager
   * GET /api/event-managers/events
   */
  static async getMyEvents(req, res) {
    try {
      const managerId = req.user.id;
      const { status, page, limit } = req.query;

      const result = await EventModel.getByManager(managerId, {
        status,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      });

      return successResponse(res, result);
    } catch (error) {
      console.error('Get my events error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get single event details
   * GET /api/event-managers/events/:eventId
   */
  static async getEventDetails(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      // Check ownership
      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Unauthorized access to this event', 403);
      }

      // Get event stats
      const stats = await EventModel.getStats(eventId);

      // Get all volunteers for this event
      const volunteers = await query(`
        SELECT 
          v.id,
          v.full_name,
          v.email,
          v.phone,
          v.role,
          v.is_active,
          v.total_scans_performed,
          ev.assigned_location,
          ev.permissions,
          ev.total_scans_for_event,
          ev.assigned_at
        FROM volunteers v
        INNER JOIN event_volunteers ev ON v.id = ev.volunteer_id
        WHERE ev.event_id = $1 AND ev.is_active = true
        ORDER BY v.full_name ASC
      `, [eventId]);

      // Get all stalls for this event
      const stalls = await query(`
        SELECT 
          st.id,
          st.stall_name,
          st.stall_number,
          st.location,
          st.description,
          st.is_active,
          st.qr_code_token,
          st.rank_1_votes,
          st.rank_2_votes,
          st.rank_3_votes,
          st.weighted_score,
          st.total_feedback_count,
          sc.school_name
        FROM stalls st
        LEFT JOIN schools sc ON st.school_id = sc.id
        WHERE st.event_id = $1
        ORDER BY st.stall_number ASC
      `, [eventId]);

      return successResponse(res, { 
        event, 
        stats,
        volunteers: {
          data: volunteers,
          total: volunteers.length
        },
        stalls: {
          data: stalls,
          total: stalls.length,
          active: stalls.filter(s => s.is_active).length
        }
      });
    } catch (error) {
      console.error('Get event details error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Update event
   * PUT /api/event-managers/events/:eventId
   */
  static async updateEvent(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      // Check ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Unauthorized access to this event', 403);
      }

      // Prevent updates if event is approved, active, completed, or archived
      if (['APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(event.status)) {
        return errorResponse(
          res,
          'Cannot update event after admin approval. Only DRAFT and REJECTED events can be modified.',
          400
        );
      }

      const updated = await EventModel.update(eventId, req.body);

      // Log audit event
      await logAuditEvent({
        event_type: AuditEventType.EVENT_UPDATED,
        user_id: managerId,
        user_role: 'EVENT_MANAGER',
        resource_type: 'EVENT',
        resource_id: eventId,
        metadata: {
          updated_fields: Object.keys(req.body),
          event_name: updated.event_name
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      return successResponse(res, { event: updated }, 'Event updated successfully');
    } catch (error) {
      console.error('Update event error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Delete event (soft delete)
   * DELETE /api/event-managers/events/:eventId
   */
  static async deleteEvent(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      // Check ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Unauthorized access to this event', 403);
      }

      await EventModel.delete(eventId);

      // Log audit event
      await logAuditEvent({
        event_type: AuditEventType.EVENT_DELETED,
        user_id: managerId,
        user_role: 'EVENT_MANAGER',
        resource_type: 'EVENT',
        resource_id: eventId,
        metadata: {
          event_name: event.event_name,
          event_code: event.event_code
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      return successResponse(res, null, 'Event cancelled successfully');
    } catch (error) {
      console.error('Delete event error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get event registrations
   * GET /api/event-managers/events/:eventId/registrations
   */
  static async getEventRegistrations(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;
      const { registration_status, payment_status, page, limit } = req.query;

      // Check ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Unauthorized access to this event', 403);
      }

      const result = await EventRegistrationModel.getEventRegistrations(eventId, {
        registration_status,
        payment_status,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50
      });

      return successResponse(res, result);
    } catch (error) {
      console.error('Get event registrations error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get event analytics
   * GET /api/event-managers/events/:eventId/analytics
   */
  static async getEventAnalytics(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      // Check ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Unauthorized access to this event', 403);
      }

      // Get comprehensive analytics
      const eventStats = await EventModel.getStats(eventId);
      const registrationStats = await EventRegistrationModel.getStats(eventId);
      const volunteerStats = await EventVolunteerModel.getEventStats(eventId);
      const volunteerPerformance = await EventVolunteerModel.getVolunteerPerformance(eventId);

      return successResponse(res, {
        event: {
          id: event.id,
          event_name: event.event_name,
          event_code: event.event_code,
          status: event.status
        },
        stats: {
          ...eventStats,
          registrations: registrationStats,
          volunteers: volunteerStats
        },
        volunteer_performance: volunteerPerformance
      });
    } catch (error) {
      console.error('Get event analytics error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Submit event for admin approval
   * POST /api/event-managers/events/:eventId/submit-for-approval
   */
  static async submitEventForApproval(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      // Check ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Unauthorized access to this event', 403);
      }

      // Check if event is in DRAFT or REJECTED status
      if (!['DRAFT', 'REJECTED'].includes(event.status)) {
        return errorResponse(res, `Event cannot be submitted. Current status: ${event.status}`, 400);
      }

      // Validate event has required images
      if (!event.banner_image_url) {
        return errorResponse(res, 'Event must have a banner image before submission', 400);
      }

      // Check if event has at least one stall
      const stallsQuery = 'SELECT COUNT(*) as count FROM stalls WHERE event_id = $1 AND is_active = true';
      const stallResult = await query(stallsQuery, [eventId]);
      const stallCount = parseInt(stallResult[0].count);

      if (stallCount === 0) {
        return errorResponse(res, 'Event must have at least one stall before submission', 400);
      }

      // Check if event has at least one volunteer
      const volunteersQuery = 'SELECT COUNT(*) as count FROM event_volunteers WHERE event_id = $1';
      const volunteerResult = await query(volunteersQuery, [eventId]);
      const volunteerCount = parseInt(volunteerResult[0].count);

      if (volunteerCount === 0) {
        return errorResponse(res, 'Event must have at least one volunteer before submission', 400);
      }

      // Update event status to PENDING_APPROVAL and clear rejection reason if resubmitting
      const updateData = { status: 'PENDING_APPROVAL' };
      if (event.status === 'REJECTED') {
        updateData.admin_rejection_reason = null;
      }
      await EventModel.update(eventId, updateData);

      // Log audit event
      await logAuditEvent({
        event_type: AuditEventType.EVENT_STATUS_CHANGED,
        user_id: managerId,
        user_role: 'EVENT_MANAGER',
        resource_type: 'EVENT',
        resource_id: eventId,
        metadata: {
          old_status: 'DRAFT',
          new_status: 'PENDING_APPROVAL',
          event_name: event.event_name,
          stall_count: stallCount,
          volunteer_count: volunteerCount
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      return successResponse(res, null, 'Event submitted for admin approval successfully');
    } catch (error) {
      console.error('Submit event for approval error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get comprehensive event analytics (for approved events only)
   * GET /api/event-managers/events/:eventId/analytics
   */
  static async getEventAnalytics(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      // Check ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Unauthorized access to this event', 403);
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
      const registrationResult = await query(registrationsQuery, [eventId]);
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
      const revenueResult = await query(revenueQuery, [eventId]);
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
      const feedbackResult = await query(feedbackQuery, [eventId]);
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
      const rankingsResult = await query(rankingsQuery, [eventId]);
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
      const stallsResult = await query(stallsQuery, [eventId]);
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
      const volunteersResult = await query(volunteersQuery, [eventId]);
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
      const checkInOutResult = await query(checkInOutQuery, [eventId]);
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
      console.error('Get event analytics error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get all schools
   * GET /api/event-manager/schools
   */
  static async getAllSchools(req, res) {
    try {
      const schools = await School.findAll(query);

      return successResponse(res, {
        schools,
        total: schools.length
      }, 'Schools retrieved successfully');
    } catch (error) {
      console.error('Get schools error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  // ============================================================
  // BULK REGISTRATION METHODS
  // ============================================================

  /**
   * Check eligibility for bulk registration
   * GET /api/event-manager/events/:eventId/bulk-register/check-eligibility
   */
  static async checkEligibility(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      const eligibility = await getEligibilityStatus(eventId, managerId);

      return successResponse(res, eligibility, 'Eligibility check completed');

    } catch (error) {
      console.error('Check eligibility error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Validate bulk registration file (pre-upload check)
   * POST /api/event-manager/events/:eventId/bulk-register/validate
   */
  static async validateBulkRegistration(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      if (!req.file) {
        return errorResponse(res, 'No file uploaded', 400);
      }

    // Validate event eligibility
    const { event } = await validateEventEligibility(eventId, managerId, 'EVENT_MANAGER');

    // Parse Excel file
    const parsed = await parseEventRegistrationFile(req.file.buffer);

    if (parsed.errors.length > 0) {
      return errorResponse(res, 'Excel file contains formatting errors', 400, {
        errors: parsed.errors
      });
    }

    // Validate registration numbers format
    const validation = validateEventRegistrationData(parsed.registrationNumbers);

    if (!validation.valid) {
      return successResponse(res, {
        valid: false,
        errors: validation.errors,
        totalRows: validation.totalRows
      }, 'Validation completed with errors');
    }

    // Fetch students from any school (no restriction)
    const { validStudents, invalidRegistrationNumbers } = 
      await validateAndFetchStudents(validation.validRegistrationNumbers, null);      // Check existing registrations
      const studentIds = validStudents.map(s => s.id);
      const existingStudentIds = await checkExistingRegistrations(eventId, studentIds);

      const duplicateCount = existingStudentIds.length;
      const newRegistrations = validStudents.length - duplicateCount;

      // Check if requires approval (>200)
      const requiresApproval = newRegistrations > 200;

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
        requires_approval: requiresApproval,
        capacity: {
          current: event.current_registrations,
          max: event.max_capacity,
          after_upload: event.current_registrations + newRegistrations,
          exceeds_capacity: !capacityCheck.allowed,
          available_slots: capacityCheck.available_slots
        },
        errors: [
          ...invalidRegistrationNumbers.map(regNo => ({
            registration_no: regNo,
            error: 'STUDENT_NOT_FOUND',
            message: 'Student not found in system'
          }))
        ],
        warnings: capacityCheck.allowed ? [] : [{
          type: 'CAPACITY_WARNING',
          message: capacityCheck.reason
        }]
      }, 'Validation completed successfully');

    } catch (error) {
      console.error('Validate bulk registration error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Bulk register students to event (with restrictions)
   * POST /api/event-manager/events/:eventId/bulk-register
   */
  static async bulkRegisterStudents(req, res) {
    const startTime = Date.now();

    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      if (!req.file) {
        return errorResponse(res, 'No file uploaded', 400);
      }

      // Check rate limits
      const rateLimitCheck = await checkRateLimit(managerId, 'EVENT_MANAGER');
      if (!rateLimitCheck.allowed) {
        return errorResponse(res, rateLimitCheck.reason, 429);
      }

    // Validate event eligibility (ownership + status check)
    const { event } = await validateEventEligibility(eventId, managerId, 'EVENT_MANAGER');

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

    // Fetch students from any school (no restriction)
    const { validStudents, invalidRegistrationNumbers } = 
      await validateAndFetchStudents(validation.validRegistrationNumbers, null);      if (validStudents.length === 0) {
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

      // Check if requires approval (>200 students)
      if (studentsToRegister.length > 200) {
        // Create approval request
        const studentData = studentsToRegister.map(s => ({
          student_id: s.id,
          registration_no: s.registration_no,
          full_name: s.full_name
        }));

        // Create log entry (pending approval)
        const logEntry = await pool`
          INSERT INTO bulk_registration_logs (
            event_id,
            uploaded_by_user_id,
            uploaded_by_role,
            total_students_attempted,
            file_name,
            status
          ) VALUES (
            ${eventId},
            ${managerId},
            'EVENT_MANAGER',
            ${parsed.totalRows},
            ${req.file.originalname},
            'PENDING_APPROVAL'
          )
          RETURNING id
        `;

        // Create approval request
        const request = await pool`
          INSERT INTO bulk_registration_requests (
            event_id,
            bulk_log_id,
            requested_by_user_id,
            requested_by_role,
            total_count,
            student_data
          ) VALUES (
            ${eventId},
            ${logEntry[0].id},
            ${managerId},
            'EVENT_MANAGER',
            ${studentsToRegister.length},
            ${JSON.stringify(studentData)}
          )
          RETURNING id, expires_at
        `;

        return successResponse(res, {
          request_submitted: true,
          request_id: request[0].id,
          total_count: studentsToRegister.length,
          status: 'PENDING',
          expires_at: request[0].expires_at,
          message: 'Request submitted for admin approval (exceeds 200 student threshold)'
        }, 'Request submitted for admin approval');
      }

      // Check capacity (event managers cannot bypass)
      const capacityCheck = checkCapacityLimit(event, studentsToRegister.length, false);

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
      const cumulativeCheck = await checkCumulativeLimit(eventId, managerId, studentsToRegister.length);

      // Perform bulk registration
      const bulkResult = await EventRegistration.bulkCreate(
        studentsToRegister,
        eventId,
        event.event_type,
        { skip_capacity_check: false }
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
          attention_required,
          error_details
        ) VALUES (
          ${eventId},
          ${managerId},
          'EVENT_MANAGER',
          ${parsed.totalRows},
          ${bulkResult.inserted},
          ${invalidRegistrationNumbers.length},
          ${existingStudentIds.length},
          ${req.file.originalname},
          ${bulkResult.inserted > 0 ? 'COMPLETED' : 'FAILED'},
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
        errors: errorDetails.slice(0, 100)
      }, 'Bulk registration completed');

    } catch (error) {
      console.error('Bulk register students error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Download event registration template
   * GET /api/event-manager/events/:eventId/bulk-register/template
   */
  static async downloadEventRegistrationTemplate(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;

      // Validate event eligibility
      const { event, school_id } = await validateEventEligibility(eventId, managerId, 'EVENT_MANAGER');

      // Fetch school name
      const schools = await pool`
        SELECT school_name FROM schools WHERE id = ${school_id}
      `;

      // Get rate limit status
      const rateLimit = await checkRateLimit(managerId, 'EVENT_MANAGER');

      // Get upload stats
      const stats = await pool`
        SELECT COUNT(*) as count FROM bulk_registration_logs
        WHERE uploaded_by_user_id = ${managerId}
          AND created_at > NOW() - INTERVAL '24 hours'
      `;

      const buffer = await generateEventRegistrationTemplate({
        event_name: event.event_name,
        event_code: event.event_code,
        max_capacity: event.max_capacity,
        current_registrations: event.current_registrations,
        school_name: schools[0]?.school_name || 'Unknown',
        today_uploads: parseInt(stats[0].count) || 0,
        cooldown_active: !rateLimit.allowed
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=event-registration-template-${event.event_code}.xlsx`);
      res.send(buffer);

    } catch (error) {
      console.error('Download template error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Cancel a single event registration (Event Manager)
   * POST /api/event-manager/events/:eventId/cancel-registration
   * Access: EVENT_MANAGER (must own the event)
   * Body: { registration_number: "EN2024001", reason: "Optional reason" }
   */
  static async cancelRegistration(req, res) {
    try {
      const { eventId } = req.params;
      const { registration_number, reason } = req.body;
      const managerId = req.user.id;

      if (!registration_number) {
        return errorResponse(res, 'Please provide registration_number', 400);
      }

      // Import pool dynamically
      const { pool } = await import('../config/db.js');

      await pool('BEGIN');

      // Fetch event and verify ownership
      const eventResults = await query(
        'SELECT * FROM events WHERE id = $1',
        [eventId]
      );

      if (eventResults.length === 0) {
        await pool('ROLLBACK');
        return errorResponse(res, 'Event not found', 404);
      }

      const event = eventResults[0];

      // Verify event manager ownership
      if (event.created_by_manager_id !== managerId) {
        await pool('ROLLBACK');
        return errorResponse(res, 'Access denied. You can only cancel registrations for events you created', 403);
      }

      // Fetch registration by student registration number using JOIN
      const regResults = await query(
        `SELECT er.* FROM event_registrations er
         INNER JOIN students s ON er.student_id = s.id
         WHERE s.registration_no = $1 AND er.event_id = $2`,
        [registration_number, eventId]
      );

      if (regResults.length === 0) {
        await pool('ROLLBACK');
        return errorResponse(res, 'Registration not found', 404);
      }

      const registration = regResults[0];
      const registrationId = registration.id;

      // Check if already cancelled
      if (registration.registration_status === 'CANCELLED') {
        await pool('ROLLBACK');
        return errorResponse(res, 'Registration already cancelled', 400);
      }

      // Calculate refund for paid events
      let refundDetails = null;
      let razorpayRefundId = null;
      if (event.event_type === 'PAID' && registration.payment_status === 'COMPLETED') {
        const { calculateRefund } = await import('../utils/refundCalculator.js');
        refundDetails = calculateRefund(event);

        if (refundDetails.eligible && refundDetails.amount > 0) {
          // Process refund via PaymentService
          const { default: PaymentService } = await import('../services/payment.service.js');
          const refundResult = await PaymentService.processRefund(
            registration.razorpay_payment_id,
            refundDetails.amount,
            `Event Manager Cancellation: ${reason || 'No reason provided'}`
          );

          razorpayRefundId = refundResult.id;

          // Update registration using model method (sets all refund fields)
          await EventRegistrationModel.processRefund(
            registrationId,
            refundDetails.amount,
            `Event Manager Cancellation: ${reason || 'No reason provided'}`
          );
        } else {
          // No refund eligible - just cancel
          await EventRegistrationModel.cancel(registrationId);
        }
      } else {
        // Free event - just cancel
        await EventRegistrationModel.cancel(registrationId);
      }

      // Decrement event capacity
      await query(
        'UPDATE events SET current_registrations = current_registrations - 1 WHERE id = $1',
        [eventId]
      );

      // Promote from waitlist if applicable
      const { promoteFromWaitlist } = await import('../services/waitlist.service.js');
      await promoteFromWaitlist(eventId, 1);

      await pool('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Registration cancelled successfully',
        data: {
          registration_id: registrationId,
          refund: refundDetails ? {
            eligible: refundDetails.eligible,
            amount: refundDetails.amount,
            percent: refundDetails.percent,
            razorpay_refund_id: razorpayRefundId
          } : { eligible: false, amount: 0, percent: 0 }
        }
      });

    } catch (error) {
      await pool('ROLLBACK');
      console.error('Cancel registration error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Bulk cancel event registrations (Event Manager)
   * POST /api/event-manager/events/:eventId/bulk-cancel
   * Access: EVENT_MANAGER (must own the event)
   * Body: { registration_numbers: ["EN2024001", "EN2024002"] } - Array of student registration numbers
   */
  static async bulkCancelRegistrations(req, res) {
    try {
      const { eventId } = req.params;
      const managerId = req.user.id;
      const { reason } = req.body;

      // Import pool dynamically
      const { pool } = await import('../config/db.js');

      // Verify event ownership
      const eventResults = await query(
        'SELECT * FROM events WHERE id = $1',
        [eventId]
      );

      if (eventResults.length === 0) {
        return errorResponse(res, 'Event not found', 404);
      }

      const event = eventResults[0];

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Access denied. You can only cancel registrations for events you created', 403);
      }

      // Get registration numbers from request body
      let registrationNumbers = [];

      if (req.body.registration_numbers && Array.isArray(req.body.registration_numbers)) {
        registrationNumbers = req.body.registration_numbers.filter(regNo => regNo && regNo.trim());
      } else {
        return errorResponse(res, 'Please provide registration_numbers array', 400);
      }

      if (registrationNumbers.length === 0) {
        return errorResponse(res, 'No valid registration numbers provided', 400);
      }

      // Process cancellations
      const results = {
        total: registrationNumbers.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const registrationNumber of registrationNumbers) {
        try {
          await pool('BEGIN');

          // Find registration by student registration number using JOIN
          const regResults = await query(
            `SELECT er.* FROM event_registrations er
             INNER JOIN students s ON er.student_id = s.id
             WHERE s.registration_no = $1 AND er.event_id = $2`,
            [registrationNumber, eventId]
          );

          if (regResults.length === 0) {
            results.failed++;
            results.errors.push({
              registration_number: registrationNumber,
              error: 'Registration not found'
            });
            await pool('ROLLBACK');
            continue;
          }

          const registration = regResults[0];

          if (registration.registration_status === 'CANCELLED') {
            results.failed++;
            results.errors.push({
              registration_number: registrationNumber,
              error: 'Already cancelled'
            });
            await pool('ROLLBACK');
            continue;
          }

          // Calculate refund for paid events
          if (event.event_type === 'PAID' && registration.payment_status === 'COMPLETED') {
            const { calculateRefund } = await import('../utils/refundCalculator.js');
            const refundDetails = calculateRefund(event);

            if (refundDetails.eligible && refundDetails.amount > 0) {
              const { default: PaymentService } = await import('../services/payment.service.js');
              await PaymentService.processRefund(
                registration.razorpay_payment_id,
                refundDetails.amount,
                `Bulk Cancellation: ${reason || 'No reason provided'}`
              );

              // Update using model method
              await EventRegistrationModel.processRefund(
                registration.id,
                refundDetails.amount,
                `Bulk Cancellation: ${reason || 'No reason provided'}`
              );
            } else {
              // No refund eligible
              await EventRegistrationModel.cancel(registration.id);
            }
          } else {
            // Free event
            await EventRegistrationModel.cancel(registration.id);
          }

          // Decrement capacity
          await query(
            'UPDATE events SET current_registrations = current_registrations - 1 WHERE id = $1',
            [eventId]
          );

          await pool('COMMIT');
          results.successful++;

        } catch (error) {
          await pool('ROLLBACK');
          results.failed++;
          results.errors.push({
            registration_number: registrationNumber,
            error: error.message
          });
        }
      }

      // Promote from waitlist for all cancelled spots
      if (results.successful > 0) {
        const { promoteFromWaitlist } = await import('../services/waitlist.service.js');
        await promoteFromWaitlist(eventId, results.successful);
      }

      return res.status(200).json({
        success: true,
        message: `Bulk cancellation completed: ${results.successful} successful, ${results.failed} failed`,
        data: results
      });

    } catch (error) {
      console.error('Bulk cancel error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get registration details by registration number
   * GET /api/event-manager/events/:eventId/registrations/by-number/:registrationNumber
   * Access: EVENT_MANAGER (must own the event)
   * Returns: Full registration details with student info for cancellation operations
   */
  static async getRegistrationByNumber(req, res) {
    try {
      const { eventId, registrationNumber } = req.params;
      const managerId = req.user.id;

      // Verify event ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Access denied. You can only view registrations for events you created', 403);
      }

      // Find registration using JOIN with students table
      const registrations = await query(
        `SELECT 
           er.*,
           s.full_name as student_name,
           s.registration_no as student_registration_no,
           s.email as student_email,
           s.phone as student_phone,
           s.school_id,
           sc.school_name
         FROM event_registrations er
         INNER JOIN students s ON er.student_id = s.id
         LEFT JOIN schools sc ON s.school_id = sc.id
         WHERE s.registration_no = $1 AND er.event_id = $2`,
        [registrationNumber, eventId]
      );

      if (registrations.length === 0) {
        return errorResponse(res, 'Registration not found', 404);
      }

      return successResponse(res, registrations[0]);
    } catch (error) {
      console.error('Get registration by number error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Check if registration is cancellable and get refund details
   * GET /api/event-manager/events/:eventId/registrations/check-cancellable/:registrationNumber
   * Access: EVENT_MANAGER (must own the event)
   * Returns: { cancellable: boolean, reason: string, refund: { eligible, amount, percent } }
   */
  static async checkCancellable(req, res) {
    try {
      const { eventId, registrationNumber } = req.params;
      const managerId = req.user.id;

      // Verify event ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Access denied', 403);
      }

      // Find registration
      const registrations = await query(
        `SELECT 
           er.*,
           s.full_name as student_name,
           s.registration_no as student_registration_no
         FROM event_registrations er
         INNER JOIN students s ON er.student_id = s.id
         WHERE s.registration_no = $1 AND er.event_id = $2`,
        [registrationNumber, eventId]
      );

      if (registrations.length === 0) {
        return errorResponse(res, 'Registration not found', 404);
      }

      const registration = registrations[0];

      // Check if already cancelled
      if (registration.registration_status === 'CANCELLED') {
        return successResponse(res, {
          cancellable: false,
          reason: 'Registration is already cancelled',
          refund: null,
          registration: {
            student_name: registration.student_name,
            student_registration_no: registration.student_registration_no,
            registration_status: registration.registration_status
          }
        });
      }

      // Calculate refund for paid events
      let refundDetails = null;
      if (event.event_type === 'PAID' && registration.payment_status === 'COMPLETED') {
        const { calculateRefund } = await import('../utils/refundCalculator.js');
        refundDetails = calculateRefund(event);
      }

      return successResponse(res, {
        cancellable: true,
        reason: 'Registration can be cancelled',
        refund: refundDetails || { eligible: false, amount: 0, percent: 0 },
        registration: {
          student_name: registration.student_name,
          student_registration_no: registration.student_registration_no,
          registration_status: registration.registration_status,
          payment_status: registration.payment_status,
          payment_amount: registration.payment_amount
        }
      });
    } catch (error) {
      console.error('Check cancellable error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Search registrations by name, email, phone, or registration number
   * GET /api/event-manager/events/:eventId/registrations/search?q=<query>
   * Access: EVENT_MANAGER (must own the event)
   * Returns: Filtered registrations matching search query
   */
  static async searchRegistrations(req, res) {
    try {
      const { eventId } = req.params;
      const { q, page = 1, limit = 50 } = req.query;
      const managerId = req.user.id;

      if (!q || q.trim().length === 0) {
        return errorResponse(res, 'Search query is required', 400);
      }

      const searchTerm = q.trim();

      // Verify event ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Access denied', 403);
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Search across name, email, phone, and registration_no
      const results = await query(
        `SELECT 
           er.*,
           s.full_name as student_name,
           s.registration_no as student_registration_no,
           s.email as student_email,
           s.phone as student_phone,
           COUNT(*) OVER() as total_count
         FROM event_registrations er
         INNER JOIN students s ON er.student_id = s.id
         WHERE er.event_id = $1
           AND (
             LOWER(s.full_name) LIKE LOWER($2)
             OR LOWER(s.email) LIKE LOWER($2)
             OR s.phone LIKE $2
             OR LOWER(s.registration_no) LIKE LOWER($2)
           )
         ORDER BY er.registered_at DESC
         LIMIT $3 OFFSET $4`,
        [eventId, `%${searchTerm}%`, parseInt(limit), offset]
      );

      return successResponse(res, {
        data: results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: results[0]?.total_count || 0,
          totalPages: Math.ceil((results[0]?.total_count || 0) / parseInt(limit))
        },
        search_query: searchTerm
      });
    } catch (error) {
      console.error('Search registrations error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  /**
   * Get refund history for event
   * GET /api/event-manager/events/:eventId/refunds
   * Access: EVENT_MANAGER (must own the event)
   * Returns: List of all refunds issued for the event
   */
  static async getRefundHistory(req, res) {
    try {
      const { eventId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const managerId = req.user.id;

      // Verify event ownership
      const event = await EventModel.findById(eventId);
      if (!event) {
        return errorResponse(res, 'Event not found', 404);
      }

      if (event.created_by_manager_id !== managerId) {
        return errorResponse(res, 'Access denied', 403);
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Get all refunded registrations
      const refunds = await query(
        `SELECT 
           er.id as registration_id,
           er.refund_amount,
           er.refund_reason,
           er.refunded_at,
           er.payment_amount as original_amount,
           er.razorpay_payment_id,
           s.full_name as student_name,
           s.registration_no as student_registration_no,
           s.email as student_email,
           s.phone as student_phone,
           COUNT(*) OVER() as total_count
         FROM event_registrations er
         INNER JOIN students s ON er.student_id = s.id
         WHERE er.event_id = $1
           AND er.refund_initiated = TRUE
           AND er.refund_amount IS NOT NULL
         ORDER BY er.refunded_at DESC
         LIMIT $2 OFFSET $3`,
        [eventId, parseInt(limit), offset]
      );

      // Calculate summary stats
      const summary = await query(
        `SELECT 
           COUNT(*) as total_refunds,
           COALESCE(SUM(refund_amount), 0) as total_refunded,
           COALESCE(AVG(refund_amount), 0) as average_refund
         FROM event_registrations
         WHERE event_id = $1
           AND refund_initiated = TRUE
           AND refund_amount IS NOT NULL`,
        [eventId]
      );

      return successResponse(res, {
        data: refunds,
        summary: {
          total_refunds: parseInt(summary[0]?.total_refunds || 0),
          total_refunded: parseFloat(summary[0]?.total_refunded || 0),
          average_refund: parseFloat(summary[0]?.average_refund || 0)
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: refunds[0]?.total_count || 0,
          totalPages: Math.ceil((refunds[0]?.total_count || 0) / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Get refund history error:', error);
      return errorResponse(res, error.message, 500);
    }
  }
}

export default EventManagerController;


