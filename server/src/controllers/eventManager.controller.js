// Event Manager Controller - Event creation, volunteer assignment, analytics
import { query } from '../config/db.js';
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
import { logAuditEvent, AuditEventType } from '../utils/auditLogger.js';
import { uploadEventBanner, uploadEventImage } from '../services/cloudinary.js';

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

      return successResponse(
        res,
        {
          manager: {
            id: manager.id,
            email: manager.email,
            full_name: manager.full_name,
            organization: manager.organization,
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

      return successResponse(res, {
        manager: {
          id: manager.id,
          email: manager.email,
          full_name: manager.full_name,
          phone: manager.phone,
          organization: manager.organization,
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

      // Prevent updates if event is active or completed
      if (['ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(event.status)) {
        return errorResponse(
          res,
          'Cannot update event that is active, completed, or archived',
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
}

export default EventManagerController;
