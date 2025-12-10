// Student Model - Main user role for event participation
import bcrypt from 'bcryptjs';
import QRCodeService from '../services/qrCode.js';

class StudentModel {
  constructor(data) {
    this.id = data.id;
    this.registration_no = data.registration_no;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.full_name = data.full_name;
    this.school_id = data.school_id;
    this.phone = data.phone;
    this.role = data.role;
    this.is_inside_event = data.is_inside_event;
    this.total_scan_count = data.total_scan_count;
    this.feedback_count = data.feedback_count;
    this.has_completed_ranking = data.has_completed_ranking;
    this.selected_category = data.selected_category;
    this.last_checkin_at = data.last_checkin_at;
    this.last_checkout_at = data.last_checkout_at;
    this.total_active_duration_minutes = data.total_active_duration_minutes;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    // New authentication fields
    this.date_of_birth = data.date_of_birth;
    this.address = data.address;
    this.pincode = data.pincode;
    this.program_name = data.program_name;
    this.batch = data.batch;
    this.password_reset_required = data.password_reset_required;
    // Multi-event tracking fields (added in migration 005)
    this.total_events_registered = data.total_events_registered;
    this.total_paid_events = data.total_paid_events;
    this.total_spent_on_events = data.total_spent_on_events;
    // Additional fields from joins
    this.school_name = data.school_name;
  }

  // Hash password before saving
  static async hashPassword(password) {
    return await bcrypt.hash(password, 12);
  }

  // Compare password for login
  async comparePassword(password) {
    return await bcrypt.compare(password, this.password_hash);
  }

