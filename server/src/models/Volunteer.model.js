// Volunteer Model - Authorized staff to scan student QR codes
import bcrypt from 'bcryptjs';

class VolunteerModel {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.full_name = data.full_name;
    this.phone = data.phone;
    this.role = data.role;
    this.assigned_location = data.assigned_location;
    this.is_active = data.is_active;
    this.total_scans_performed = data.total_scans_performed;
    this.event_id = data.event_id;
    this.password_reset_required = data.password_reset_required;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static async hashPassword(password) {
    return await bcrypt.hash(password, 12);
  }

  async comparePassword(password) {
    return await bcrypt.compare(password, this.password_hash);
  }

  /**
   * Generate default password for volunteers
   * Strategy: firstname@eventcode (e.g., neha@TECH-FEST-2025)
   * @param {Object} volunteerData - { full_name, event_code }
   * @returns {string} Generated password
   */
  static generateDefaultPassword(volunteerData) {
    const firstName = volunteerData.full_name.split(' ')[0].toLowerCase();
    const eventCode = volunteerData.event_code || 'EVENT';
    return `${firstName}@${eventCode}`;
  }

  static async findById(id, sql) {
    const query = `SELECT * FROM volunteers WHERE id = $1 LIMIT 1`;
    const results = await sql(query, [id]);
    return results.length > 0 ? new VolunteerModel(results[0]) : null;
  }

  static async findByEmail(email, sql) {
    const query = `SELECT * FROM volunteers WHERE email = $1 LIMIT 1`;
    const results = await sql(query, [email]);
    return results.length > 0 ? new VolunteerModel(results[0]) : null;
  }

  static async create(data, sql) {
    // Generate default password if not provided or empty
    const password = (data.password && data.password.trim() !== '') 
      ? data.password 
      : VolunteerModel.generateDefaultPassword(data);
    const hashedPassword = await VolunteerModel.hashPassword(password);
    
    // If password was auto-generated, require reset on first login
    const passwordResetRequired = !data.password || data.password.trim() === '';
    
    const query = `
      INSERT INTO volunteers (
        email, password_hash, full_name, phone, role,
        assigned_location, is_active, total_scans_performed,
        event_id, password_reset_required, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'VOLUNTEER', $5, true, 0, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    const results = await sql(query, [
      data.email,
      hashedPassword,
      data.full_name,
      data.phone || null,
      data.assigned_location || null,
      data.event_id || null,
      passwordResetRequired
    ]);
    return new VolunteerModel(results[0]);
  }

  static async update(id, data, sql) {
    const query = `
      UPDATE volunteers
      SET full_name = COALESCE($1, full_name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          assigned_location = COALESCE($4, assigned_location),
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const results = await sql(query, [
      data.full_name,
      data.email,
      data.phone,
      data.assigned_location,
      data.is_active,
      id
    ]);
    return results.length > 0 ? new VolunteerModel(results[0]) : null;
  }

  // Increment scan count when volunteer scans a student QR
  static async incrementScanCount(id, sql) {
    const query = `
      UPDATE volunteers
      SET total_scans_performed = total_scans_performed + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING total_scans_performed
    `;
    const results = await sql(query, [id]);
    return results[0]?.total_scans_performed || 0;
  }

  static async findAllActive(sql) {
    const query = `
      SELECT * FROM volunteers 
      WHERE is_active = true
      ORDER BY full_name ASC
    `;
    const results = await sql(query);
    return results.map(row => new VolunteerModel(row));
  }

  static async findAll(sql) {
    const query = `SELECT * FROM volunteers ORDER BY created_at DESC`;
    const results = await sql(query);
    return results.map(row => new VolunteerModel(row));
  }

  static async getStats(sql) {
    const query = `
      SELECT 
        COUNT(*) as total_volunteers,
        COUNT(*) FILTER (WHERE is_active = true) as active_volunteers,
        SUM(total_scans_performed) as total_scans,
        AVG(total_scans_performed) as avg_scans_per_volunteer
      FROM volunteers
    `;
    const results = await sql(query);
    return results[0];
  }

  /**
   * Change password and clear password_reset_required flag
   * @param {string} id - Volunteer ID
   * @param {string} newPassword - New password (plain text)
   * @param {function} sql - Query function
   */
  static async changePassword(id, newPassword, sql) {
    const hashedPassword = await VolunteerModel.hashPassword(newPassword);
    const query = `
      UPDATE volunteers
      SET password_hash = $1,
          password_reset_required = false,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const results = await sql(query, [hashedPassword, id]);
    return results.length > 0 ? new VolunteerModel(results[0]) : null;
  }

  /**
   * Reset password to default (firstname@eventcode)
   * @param {string} id - Volunteer ID
   * @param {function} sql - Query function
   */
  static async resetToDefaultPassword(id, sql) {
    // Get volunteer details to generate default password
    const volunteer = await VolunteerModel.findById(id, sql);
    if (!volunteer || !volunteer.event_id) {
      throw new Error('Volunteer not found or not assigned to event');
    }

    // Get event_code from event
    const eventResult = await sql('SELECT event_code FROM events WHERE id = $1', [volunteer.event_id]);
    if (eventResult.length === 0) {
      throw new Error('Event not found');
    }

    const event_code = eventResult[0].event_code;
    const defaultPassword = VolunteerModel.generateDefaultPassword({
      full_name: volunteer.full_name,
      event_code
    });

    const hashedPassword = await VolunteerModel.hashPassword(defaultPassword);
    const query = `
      UPDATE volunteers
      SET password_hash = $1,
          password_reset_required = true,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const results = await sql(query, [hashedPassword, id]);
    return {
      volunteer: results.length > 0 ? new VolunteerModel(results[0]) : null,
      default_password: defaultPassword
    };
  }
}

export default VolunteerModel;
