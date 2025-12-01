// EventVolunteer Model - Junction table for event-volunteer assignments
import { query } from '../config/db.js';

class EventVolunteer {
  /**
   * Assign volunteer to event
   * @param {string} eventId - Event UUID
   * @param {string} volunteerId - Volunteer UUID
   * @param {string} managerId - Event manager UUID (who assigned)
   * @param {Object} details - { assigned_location, permissions }
   * @returns {Promise<Object>}
   */
  static async assignVolunteer(eventId, volunteerId, managerId, details = {}) {
    const {
      assigned_location = null,
      permissions = ['SCAN', 'VIEW_STUDENTS']
    } = details;

    const result = await query(`
      INSERT INTO event_volunteers (
        event_id, volunteer_id, assigned_by_manager_id,
        assigned_location, permissions
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (event_id, volunteer_id) 
      DO UPDATE SET
        is_active = TRUE,
        assigned_location = EXCLUDED.assigned_location,
        permissions = EXCLUDED.permissions,
        updated_at = NOW()
      RETURNING *
    `, [eventId, volunteerId, managerId, assigned_location, permissions]);

    return result[0];
  }

  /**
   * Remove volunteer from event
   * @param {string} eventId - Event UUID
   * @param {string} volunteerId - Volunteer UUID
   * @returns {Promise<boolean>}
   */
  static async removeVolunteer(eventId, volunteerId) {
    const result = await pool`
      UPDATE event_volunteers 
      SET is_active = FALSE, updated_at = NOW()
      WHERE event_id = ${eventId} 
        AND volunteer_id = ${volunteerId}
      RETURNING *
    `;

    return result.length > 0;
  }

  /**
   * Check if volunteer is assigned to event
   * @param {string} eventId - Event UUID
   * @param {string} volunteerId - Volunteer UUID
   * @returns {Promise<Object|null>}
   */
  static async findAssignment(eventId, volunteerId) {
    const result = await pool`
      SELECT 
        ev.*,
        e.event_name,
        e.event_code,
        e.status as event_status,
        em.full_name as assigned_by_name
      FROM event_volunteers ev
      LEFT JOIN events e ON ev.event_id = e.id
      LEFT JOIN event_managers em ON ev.assigned_by_manager_id = em.id
      WHERE ev.event_id = ${eventId} 
        AND ev.volunteer_id = ${volunteerId}
        AND ev.is_active = TRUE
      LIMIT 1
    `;

    return result[0] || null;
  }

  /**
   * Get all volunteers assigned to event
   * @param {string} eventId - Event UUID
   * @param {Object} filters - { is_active }
   * @returns {Promise<Array>}
   */
  static async getEventVolunteers(eventId, filters = {}) {
    const { is_active = true } = filters;

    return await pool`
      SELECT 
        ev.*,
        v.full_name as volunteer_name,
        v.email as volunteer_email,
        v.phone as volunteer_phone,
        v.assigned_location as volunteer_default_location,
        em.full_name as assigned_by_name
      FROM event_volunteers ev
      LEFT JOIN volunteers v ON ev.volunteer_id = v.id
      LEFT JOIN event_managers em ON ev.assigned_by_manager_id = em.id
      WHERE ev.event_id = ${eventId}
        AND ev.is_active = ${is_active}
      ORDER BY ev.assigned_at DESC
    `;
  }

  /**
   * Get all events assigned to volunteer
   * @param {string} volunteerId - Volunteer UUID
   * @param {Object} filters - { event_status, is_active }
   * @returns {Promise<Array>}
   */
  static async getVolunteerEvents(volunteerId, filters = {}) {
    const { event_status, is_active = true } = filters;

    const conditions = [
      'ev.volunteer_id = $1',
      'ev.is_active = $2'
    ];
    const params = [volunteerId, is_active];

    if (event_status) {
      conditions.push(`e.status = $${params.length + 1}`);
      params.push(event_status);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool(
      `SELECT 
         ev.*,
         e.event_name,
         e.event_code,
         e.event_type,
         e.event_category,
         e.venue,
         e.start_date,
         e.end_date,
         e.status as event_status,
         e.current_registrations,
         e.max_capacity,
         em.full_name as manager_name,
         em.email as manager_email
       FROM event_volunteers ev
       LEFT JOIN events e ON ev.event_id = e.id
       LEFT JOIN event_managers em ON e.created_by_manager_id = em.id
       WHERE ${whereClause}
       ORDER BY e.start_date ASC`,
      params
    );

    return result || [];
  }

  /**
   * Update volunteer permissions for event
   * @param {string} eventId - Event UUID
   * @param {string} volunteerId - Volunteer UUID
   * @param {Array} permissions - New permissions array
   * @returns {Promise<Object>}
   */
  static async updatePermissions(eventId, volunteerId, permissions) {
    const result = await pool`
      UPDATE event_volunteers 
      SET 
        permissions = ${permissions},
        updated_at = NOW()
      WHERE event_id = ${eventId} 
        AND volunteer_id = ${volunteerId}
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error('Volunteer assignment not found');
    }

    return result[0];
  }

  /**
   * Update volunteer location for event
   * @param {string} eventId - Event UUID
   * @param {string} volunteerId - Volunteer UUID
   * @param {string} location - New location
   * @returns {Promise<Object>}
   */
  static async updateLocation(eventId, volunteerId, location) {
    const result = await pool`
      UPDATE event_volunteers 
      SET 
        assigned_location = ${location},
        updated_at = NOW()
      WHERE event_id = ${eventId} 
        AND volunteer_id = ${volunteerId}
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error('Volunteer assignment not found');
    }

    return result[0];
  }

