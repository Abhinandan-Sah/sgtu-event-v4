/**
 * Waitlist Service
 * Handles automatic waitlist promotion when capacity becomes available
 */
import { pool } from '../config/db.js';

/**
 * Promote students from waitlist to confirmed
 * @param {string} eventId - Event UUID
 * @param {number} spotsAvailable - Number of spots to fill
 * @returns {Promise<Object>} { promoted_count, promoted_students }
 */
export const promoteFromWaitlist = async (eventId, spotsAvailable = 1) => {
  if (spotsAvailable <= 0) {
    return { promoted_count: 0, promoted_students: [] };
  }

  try {
    // Get event details to determine registration type
    const eventResult = await pool`
      SELECT event_type, max_capacity, current_registrations
      FROM events
      WHERE id = ${eventId}
      LIMIT 1
    `;

    if (eventResult.length === 0) {
      throw new Error('Event not found');
    }

    const event = eventResult[0];

    // Check if event still has capacity
    if (event.max_capacity !== null && event.current_registrations >= event.max_capacity) {
      return { promoted_count: 0, promoted_students: [] };
    }

    // Calculate actual spots to promote (don't exceed capacity)
    let spotsToPromote = spotsAvailable;
    if (event.max_capacity !== null) {
      const availableCapacity = event.max_capacity - event.current_registrations;
      spotsToPromote = Math.min(spotsAvailable, availableCapacity);
    }

    if (spotsToPromote <= 0) {
      return { promoted_count: 0, promoted_students: [] };
    }

    // Query waitlisted students (FOR UPDATE SKIP LOCKED prevents race conditions)
    const waitlistedStudents = await pool`
      SELECT id, student_id
      FROM event_registrations
      WHERE event_id = ${eventId}
        AND registration_status = 'WAITLISTED'
      ORDER BY registered_at ASC
      LIMIT ${spotsToPromote}
      FOR UPDATE SKIP LOCKED
    `;

    if (waitlistedStudents.length === 0) {
      return { promoted_count: 0, promoted_students: [] };
    }

    // Determine registration type based on event type
    const registrationType = event.event_type === 'PAID' ? 'PAID' : 'FREE';
    const paymentStatus = event.event_type === 'PAID' ? 'PENDING' : 'NOT_REQUIRED';

    // Promote each waitlisted student
    const promotedStudentIds = [];
    for (const student of waitlistedStudents) {
      await pool`
        UPDATE event_registrations
        SET 
          registration_status = 'CONFIRMED',
          registration_type = ${registrationType},
          payment_status = ${paymentStatus},
          updated_at = NOW()
        WHERE id = ${student.id}
      `;

      promotedStudentIds.push(student.student_id);
    }

    // Note: Event counters are automatically updated by database trigger
    // See: update_event_registration_count() trigger

    return {
      promoted_count: promotedStudentIds.length,
      promoted_students: promotedStudentIds
    };
  } catch (error) {
    console.error('Error promoting from waitlist:', error);
    throw error;
  }
};

export default { promoteFromWaitlist };
