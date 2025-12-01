// CheckInOut Model - Tracks student entry/exit with odd/even scan logic
class CheckInOutModel {
  constructor(data) {
    this.id = data.id;
    this.student_id = data.student_id;
    this.volunteer_id = data.volunteer_id;
    this.scan_type = data.scan_type;
    this.scan_number = data.scan_number;
    this.scanned_at = data.scanned_at;
    this.duration_minutes = data.duration_minutes;
    this.event_id = data.event_id;
    // Join fields
    this.student_name = data.student_name;
    this.registration_no = data.registration_no;
    this.volunteer_name = data.volunteer_name;
  }

  static async create(data, sql) {
    const query = `
      INSERT INTO check_in_outs (
        student_id, volunteer_id, scan_type, scan_number, event_id, scanned_at, duration_minutes
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING *
    `;
    const results = await sql(query, [
      data.student_id,
      data.volunteer_id,
      data.scan_type,
      data.scan_number,
      data.event_id || null,
      data.duration_minutes || null
    ]);
    return new CheckInOutModel(results[0]);
  }

  // Get all check-in/out records for a student
  static async findByStudent(studentId, sql) {
    const query = `
      SELECT 
        c.*,
        s.full_name as student_name,
        s.registration_no,
        v.full_name as volunteer_name
      FROM check_in_outs c
      LEFT JOIN students s ON c.student_id = s.id
      LEFT JOIN volunteers v ON c.volunteer_id = v.id
      WHERE c.student_id = $1
      ORDER BY c.scanned_at DESC
    `;
    const results = await sql(query, [studentId]);
    return results.map(row => new CheckInOutModel(row));
  }

  // Alias method for consistency with controller naming
  static async findByStudentId(studentId, sql) {
    return await CheckInOutModel.findByStudent(studentId, sql);
  }

  // Get all check-in/out records by volunteer ID
  static async findByVolunteerId(volunteerId, sql) {
    const query = `
      SELECT 
        c.*,
        s.full_name as student_name,
        s.registration_no,
        v.full_name as volunteer_name
      FROM check_in_outs c
      LEFT JOIN students s ON c.student_id = s.id
      LEFT JOIN volunteers v ON c.volunteer_id = v.id
      WHERE c.volunteer_id = $1
      ORDER BY c.scanned_at DESC
    `;
    const results = await sql(query, [volunteerId]);
    return results.map(row => new CheckInOutModel(row));
  }

  // Get all check-in/out records by volunteer ID for specific event
  static async findByVolunteerAndEvent(volunteerId, eventId, sql) {
    const query = `
      SELECT 
        c.*,
        s.full_name as student_name,
        s.registration_no,
        v.full_name as volunteer_name
      FROM check_in_outs c
      LEFT JOIN students s ON c.student_id = s.id
      LEFT JOIN volunteers v ON c.volunteer_id = v.id
      WHERE c.volunteer_id = $1 AND c.event_id = $2
      ORDER BY c.scanned_at DESC
    `;
    const results = await sql(query, [volunteerId, eventId]);
    return results.map(row => new CheckInOutModel(row));
  }

  // Get last check-in record (to calculate duration on checkout)
  static async getLastCheckIn(studentId, sql) {
    const query = `
      SELECT * FROM check_in_outs
      WHERE student_id = $1 AND scan_type = 'CHECKIN'
      ORDER BY scanned_at DESC
      LIMIT 1
    `;
    const results = await sql(query, [studentId]);
    return results.length > 0 ? new CheckInOutModel(results[0]) : null;
  }

  // Alias for compatibility
  static async findLastCheckIn(studentId, sql) {
    return await CheckInOutModel.getLastCheckIn(studentId, sql);
  }

  // Check if student has active check-in (no checkout yet)
  static async findActiveCheckIn(studentId, sql) {
    const query = `
      SELECT * FROM check_in_outs
      WHERE student_id = $1 AND scan_type = 'CHECKIN'
      AND id NOT IN (
        SELECT DISTINCT 
          (SELECT id FROM check_in_outs WHERE student_id = $1 AND scan_type = 'CHECKIN' AND scanned_at < c.scanned_at ORDER BY scanned_at DESC LIMIT 1)
        FROM check_in_outs c
        WHERE student_id = $1 AND scan_type = 'CHECKOUT'
      )
      ORDER BY scanned_at DESC
      LIMIT 1
    `;
    const results = await sql(query, [studentId]);
    return results.length > 0 ? new CheckInOutModel(results[0]) : null;
  }

