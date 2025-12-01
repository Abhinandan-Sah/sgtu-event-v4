// School Model - University schools/departments
class SchoolModel {
  constructor(data) {
    this.id = data.id;
    this.school_name = data.school_name;
    this.description = data.description;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static async findAll(sql) {
    const query = `SELECT * FROM schools ORDER BY school_name ASC`;
    const results = await sql(query);
    return results.map(row => new SchoolModel(row));
  }

  static async findById(id, sql) {
    const query = `SELECT * FROM schools WHERE id = $1 LIMIT 1`;
    const results = await sql(query, [id]);
    return results.length > 0 ? new SchoolModel(results[0]) : null;
  }

  static async findByName(name, sql) {
    const query = `SELECT * FROM schools WHERE school_name = $1 LIMIT 1`;
    const results = await sql(query, [name]);
    return results.length > 0 ? new SchoolModel(results[0]) : null;
  }

  static async create(data, sql) {
    const query = `
      INSERT INTO schools (school_name, description, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      RETURNING *
    `;
    const results = await sql(query, [
      data.school_name,
      data.description || null
    ]);
    return new SchoolModel(results[0]);
  }

  static async update(id, data, sql) {
    const query = `
      UPDATE schools 
      SET school_name = COALESCE($1, school_name),
          description = COALESCE($2, description),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const results = await sql(query, [data.school_name, data.description, id]);
    return results.length > 0 ? new SchoolModel(results[0]) : null;
  }

  // Get all stalls for this school
  static async getStallsBySchool(schoolId, sql) {
    const query = `
      SELECT s.* FROM stalls s
      WHERE s.school_id = $1 AND s.is_active = true
      ORDER BY s.stall_name ASC
    `;
    return await sql(query, [schoolId]);
  }

  // Get school statistics
  static async getSchoolStats(schoolId, sql) {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM students WHERE school_id = $1) as total_students,
        (SELECT COUNT(*) FROM stalls WHERE school_id = $1) as total_stalls,
        (SELECT COUNT(*) FROM feedbacks f 
         JOIN stalls st ON f.stall_id = st.id 
         WHERE st.school_id = $1) as total_feedbacks
    `;
    const results = await sql(query, [schoolId]);
    return results[0];
  }
}

export default SchoolModel;
