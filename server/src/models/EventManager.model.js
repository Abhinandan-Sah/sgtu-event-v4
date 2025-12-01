// EventManager Model - Manages events, assigns volunteers, requires admin approval
import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';

class EventManager {
  /**
   * Create new event manager (requires admin approval before active)
   * @param {Object} managerData - { email, password, full_name, phone, organization }
   * @returns {Promise<Object>} Created event manager
   */
  static async create(managerData) {
    const { email, password, full_name, phone, organization } = managerData;

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool`
      INSERT INTO event_managers (
        email, password_hash, full_name, phone, organization
      )
      VALUES (
        ${email}, ${password_hash}, ${full_name}, ${phone || null}, ${organization || null}
      )
      RETURNING 
        id, email, full_name, phone, organization, role,
        is_approved_by_admin, is_active, 
        total_events_created, total_events_completed,
        created_at, updated_at
    `;

    return result[0];
  }

  /**
   * Find event manager by email
   * @param {string} email - Event manager email
   * @returns {Promise<Object|null>}
   */
  static async findByEmail(email) {
    const result = await pool`
      SELECT * FROM event_managers 
      WHERE email = ${email} 
      LIMIT 1
    `;
    return result[0] || null;
  }

  /**
   * Find event manager by ID
   * @param {string} managerId - Event manager UUID
   * @returns {Promise<Object|null>}
   */
  static async findById(managerId) {
    const result = await pool`
      SELECT 
        em.*,
        a.full_name as approved_by_admin_name
      FROM event_managers em
      LEFT JOIN admins a ON em.approved_by_admin_id = a.id
      WHERE em.id = ${managerId}
      LIMIT 1
    `;
    return result[0] || null;
  }

  /**
   * Verify password
   * @param {string} plainPassword - Plain text password
   * @param {string} hashedPassword - Hashed password from database
   * @returns {Promise<boolean>}
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Update event manager profile
   * @param {string} managerId - Event manager UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>}
   */
  static async update(managerId, updates) {
    const allowedFields = ['full_name', 'phone', 'organization', 'password_hash'];
    const updateFields = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields[field] = updates[field];
      }
    }

    // If password is being updated, hash it
    if (updates.password) {
      const salt = await bcrypt.genSalt(12);
      updateFields.password_hash = await bcrypt.hash(updates.password, salt);
      delete updateFields.password; // Remove plain password from updates
    }

    if (Object.keys(updateFields).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Build SET clause with proper parameter placeholders
    const setClause = Object.keys(updateFields)
      .map((key, idx) => `${key} = $${idx + 2}`)
      .join(', ');

    const values = [managerId, ...Object.values(updateFields)];

    // Use pool with parameterized query (not template literal)
    const result = await pool(
      `UPDATE event_managers 
       SET ${setClause}, updated_at = NOW()
       WHERE id = $1
       RETURNING 
         id, email, full_name, phone, organization, role,
         is_approved_by_admin, is_active,
         total_events_created, total_events_completed,
         created_at, updated_at`,
      values
    );

    return result[0];
  }

  /**
   * Get all event managers (with optional filters)
   * @param {Object} filters - { is_active, page, limit }
   * @returns {Promise<Array>}
   */
  static async getAll(filters = {}) {
    const { is_active, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = pool`
      SELECT 
        em.*,
        a.full_name as approved_by_admin_name,
        COUNT(*) OVER() as total_count
      FROM event_managers em
      LEFT JOIN admins a ON em.approved_by_admin_id = a.id
      WHERE 1=1
    `;

    if (is_active !== undefined) {
      query = pool`${query} AND em.is_active = ${is_active}`;
    }

    query = pool`
      ${query}
      ORDER BY em.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await query;

    return {
      data: result,
      pagination: {
        page,
        limit,
        total: result[0]?.total_count || 0,
        totalPages: Math.ceil((result[0]?.total_count || 0) / limit)
      }
    };
  }

  /**
   * Deactivate event manager account
   * @param {string} managerId - Event manager UUID
   * @returns {Promise<Object>}
   */
  static async deactivate(managerId) {
    const result = await pool`
      UPDATE event_managers 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = ${managerId}
      RETURNING id, email, is_active
    `;

    return result[0];
  }

  /**
   * Reactivate event manager account
   * @param {string} managerId - Event manager UUID
   * @returns {Promise<Object>}
   */
  static async reactivate(managerId) {
    const result = await pool`
      UPDATE event_managers 
      SET is_active = TRUE, updated_at = NOW()
      WHERE id = ${managerId}
      RETURNING id, email, is_active
    `;

    return result[0];
  }

  /**
   * Get event manager statistics
   * @param {string} managerId - Event manager UUID
   * @returns {Promise<Object>}
   */
  static async getStats(managerId) {
    const result = await pool`
      SELECT 
        em.id,
        em.full_name,
        em.email,
        em.total_events_created,
        em.total_events_completed,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'ACTIVE') as active_events,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'PENDING_APPROVAL') as pending_events,
        COUNT(DISTINCT ev.volunteer_id) as total_volunteers_assigned,
        COALESCE(SUM(e.total_registrations), 0) as total_registrations_across_events,
        COALESCE(SUM(e.total_revenue), 0) as total_revenue_generated
      FROM event_managers em
      LEFT JOIN events e ON em.id = e.created_by_manager_id
      LEFT JOIN event_volunteers ev ON e.id = ev.event_id
      WHERE em.id = ${managerId}
      GROUP BY em.id, em.full_name, em.email, em.total_events_created, em.total_events_completed
    `;

    return result[0] || null;
  }

  /**
   * Delete event manager (soft delete - deactivate)
   * @param {string} managerId - Event manager UUID
   * @returns {Promise<boolean>}
   */
  static async delete(managerId) {
    // Check if manager has active events
    const activeEvents = await pool`
      SELECT COUNT(*) as count 
      FROM events 
      WHERE created_by_manager_id = ${managerId}
        AND status IN ('ACTIVE', 'APPROVED')
    `;

    if (activeEvents[0].count > 0) {
      throw new Error('Cannot delete event manager with active events');
    }

    // Soft delete
    await this.deactivate(managerId);
    return true;
  }
}

export default EventManager;
