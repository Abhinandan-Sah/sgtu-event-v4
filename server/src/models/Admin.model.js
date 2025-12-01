// Admin Model - High-level user with read-only dashboard access
import bcrypt from 'bcryptjs';

class AdminModel {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.full_name = data.full_name;
    this.role = data.role;
    this.is_active = data.is_active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static async hashPassword(password) {
    return await bcrypt.hash(password, 12);
  }

  async comparePassword(password) {
    return await bcrypt.compare(password, this.password_hash);
  }

  static async findById(id, sql) {
    const query = `SELECT * FROM admins WHERE id = $1 LIMIT 1`;
    const results = await sql(query, [id]);
    return results.length > 0 ? new AdminModel(results[0]) : null;
  }

  static async findByEmail(email, sql) {
    const query = `SELECT * FROM admins WHERE email = $1 LIMIT 1`;
    const results = await sql(query, [email]);
    return results.length > 0 ? new AdminModel(results[0]) : null;
  }

  static async create(data, sql) {
    const hashedPassword = await AdminModel.hashPassword(data.password);
    const query = `
      INSERT INTO admins (
        email, password_hash, full_name, role, is_active,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      RETURNING *
    `;
    const results = await sql(query, [
      data.email,
      hashedPassword,
      data.full_name,
      data.role || 'ADMIN'
    ]);
    return new AdminModel(results[0]);
  }

  static async findAllActive(sql) {
    const query = `
      SELECT * FROM admins 
      WHERE is_active = true
      ORDER BY full_name ASC
    `;
    const results = await sql(query);
    return results.map(row => new AdminModel(row));
  }
}

export default AdminModel;