  /**
   * Increment scan count for volunteer in event
   * @param {string} eventId - Event UUID
   * @param {string} volunteerId - Volunteer UUID
   * @returns {Promise<Object>}
   */
  static async incrementScanCount(eventId, volunteerId) {
    const result = await pool`
      UPDATE event_volunteers 
      SET 
        total_scans_for_event = total_scans_for_event + 1,
        updated_at = NOW()
      WHERE event_id = ${eventId} 
        AND volunteer_id = ${volunteerId}
      RETURNING *
    `;

    return result[0];
  }

  /**
   * Get volunteer statistics for event
   * @param {string} eventId - Event UUID
   * @returns {Promise<Object>}
   */
  static async getEventStats(eventId) {
    const result = await pool`
      SELECT 
        COUNT(*) as total_volunteers,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_volunteers,
        COALESCE(SUM(total_scans_for_event), 0) as total_scans
      FROM event_volunteers
      WHERE event_id = ${eventId}
    `;

    return result[0] || null;
  }

  /**
   * Get volunteer performance for event
   * @param {string} eventId - Event UUID
   * @returns {Promise<Array>}
   */
  static async getVolunteerPerformance(eventId) {
    return await pool`
      SELECT 
        ev.volunteer_id,
        v.full_name as volunteer_name,
        ev.assigned_location,
        ev.total_scans_for_event,
        ev.assigned_at,
        COUNT(cio.id) as actual_scans_recorded
      FROM event_volunteers ev
      LEFT JOIN volunteers v ON ev.volunteer_id = v.id
      LEFT JOIN check_in_outs cio ON ev.volunteer_id = cio.volunteer_id 
        AND cio.event_id = ${eventId}
      WHERE ev.event_id = ${eventId}
        AND ev.is_active = TRUE
      GROUP BY ev.volunteer_id, v.full_name, ev.assigned_location, 
               ev.total_scans_for_event, ev.assigned_at
      ORDER BY actual_scans_recorded DESC
    `;
  }

  /**
   * Bulk assign volunteers to event
   * @param {string} eventId - Event UUID
   * @param {Array} volunteerIds - Array of volunteer UUIDs
   * @param {string} managerId - Event manager UUID
   * @param {Object} defaults - Default settings for all volunteers
   * @returns {Promise<Object>}
   */
  static async bulkAssign(eventId, volunteerIds, managerId, defaults = {}) {
    const { assigned_location = null, permissions = ['SCAN', 'VIEW_STUDENTS'] } = defaults;

    const results = {
      success: [],
      failed: []
    };

    for (const volunteerId of volunteerIds) {
      try {
        const assignment = await this.assignVolunteer(eventId, volunteerId, managerId, {
          assigned_location,
          permissions
        });
        results.success.push(assignment);
      } catch (error) {
        results.failed.push({
          volunteer_id: volunteerId,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Bulk remove volunteers from event
   * @param {string} eventId - Event UUID
   * @param {Array} volunteerIds - Array of volunteer UUIDs
   * @returns {Promise<Object>}
   */
  static async bulkRemove(eventId, volunteerIds) {
    const results = {
      success: [],
      failed: []
    };

    for (const volunteerId of volunteerIds) {
      try {
        const removed = await this.removeVolunteer(eventId, volunteerId);
        if (removed) {
          results.success.push({ volunteer_id: volunteerId });
        } else {
          results.failed.push({
            volunteer_id: volunteerId,
            error: 'Volunteer not found or already inactive'
          });
        }
      } catch (error) {
        results.failed.push({
          volunteer_id: volunteerId,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Delete volunteer assignment (hard delete)
   * @param {string} eventId - Event UUID
   * @param {string} volunteerId - Volunteer UUID
   * @returns {Promise<boolean>}
   */
  static async delete(eventId, volunteerId) {
    await pool`
      DELETE FROM event_volunteers 
      WHERE event_id = ${eventId} 
        AND volunteer_id = ${volunteerId}
    `;
    return true;
  }

  /**
   * Get volunteer's currently active event assignment
   * Used for event context validation during QR scanning
   * @param {string} volunteerId - Volunteer UUID
   * @returns {Promise<Object|null>} Active event assignment or null
   */
  static async findActiveAssignment(volunteerId) {
    const result = await pool`
      SELECT 
        ev.*,
        e.event_name,
        e.event_code,
        e.event_type,
        e.price,
        e.currency,
        e.status as event_status
      FROM event_volunteers ev
      LEFT JOIN events e ON ev.event_id = e.id
      WHERE ev.volunteer_id = ${volunteerId}
        AND ev.is_active = TRUE
        AND e.status = 'ACTIVE'
      ORDER BY e.start_date DESC
      LIMIT 1
    `;

    return result[0] || null;
  }
}

export default EventVolunteer;
