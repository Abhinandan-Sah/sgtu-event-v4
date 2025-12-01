/**
 * Event Analytics Service
 * Comprehensive analytics for multi-event management system
 * Provides insights for event managers, admins, and system-wide metrics
 */

import { query } from '../config/db.js';

class EventAnalytics {
  /**
   * Get comprehensive event statistics
   * @param {number} eventId - Event ID
   * @returns {Object} Event statistics including registrations, revenue, attendance
   */
  static async getEventStats(eventId) {
    try {
      // Basic event stats
      const statsResult = await query(`
        SELECT 
          e.id,
          e.name,
          e.event_type,
          e.registration_fee,
          e.max_participants,
          e.total_registrations,
          e.total_revenue,
          e.start_date,
          e.end_date,
          e.status,
          COUNT(DISTINCT er.id) as actual_registrations,
          COUNT(DISTINCT CASE WHEN er.payment_status = 'COMPLETED' THEN er.id END) as paid_registrations,
          COUNT(DISTINCT CASE WHEN er.payment_status = 'PENDING' THEN er.id END) as pending_payments,
          COUNT(DISTINCT CASE WHEN er.payment_status = 'FAILED' THEN er.id END) as failed_payments,
          COUNT(DISTINCT ev.volunteer_id) as total_volunteers,
          SUM(CASE WHEN er.payment_status = 'COMPLETED' THEN er.registration_fee_paid ELSE 0 END) as actual_revenue
        FROM events e
        LEFT JOIN event_registrations er ON e.id = er.event_id
        LEFT JOIN event_volunteers ev ON e.id = ev.event_id
        WHERE e.id = $1 AND e.deleted_at IS NULL
        GROUP BY e.id
      `, [eventId]);

      if (statsResult.length === 0) {
        return null;
      }

      const stats = statsResult[0];

      // Registration timeline (last 7 days)
      const timelineResult = await query(`
        SELECT 
          DATE(registered_at) as registration_date,
          COUNT(*) as registrations_count,
          SUM(CASE WHEN payment_status = 'COMPLETED' THEN registration_fee_paid ELSE 0 END) as daily_revenue
        FROM event_registrations
        WHERE event_id = $1
          AND registered_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(registered_at)
        ORDER BY registration_date DESC
      `, [eventId]);

      // School-wise participation
      const schoolStatsResult = await query(`
        SELECT 
          sch.id,
          sch.name as school_name,
          COUNT(DISTINCT er.student_id) as student_count,
          SUM(CASE WHEN er.payment_status = 'COMPLETED' THEN er.registration_fee_paid ELSE 0 END) as school_revenue
        FROM event_registrations er
        INNER JOIN students s ON er.student_id = s.id
        INNER JOIN schools sch ON s.school_id = sch.id
        WHERE er.event_id = $1
        GROUP BY sch.id, sch.name
        ORDER BY student_count DESC
        LIMIT 10
      `, [eventId]);

      // Check-in statistics (if event has started)
      const checkInResult = await query(`
        SELECT 
          COUNT(DISTINCT CASE WHEN cio.scan_type = 'CHECKIN' THEN er.student_id END) as students_checked_in,
          COUNT(DISTINCT CASE WHEN cio.scan_type = 'CHECKOUT' THEN er.student_id END) as students_checked_out,
          AVG(EXTRACT(EPOCH FROM (cio.scanned_at - e.start_date))) / 60 as avg_check_in_delay_minutes
        FROM event_registrations er
        INNER JOIN events e ON er.event_id = e.id
        LEFT JOIN check_in_outs cio ON er.student_id = cio.student_id 
          AND cio.event_id = $1
          AND cio.scanned_at >= e.start_date 
          AND cio.scanned_at <= e.end_date
        WHERE er.event_id = $1 AND er.payment_status = 'COMPLETED'
        GROUP BY e.start_date
      `, [eventId]);

      const checkInStats = checkInResult[0] || {
        students_checked_in: 0,
        students_checked_out: 0,
        avg_check_in_delay_minutes: null
      };

      return {
        event_info: {
          id: stats.id,
          name: stats.name,
          type: stats.event_type,
          status: stats.status,
          start_date: stats.start_date,
          end_date: stats.end_date,
          registration_fee: parseFloat(stats.registration_fee) || 0
        },
        registration_stats: {
          total_registrations: parseInt(stats.actual_registrations),
          paid_registrations: parseInt(stats.paid_registrations),
          pending_payments: parseInt(stats.pending_payments),
          failed_payments: parseInt(stats.failed_payments),
          max_participants: parseInt(stats.max_participants),
          capacity_utilization: ((parseInt(stats.actual_registrations) / parseInt(stats.max_participants)) * 100).toFixed(2) + '%',
          spots_remaining: parseInt(stats.max_participants) - parseInt(stats.actual_registrations)
        },
        revenue_stats: {
          total_revenue: parseFloat(stats.actual_revenue) || 0,
          expected_revenue: parseFloat(stats.registration_fee) * parseInt(stats.max_participants),
          revenue_realization: stats.event_type === 'PAID' 
            ? ((parseFloat(stats.actual_revenue) / (parseFloat(stats.registration_fee) * parseInt(stats.max_participants))) * 100).toFixed(2) + '%'
            : 'N/A (Free Event)'
        },
        volunteer_stats: {
          total_volunteers: parseInt(stats.total_volunteers)
        },
        attendance_stats: checkInStats,
        registration_timeline: timelineResult,
        school_participation: schoolStatsResult
      };
    } catch (error) {
      console.error('Error fetching event stats:', error);
      throw error;
    }
  }