  // Find active check-in for student in specific event
  static async findActiveCheckInForEvent(studentId, eventId, sql) {
    const query = `
      SELECT * FROM check_in_outs
      WHERE student_id = $1 AND event_id = $2 AND scan_type = 'CHECKIN'
      AND id NOT IN (
        SELECT DISTINCT 
          (SELECT id FROM check_in_outs WHERE student_id = $1 AND event_id = $2 AND scan_type = 'CHECKIN' AND scanned_at < c.scanned_at ORDER BY scanned_at DESC LIMIT 1)
        FROM check_in_outs c
        WHERE student_id = $1 AND event_id = $2 AND scan_type = 'CHECKOUT'
      )
      ORDER BY scanned_at DESC
      LIMIT 1
    `;
    const results = await sql(query, [studentId, eventId]);
    return results.length > 0 ? new CheckInOutModel(results[0]) : null;
  }

  // Get check-in history for student in specific event
  static async getEventCheckInHistory(studentId, eventId, sql) {
    const query = `
      SELECT 
        c.*,
        s.full_name as student_name,
        s.registration_no,
        v.full_name as volunteer_name
      FROM check_in_outs c
      LEFT JOIN students s ON c.student_id = s.id
      LEFT JOIN volunteers v ON c.volunteer_id = v.id
      WHERE c.student_id = $1 AND c.event_id = $2
      ORDER BY c.scanned_at DESC
    `;
    const results = await sql(query, [studentId, eventId]);
    return results.map(row => new CheckInOutModel(row));
  }

  // Update checkout with duration
  static async checkOut(checkInId, durationMinutes, sql) {
    const query = `
      UPDATE check_in_outs
      SET duration_minutes = $1
      WHERE id = $2
      RETURNING *
    `;
    const results = await sql(query, [durationMinutes, checkInId]);
    return results.length > 0 ? new CheckInOutModel(results[0]) : null;
  }

  // Update duration for checkout record
  static async updateDuration(id, durationMinutes, sql) {
    const query = `
      UPDATE check_in_outs
      SET duration_minutes = $1
      WHERE id = $2
      RETURNING *
    `;
    const results = await sql(query, [durationMinutes, id]);
    return results.length > 0 ? new CheckInOutModel(results[0]) : null;
  }

  // Get today's scans (for monitoring)
  static async getTodayScans(limit = 1000, sql) {
    const query = `
      SELECT 
        c.*,
        s.full_name as student_name,
        s.registration_no,
        v.full_name as volunteer_name
      FROM check_in_outs c
      LEFT JOIN students s ON c.student_id = s.id
      LEFT JOIN volunteers v ON c.volunteer_id = v.id
      WHERE DATE(c.scanned_at) = CURRENT_DATE
      ORDER BY c.scanned_at DESC
      LIMIT $1
    `;
    const results = await sql(query, [limit]);
    return results.map(row => new CheckInOutModel(row));
  }

  // Get check-in/out statistics
  static async getStats(sql) {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE scan_type = 'CHECKIN') as total_checkins,
        COUNT(*) FILTER (WHERE scan_type = 'CHECKOUT') as total_checkouts,
        COUNT(DISTINCT student_id) as unique_students,
        COUNT(*) FILTER (WHERE DATE(scanned_at) = CURRENT_DATE) as today_scans
      FROM check_in_outs
    `;
    const results = await sql(query);
    return results[0];
  }

  // Calculate total active duration for a student (sum of all checkout durations)
  static async calculateTotalDuration(studentId, sql) {
    const query = `
      SELECT 
        COALESCE(SUM(duration_minutes), 0) as total_duration_minutes
      FROM check_in_outs
      WHERE student_id = $1 AND scan_type = 'CHECKOUT' AND duration_minutes IS NOT NULL
    `;
    const results = await sql(query, [studentId]);
    return parseInt(results[0]?.total_duration_minutes || 0);
  }
}

export default CheckInOutModel;