  // Find by registration number
  static async findByRegistrationNo(registrationNo, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.registration_no = $1
      LIMIT 1
    `;
    const results = await sql(query, [registrationNo]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  // Find by email
  static async findByEmail(email, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.email = $1
      LIMIT 1
    `;
    const results = await sql(query, [email]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  // Find by ID
  static async findById(id, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.id = $1
      LIMIT 1
    `;
    const results = await sql(query, [id]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  // Find by QR token method removed - now using findByRegistrationNo() with rotating tokens

  // Create new student
  static async create(data, sql) {
    const hashedPassword = await StudentModel.hashPassword(data.password);
    
    // First insert student without QR
    const query = `
      INSERT INTO students (
        registration_no, email, password_hash, full_name, school_id, 
        phone, date_of_birth, pincode, address, program_name, batch,
        role, is_inside_event, total_scan_count, 
        feedback_count, has_completed_ranking, 
        password_reset_required,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'STUDENT', false, 0, 0, false, true, NOW(), NOW())
      RETURNING *
    `;
    const results = await sql(query, [
      data.registration_no,
      data.email,
      hashedPassword,
      data.full_name,
      data.school_id,
      data.phone || null,
      data.date_of_birth,
      data.pincode,
      data.address || null,
      data.program_name || null,
      data.batch || null
    ]);
    
    const student = new StudentModel(results[0]);
    
    // QR code tokens are now generated on-demand (rotating every 30 seconds)
    // No need to store in database anymore
    
    return student;
  }

  // Bulk insert students (for Excel import - 11k students)
  // Enhanced version with all fields and transaction support
  static async bulkCreate(students, sql, batchSize = 1000) {
    if (!students || students.length === 0) {
      return {
        success: true,
        inserted: 0,
        failed: 0,
        total: 0,
        errors: [],
      };
    }

    let insertedCount = 0;
    let failedCount = 0;
    const errors = [];

    try {
      // Start transaction
      await sql('BEGIN');

      // Process in batches
      for (let i = 0; i < students.length; i += batchSize) {
        const batch = students.slice(i, i + batchSize);
        const values = [];
        const placeholders = [];

        // Prepare batch data with all fields
        for (let j = 0; j < batch.length; j++) {
          const student = batch[j];
          const offset = j * 11; // 11 fields per student

          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
          );

          // Hash password
          const hashedPassword = await StudentModel.hashPassword(student.password);

          values.push(
            student.registration_no,
            student.email || null,
            hashedPassword,
            student.full_name,
            student.school_id,
            student.phone || null,
            student.date_of_birth || null,
            student.pincode || null,
            student.address || null,
            student.program_name || null,
            student.batch ? parseInt(student.batch, 10) : null
          );
        }

        const query = `
          INSERT INTO students (
            registration_no, email, password_hash, full_name, school_id, 
            phone, date_of_birth, pincode, address, program_name, batch,
            role, is_inside_event, total_scan_count, feedback_count, 
            has_completed_ranking, password_reset_required, created_at, updated_at
          )
          VALUES ${placeholders.map(
            (p) =>
              p.replace(
                /\)/g,
                ", 'STUDENT', false, 0, 0, false, true, NOW(), NOW())"
              )
          ).join(', ')}
          ON CONFLICT (registration_no) DO NOTHING
          RETURNING registration_no
        `;

        try {
          const batchResults = await sql(query, values);
          insertedCount += batchResults.length;

          // Track skipped rows (duplicates)
          const skippedCount = batch.length - batchResults.length;
          if (skippedCount > 0) {
            failedCount += skippedCount;
            // Note: We can't identify exact rows that were skipped with ON CONFLICT DO NOTHING
            // This is a limitation of the current approach
          }
        } catch (batchError) {
          // If batch fails, record error
          failedCount += batch.length;
          errors.push({
            batch: Math.floor(i / batchSize) + 1,
            error: batchError.message,
            affectedRows: `${i + 1}-${Math.min(i + batch.length, students.length)}`,
          });
          throw batchError; // Re-throw to trigger rollback
        }
      }

      // Commit transaction
      await sql('COMMIT');

      return {
        success: true,
        inserted: insertedCount,
        failed: failedCount,
        total: students.length,
        errors,
      };
    } catch (error) {
      // Rollback transaction on error
      await sql('ROLLBACK');
      throw new Error(`Bulk insert failed: ${error.message}`);
    }
  }

  // Update student profile
  static async updateProfile(id, data, sql) {
    const query = `
      UPDATE students
      SET full_name = COALESCE($1, full_name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    const results = await sql(query, [
      data.full_name,
      data.email,
      data.phone,
      id
    ]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  // Set selected category (Category 1 / Category 2 / Both)
  static async setCategory(id, category, sql) {
    const query = `
      UPDATE students
      SET selected_category = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const results = await sql(query, [category, id]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  // Increment feedback count (Category 1)
  // Note: Feedback limit is now enforced per-event in controllers based on stall count
  static async incrementFeedbackCount(id, sql) {
    const query = `
      UPDATE students
      SET feedback_count = feedback_count + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING feedback_count
    `;
    const results = await sql(query, [id]);
    return results[0]?.feedback_count || 0;
  }

  // Mark ranking as completed (Category 2)
  static async markRankingComplete(id, sql) {
    const query = `
      UPDATE students
      SET has_completed_ranking = true,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const results = await sql(query, [id]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  // Process check-in/check-out (odd/even logic)
  static async processCheckInOut(id, sql) {
    const query = `
      UPDATE students
      SET total_scan_count = total_scan_count + 1,
          is_inside_event = CASE 
            WHEN (total_scan_count + 1) % 2 = 1 THEN true
            ELSE false
          END,
          last_checkin_at = CASE 
            WHEN (total_scan_count + 1) % 2 = 1 THEN NOW()
            ELSE last_checkin_at
          END,
          last_checkout_at = CASE 
            WHEN (total_scan_count + 1) % 2 = 0 THEN NOW()
            ELSE last_checkout_at
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const results = await sql(query, [id]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  // Update total active duration (calculated on checkout)
  static async updateActiveDuration(id, additionalMinutes, sql) {
    const query = `
      UPDATE students
      SET total_active_duration_minutes = total_active_duration_minutes + $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING total_active_duration_minutes
    `;
    const results = await sql(query, [additionalMinutes, id]);
    return results[0]?.total_active_duration_minutes || 0;
  }

  // Get leaderboard: Top students by feedback count
  static async getTopByFeedback(limit = 100, sql) {
    const query = `
      SELECT 
        s.id, s.registration_no, s.full_name, s.feedback_count,
        sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.feedback_count > 0
      ORDER BY s.feedback_count DESC, s.created_at ASC
      LIMIT $1
    `;
    const results = await sql(query, [limit]);
    return results.map(row => new StudentModel(row));
  }

  // Get leaderboard: Top students by active duration
  static async getTopByDuration(limit = 100, sql) {
    const query = `
      SELECT 
        s.id, s.registration_no, s.full_name, s.total_active_duration_minutes,
        sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.total_active_duration_minutes > 0
      ORDER BY s.total_active_duration_minutes DESC, s.created_at ASC
      LIMIT $1
    `;
    const results = await sql(query, [limit]);
    return results.map(row => new StudentModel(row));
  }

  // Get students by school (for admin filtering)
  static async findBySchool(schoolId, limit = 100, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.school_id = $1
      ORDER BY s.full_name ASC
    `;
    const results = await sql(query, [schoolId]);
    return results.map(row => new StudentModel(row));
  }

  // Count students currently inside event (real-time stat)
  static async countInsideEvent(sql) {
    const query = `
      SELECT COUNT(*) as count
      FROM students
      WHERE is_inside_event = true
    `;
    const results = await sql(query);
    return parseInt(results[0]?.count || 0);
  }

  // Get all students with pagination (for admin)
  static async findAll(limit = 100, offset = 0, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const results = await sql(query, [limit, offset]);
    return results.map(row => new StudentModel(row));
  }

  // Count total students
  static async count(sql) {
    const query = `SELECT COUNT(*) as count FROM students`;
    const results = await sql(query);
    return parseInt(results[0]?.count || 0);
  }

  // Get student statistics (for admin dashboard)
  static async getStats(sql) {
    const query = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(*) FILTER (WHERE is_inside_event = true) as currently_inside,
        AVG(feedback_count) as avg_feedback_count,
        AVG(total_active_duration_minutes) as avg_duration,
        COUNT(*) FILTER (WHERE has_completed_ranking = true) as completed_rankings,
        COUNT(*) FILTER (WHERE feedback_count > 0) as students_with_feedback
      FROM students
    `;
    const results = await sql(query);
    return results[0];
  }

  // ==================== Validation Methods ====================
  
  /**
   * Validate pincode format (6 digits)
   * @param {string} pincode - Pincode to validate
   * @returns {boolean} - True if valid
   */
  static isValidPincode(pincode) {
    return /^[0-9]{6}$/.test(pincode);
  }

  /**
   * Validate date of birth (must be at least 15 years old)
   * @param {string} dateOfBirth - Date of birth (YYYY-MM-DD format)
   * @returns {boolean} - True if valid
   */
  static isValidDateOfBirth(dateOfBirth) {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    const fifteenYearsAgo = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());
    return dob <= fifteenYearsAgo && dob >= new Date('1990-01-01');
  }

  /**
   * Validate password strength (min 8 chars, at least 1 letter and 1 number)
   * @param {string} password - Password to validate
   * @returns {boolean} - True if valid
   */
  static isValidPassword(password) {
    return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
  }

  // ==================== Password Reset Methods ====================
  
  /**
   * Verify student credentials for password reset
   * @param {string} registrationNo - Student registration number
   * @param {string} dateOfBirth - Date of birth (YYYY-MM-DD format)
   * @param {string} pincode - 6-digit pincode
   * @param {Function} sql - Database query function
   * @returns {StudentModel|null} - Student if credentials match, null otherwise
   */
  static async verifyResetCredentials(registrationNo, dateOfBirth, pincode, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM students s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.registration_no = $1
        AND s.date_of_birth = $2
        AND s.pincode = $3
      LIMIT 1
    `;
    const results = await sql(query, [registrationNo, dateOfBirth, pincode]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

  /**
   * Reset student password and clear first-time login flags
   * @param {number} studentId - Student ID
   * @param {string} newPassword - New plain text password
   * @param {Function} sql - Database query function
   * @returns {StudentModel|null} - Updated student
   */
  static async resetPassword(studentId, newPassword, sql) {
    const hashedPassword = await StudentModel.hashPassword(newPassword);
    const query = `
      UPDATE students
      SET password_hash = $1,
          password_reset_required = false,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const results = await sql(query, [hashedPassword, studentId]);
    return results.length > 0 ? new StudentModel(results[0]) : null;
  }

}

export default StudentModel;