  /**
   * Get event manager dashboard statistics
   * @param {number} eventManagerId - Event manager ID
   * @returns {Object} Dashboard statistics for event manager
   */
  static async getEventManagerDashboard(eventManagerId) {
    try {
      // Overview stats
      const overviewResult = await query(`
        SELECT 
          COUNT(DISTINCT e.id) as total_events,
          COUNT(DISTINCT CASE WHEN e.status = 'ACTIVE' THEN e.id END) as active_events,
          COUNT(DISTINCT CASE WHEN e.status = 'COMPLETED' THEN e.id END) as completed_events,
          COUNT(DISTINCT CASE WHEN e.status = 'PENDING_APPROVAL' THEN e.id END) as pending_approval,
          COUNT(DISTINCT er.id) as total_registrations,
          SUM(CASE WHEN er.payment_status = 'COMPLETED' THEN er.registration_fee_paid ELSE 0 END) as total_revenue
        FROM events e
        LEFT JOIN event_registrations er ON e.id = er.event_id
        WHERE e.event_manager_id = $1 AND e.deleted_at IS NULL
      `, [eventManagerId]);

      const overview = overviewResult[0];

      // Recent events with stats
      const recentEventsResult = await query(`
        SELECT 
          e.id,
          e.name,
          e.event_type,
          e.status,
          e.start_date,
          e.end_date,
          e.max_participants,
          e.total_registrations,
          e.total_revenue,
          COUNT(DISTINCT ev.volunteer_id) as volunteer_count
        FROM events e
        LEFT JOIN event_volunteers ev ON e.id = ev.event_id
        WHERE e.event_manager_id = $1 AND e.deleted_at IS NULL
        GROUP BY e.id
        ORDER BY e.created_at DESC
        LIMIT 5
      `, [eventManagerId]);

      // Upcoming events
      const upcomingEventsResult = await query(`
        SELECT 
          e.id,
          e.name,
          e.start_date,
          e.status,
          e.total_registrations,
          e.max_participants
        FROM events e
        WHERE e.event_manager_id = $1 
          AND e.deleted_at IS NULL
          AND e.start_date > NOW()
          AND e.status IN ('APPROVED', 'ACTIVE')
        ORDER BY e.start_date ASC
        LIMIT 5
      `, [eventManagerId]);

      // Revenue trend (last 30 days)
      const revenueTrendResult = await query(`
        SELECT 
          DATE(er.registered_at) as date,
          SUM(CASE WHEN er.payment_status = 'COMPLETED' THEN er.registration_fee_paid ELSE 0 END) as daily_revenue,
          COUNT(DISTINCT er.id) as daily_registrations
        FROM event_registrations er
        INNER JOIN events e ON er.event_id = e.id
        WHERE e.event_manager_id = $1
          AND er.registered_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(er.registered_at)
        ORDER BY date DESC
      `, [eventManagerId]);

      return {
        overview: {
          total_events: parseInt(overview.total_events),
          active_events: parseInt(overview.active_events),
          completed_events: parseInt(overview.completed_events),
          pending_approval: parseInt(overview.pending_approval),
          total_registrations: parseInt(overview.total_registrations),
          total_revenue: parseFloat(overview.total_revenue) || 0
        },
        recent_events: recentEventsResult,
        upcoming_events: upcomingEventsResult,
        revenue_trend: revenueTrendResult
      };
    } catch (error) {
      console.error('Error fetching event manager dashboard:', error);
      throw error;
    }
  }

