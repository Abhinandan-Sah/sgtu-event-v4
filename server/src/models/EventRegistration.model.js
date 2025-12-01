// EventRegistration Model - Student registrations for events (free/paid)
import { pool } from '../config/db.js';

class EventRegistration {
  /**
   * Create registration for free event
   * @param {string} eventId - Event UUID
   * @param {string} studentId - Student UUID
   * @returns {Promise<Object>}
   */
  static async createFreeRegistration(eventId, studentId) {
    await pool('BEGIN');
    try {
      // Check event capacity before registration
      const event = await pool(
        `SELECT max_capacity, current_registrations, waitlist_enabled
         FROM events
         WHERE id = $1 AND status IN ('APPROVED', 'ACTIVE')
         LIMIT 1`,
        [eventId]
      );

      if (event.length === 0) {
        throw new Error('Event not found or not accepting registrations');
      }

      const { max_capacity, current_registrations, waitlist_enabled } = event[0];

      // Check if event is full
      if (max_capacity !== null && current_registrations >= max_capacity) {
        if (!waitlist_enabled) {
          throw new Error('Event is full and waitlist is not enabled');
        }
        // Register to waitlist
        const result = await pool(
          `INSERT INTO event_registrations (
             event_id, student_id, registration_type, payment_status, registration_status
           )
           VALUES (
             $1, $2, 'WAITLIST', 'NOT_REQUIRED', 'WAITLISTED'
           )
           RETURNING *`,
          [eventId, studentId]
        );
        await pool('COMMIT');
        return result[0];
      }

      const result = await pool(
        `INSERT INTO event_registrations (
           event_id, student_id, registration_type, payment_status
         )
         VALUES (
           $1, $2, 'FREE', 'NOT_REQUIRED'
         )
         RETURNING *`,
        [eventId, studentId]
      );

      // Increment current_registrations
      await pool(
        `UPDATE events
         SET current_registrations = current_registrations + 1,
             total_registrations = total_registrations + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [eventId]
      );

      await pool('COMMIT');
      return result[0];
    } catch (error) {
      await pool('ROLLBACK');
      throw error;
    }
  }

  /**
   * Create registration for paid event (payment pending)
   * @param {string} eventId - Event UUID
   * @param {string} studentId - Student UUID
   * @param {Object} paymentData - { amount, currency, razorpay_order_id }
   * @returns {Promise<Object>}
   */
  static async createPaidRegistration(eventId, studentId, paymentData) {
    const { amount, currency, razorpay_order_id } = paymentData;

    // Check event capacity before registration
    const event = await pool`
      SELECT max_capacity, current_registrations, waitlist_enabled
      FROM events
      WHERE id = ${eventId} AND status IN ('APPROVED', 'ACTIVE')
      LIMIT 1
    `;

    if (event.length === 0) {
      throw new Error('Event not found or not accepting registrations');
    }

    const { max_capacity, current_registrations, waitlist_enabled } = event[0];

    // Check if event is full
    if (max_capacity !== null && current_registrations >= max_capacity) {
      if (!waitlist_enabled) {
        throw new Error('Event is full and waitlist is not enabled');
      }
      // For paid events, we still create a pending payment registration even for waitlist
      // Payment will be processed only if spot becomes available
    }

    const result = await pool`
      INSERT INTO event_registrations (
        event_id, student_id, registration_type, payment_status,
        razorpay_order_id, payment_amount, payment_currency
      )
      VALUES (
        ${eventId}, ${studentId}, 'PAID', 'PENDING',
        ${razorpay_order_id}, ${amount}, ${currency}
      )
      RETURNING *
    `;

    return result[0];
  }

  /**
   * Complete payment for registration
   * @param {string} registrationId - Registration UUID
   * @param {Object} paymentData - { razorpay_payment_id, razorpay_signature }
   * @returns {Promise<Object>}
   */
  static async completePayment(registrationId, paymentData) {
    const { razorpay_payment_id, razorpay_signature } = paymentData;

    await pool('BEGIN');
    try {
      const result = await pool(
        `UPDATE event_registrations 
         SET 
           payment_status = 'COMPLETED',
           razorpay_payment_id = $1,
           razorpay_signature = $2,
           payment_completed_at = NOW(),
           registration_status = 'CONFIRMED',
           updated_at = NOW()
         WHERE id = $3
           AND payment_status = 'PENDING'
         RETURNING *`,
        [razorpay_payment_id, razorpay_signature, registrationId]
      );

      if (result.length === 0) {
        throw new Error('Registration not found or payment already completed');
      }

      // Increment current_registrations and revenue after successful payment
      await pool(
        `UPDATE events e
         SET current_registrations = current_registrations + 1,
             total_registrations = total_registrations + 1,
             total_paid_registrations = total_paid_registrations + 1,
             total_revenue = total_revenue + er.payment_amount,
             updated_at = NOW()
         FROM event_registrations er
         WHERE e.id = er.event_id
           AND er.id = $1`,
        [registrationId]
      );

      await pool('COMMIT');
      return result[0];
    } catch (error) {
      await pool('ROLLBACK');
      throw error;
    }
  }

  /**
   * Mark payment as failed
   * @param {string} registrationId - Registration UUID
   * @returns {Promise<Object>}
   */
  static async failPayment(registrationId) {
    const result = await pool`
      UPDATE event_registrations 
      SET 
        payment_status = 'FAILED',
        registration_status = 'CANCELLED',
        updated_at = NOW()
      WHERE id = ${registrationId}
      RETURNING *
    `;

    return result[0];
  }

  /**
   * Find registration by ID
   * @param {string} registrationId - Registration UUID
   * @returns {Promise<Object|null>}
   */
  static async findById(registrationId) {
    const result = await pool`
      SELECT 
        er.*,
        s.full_name as student_name,
        s.registration_no as student_registration_no,
        s.email as student_email,
        e.event_name,
        e.event_code,
        e.event_type,
        e.price as event_price
      FROM event_registrations er
      LEFT JOIN students s ON er.student_id = s.id
      LEFT JOIN events e ON er.event_id = e.id
      WHERE er.id = ${registrationId}
      LIMIT 1
    `;

    return result[0] || null;
  }

  /**
   * Get registration by student and event
   * @param {string} eventId - Event UUID
   * @param {string} studentId - Student UUID
   * @returns {Promise<Object|null>}
   */
  static async getByStudentAndEvent(eventId, studentId) {
    const result = await pool`
      SELECT * FROM event_registrations
      WHERE event_id = ${eventId} AND student_id = ${studentId}
      LIMIT 1
    `;
    return result[0] || null;
  }

  /**
   * Find registration by Razorpay order ID
   * @param {string} orderId - Razorpay order ID
   * @returns {Promise<Object|null>}
   */
  static async findByOrderId(orderId) {
    const result = await pool`
      SELECT * FROM event_registrations 
      WHERE razorpay_order_id = ${orderId}
      LIMIT 1
    `;

    return result[0] || null;
  }

  /**
   * Check if student is registered for event
   * @param {string} eventId - Event UUID
   * @param {string} studentId - Student UUID
   * @returns {Promise<Object|null>}
   */
  static async findByEventAndStudent(eventId, studentId) {
    const result = await pool`
      SELECT * FROM event_registrations 
      WHERE event_id = ${eventId} 
        AND student_id = ${studentId}
      LIMIT 1
    `;

    return result[0] || null;
  }

  /**
   * Get student's registered events
   * @param {string} studentId - Student UUID
   * @param {Object} filters - { status, payment_status }
   * @returns {Promise<Array>}
   */
  static async getStudentRegistrations(studentId, filters = {}) {
    const { status, payment_status } = filters;

    const conditions = ['er.student_id = $1'];
    const params = [studentId];

    if (status) {
      conditions.push(`er.registration_status = $${params.length + 1}`);
      params.push(status);
    }

    if (payment_status) {
      conditions.push(`er.payment_status = $${params.length + 1}`);
      params.push(payment_status);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool(
      `SELECT 
         er.*,
         e.event_name,
         e.event_code,
         e.event_type,
         e.event_category,
         e.venue,
         e.start_date,
         e.end_date,
         e.status as event_status,
         e.banner_image_url
       FROM event_registrations er
       LEFT JOIN events e ON er.event_id = e.id
       WHERE ${whereClause}
       ORDER BY er.registered_at DESC`,
      params
    );

    return result;
  }

  /**
   * Get event registrations (for event manager/admin)
   * @param {string} eventId - Event UUID
   * @param {Object} filters - { registration_status, payment_status, page, limit }
   * @returns {Promise<Object>}
   */
  static async getEventRegistrations(eventId, filters = {}) {
    const { registration_status, payment_status, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    const conditions = ['er.event_id = $1'];
    const params = [eventId];

    if (registration_status) {
      conditions.push(`er.registration_status = $${params.length + 1}`);
      params.push(registration_status);
    }

    if (payment_status) {
      conditions.push(`er.payment_status = $${params.length + 1}`);
      params.push(payment_status);
    }

    const whereClause = conditions.join(' AND ');
    
    // Add limit and offset
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const result = await pool(
      `SELECT 
         er.*,
         s.full_name as student_name,
         s.registration_no as student_registration_no,
         s.email as student_email,
         s.phone as student_phone,
         COUNT(*) OVER() as total_count
       FROM event_registrations er
       LEFT JOIN students s ON er.student_id = s.id
       WHERE ${whereClause}
       ORDER BY er.registered_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

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
   * Record check-in for event
   * @param {string} registrationId - Registration UUID
   * @returns {Promise<Object>}
   */
  static async recordCheckIn(registrationId) {
    const result = await pool`
      UPDATE event_registrations 
      SET 
        has_checked_in = TRUE,
        check_in_count = check_in_count + 1,
        last_check_in_at = NOW(),
        updated_at = NOW()
      WHERE id = ${registrationId}
      RETURNING *
    `;

    return result[0];
  }

  /**
   * Record feedback submission
   * @param {string} registrationId - Registration UUID
   * @returns {Promise<Object>}
   */
  static async recordFeedback(registrationId) {
    const result = await pool`
      UPDATE event_registrations 
      SET 
        has_submitted_feedback = TRUE,
        feedback_submitted_at = NOW(),
        updated_at = NOW()
      WHERE id = ${registrationId}
      RETURNING *
    `;

    return result[0];
  }

  /**
   * Update time spent at event
   * @param {string} registrationId - Registration UUID
   * @param {number} minutes - Additional minutes spent
   * @returns {Promise<Object>}
   */
  static async updateTimeSpent(registrationId, minutes) {
    const result = await pool`
      UPDATE event_registrations 
      SET 
        total_time_spent_minutes = total_time_spent_minutes + ${minutes},
        updated_at = NOW()
      WHERE id = ${registrationId}
      RETURNING *
    `;

    return result[0];
  }

  /**
   * Cancel registration
   * @param {string} registrationId - Registration UUID
   * @returns {Promise<Object>}
   */
  static async cancel(registrationId) {
    const result = await pool`
      UPDATE event_registrations 
      SET 
        registration_status = 'CANCELLED',
        updated_at = NOW()
      WHERE id = ${registrationId}
        AND registration_status = 'CONFIRMED'
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error('Registration not found or already cancelled');
    }

    return result[0];
  }

  /**
   * Process refund
   * @param {string} registrationId - Registration UUID
   * @param {number} refundAmount - Amount to refund
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>}
   */
  static async processRefund(registrationId, refundAmount, reason) {
    const result = await pool`
      UPDATE event_registrations 
      SET 
        payment_status = 'REFUNDED',
        refund_initiated = TRUE,
        refund_amount = ${refundAmount},
        refund_reason = ${reason},
        refunded_at = NOW(),
        registration_status = 'CANCELLED',
        updated_at = NOW()
      WHERE id = ${registrationId}
        AND payment_status = 'COMPLETED'
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error('Registration not found or payment not completed');
    }

    return result[0];
  }

  /**
   * Get registration statistics for event
   * @param {string} eventId - Event UUID
   * @returns {Promise<Object>}
   */
  static async getStats(eventId) {
    const result = await pool`
      SELECT 
        COUNT(*) as total_registrations,
        COUNT(*) FILTER (WHERE registration_type = 'FREE') as free_registrations,
        COUNT(*) FILTER (WHERE registration_type = 'PAID') as paid_registrations,
        COUNT(*) FILTER (WHERE payment_status = 'COMPLETED') as completed_payments,
        COUNT(*) FILTER (WHERE payment_status = 'PENDING') as pending_payments,
        COUNT(*) FILTER (WHERE has_checked_in = TRUE) as total_check_ins,
        COALESCE(SUM(payment_amount) FILTER (WHERE payment_status = 'COMPLETED'), 0) as total_revenue,
        COALESCE(AVG(total_time_spent_minutes) FILTER (WHERE has_checked_in = TRUE), 0) as avg_time_spent
      FROM event_registrations
      WHERE event_id = ${eventId}
    `;

    return result[0] || null;
  }

  /**
   * Delete registration (hard delete - for cleanup only)
   * @param {string} registrationId - Registration UUID
   * @returns {Promise<boolean>}
   */
  static async delete(registrationId) {
    await pool`
      DELETE FROM event_registrations 
      WHERE id = ${registrationId}
    `;
    return true;
  }
}

export default EventRegistration;