  /**
   * Get system-wide admin analytics
   * @returns {Object} Platform-wide statistics
   */
  static async getAdminAnalytics() {
    try {
      // Platform overview
      const platformStatsResult = await query(`
        SELECT 
          (SELECT COUNT(*) FROM event_managers WHERE status = 'APPROVED') as total_event_managers,
          (SELECT COUNT(*) FROM event_managers WHERE status = 'PENDING_APPROVAL') as pending_managers,
          (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL) as total_events,
          (SELECT COUNT(*) FROM events WHERE status = 'ACTIVE' AND deleted_at IS NULL) as active_events,
          (SELECT COUNT(*) FROM events WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL) as pending_events,
          (SELECT COUNT(*) FROM event_registrations) as total_registrations,
          (SELECT SUM(registration_fee_paid) FROM event_registrations WHERE payment_status = 'COMPLETED') as total_platform_revenue
      `);

      const platformStats = platformStatsResult[0];

      // Top performing events
      const topEventsResult = await query(`
        SELECT 
          e.id,
          e.name,
          e.event_type,
          e.total_registrations,
          e.total_revenue,
          em.full_name as event_manager_name,
          em.organization
        FROM events e
        INNER JOIN event_managers em ON e.event_manager_id = em.id
        WHERE e.deleted_at IS NULL
        ORDER BY e.total_registrations DESC
        LIMIT 10
      `);

      // Top event managers by revenue
      const topManagersResult = await query(`
        SELECT 
          em.id,
          em.full_name,
          em.organization,
          COUNT(DISTINCT e.id) as total_events,
          SUM(e.total_registrations) as total_registrations,
          SUM(e.total_revenue) as total_revenue
        FROM event_managers em
        INNER JOIN events e ON em.id = e.event_manager_id
        WHERE em.status = 'APPROVED' AND e.deleted_at IS NULL
        GROUP BY em.id, em.full_name, em.organization
        ORDER BY total_revenue DESC
        LIMIT 10
      `);

      // Event type distribution
      const eventTypeDistResult = await query(`
        SELECT 
          event_type,
          COUNT(*) as count,
          SUM(total_registrations) as total_registrations,
          SUM(total_revenue) as total_revenue
        FROM events
        WHERE deleted_at IS NULL
        GROUP BY event_type
      `);

      // Monthly growth trends
      const monthlyTrendResult = await query(`
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(DISTINCT id) as events_created,
          SUM(total_registrations) as month_registrations,
          SUM(total_revenue) as month_revenue
        FROM events
        WHERE deleted_at IS NULL
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      `);

      return {
        platform_overview: platformStats,
        top_events: topEventsResult,
        top_event_managers: topManagersResult,
        event_type_distribution: eventTypeDistResult,
        monthly_trends: monthlyTrendResult
      };
    } catch (error) {
      console.error('Error fetching admin analytics:', error);
      throw error;
    }
  }

  /**
   * Get volunteer performance analytics
   * @param {number} volunteerId - Volunteer ID
   * @param {number} eventId - Optional event ID for event-specific stats
   * @returns {Object} Volunteer performance metrics
   */
  static async getVolunteerAnalytics(volunteerId, eventId = null) {
    try {
      let queryText = `
        SELECT 
          ev.volunteer_id,
          v.full_name as volunteer_name,
          COUNT(DISTINCT ev.event_id) as events_assigned,
          ev.permissions,
          COUNT(DISTINCT cio.id) as total_scans,
          COUNT(DISTINCT CASE WHEN cio.direction = 'IN' THEN cio.id END) as check_ins,
          COUNT(DISTINCT CASE WHEN cio.direction = 'OUT' THEN cio.id END) as check_outs
        FROM event_volunteers ev
        INNER JOIN volunteers v ON ev.volunteer_id = v.id
        LEFT JOIN check_in_out cio ON ev.volunteer_id = cio.scanned_by
      `;

      const params = [volunteerId];
      queryText += ` WHERE ev.volunteer_id = $1`;

      if (eventId) {
        params.push(eventId);
        queryText += ` AND ev.event_id = $${params.length}`;
      }

      queryText += `
        GROUP BY ev.volunteer_id, v.full_name, ev.permissions
      `;

      const result = await query(queryText, params);

      return result[0] || null;
    } catch (error) {
      console.error('Error fetching volunteer analytics:', error);
      throw error;
    }
  }
}

export default EventAnalytics;
