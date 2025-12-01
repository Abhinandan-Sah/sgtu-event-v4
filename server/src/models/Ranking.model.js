// Ranking Model - Student rankings for stalls (Category 2 - One-time top 3)
class RankingModel {
  constructor(data) {
    this.id = data.id;
    this.student_id = data.student_id;
    this.stall_id = data.stall_id;
    this.rank = data.rank;
    this.submitted_at = data.submitted_at;
    this.event_id = data.event_id;
    // Join fields
    this.student_name = data.student_name;
    this.registration_no = data.registration_no;
    this.stall_name = data.stall_name;
    this.stall_number = data.stall_number;
    this.school_name = data.school_name;
  }

  static async create(data, query) {
    const queryText = `
      INSERT INTO rankings (student_id, stall_id, rank, event_id, submitted_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
    const results = await query(queryText, [
      data.student_id,
      data.stall_id,
      data.rank,
      data.event_id || null
    ]);
    return new RankingModel(results[0]);
  }

  // Bulk create rankings (student submits all 3 at once)
  static async bulkCreate(rankings, query) {
    if (!rankings || rankings.length !== 3) {
      throw new Error('Must provide exactly 3 rankings');
    }

    const values = [];
    const placeholders = [];
    
    for (let i = 0; i < rankings.length; i++) {
      const offset = i * 4;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      values.push(
        rankings[i].student_id,
        rankings[i].stall_id,
        rankings[i].rank,
        rankings[i].event_id || null
      );
    }

    const queryText = `
      INSERT INTO rankings (student_id, stall_id, rank, event_id)
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;
    
    const results = await query(queryText, values);
    return results.map(row => new RankingModel(row));
  }

  // Get all rankings
  static async findAll(query) {
    const queryText = `
      SELECT r.*,
        s.full_name as student_name,
        s.registration_no,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM rankings r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN stalls st ON r.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      ORDER BY r.rank ASC, r.submitted_at ASC
    `;
    const results = await query(queryText);
    return results.map(row => new RankingModel(row));
  }

  // Get student's rankings
  static async findByStudent(studentId, query) {
    const queryText = `
      SELECT r.*,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM rankings r
      LEFT JOIN stalls st ON r.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE r.student_id = $1
      ORDER BY r.rank ASC
    `;
    const results = await query(queryText, [studentId]);
    return results.map(row => new RankingModel(row));
  }

  // Find ranking by ID
  static async findById(id, query) {
    const queryText = `
      SELECT r.*,
        s.full_name as student_name,
        s.registration_no,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM rankings r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN stalls st ON r.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE r.id = $1
      LIMIT 1
    `;
    const results = await query(queryText, [id]);
    return results.length > 0 ? new RankingModel(results[0]) : null;
  }

  // Find ranking by stall ID (one stall can have multiple rankings from different students)
  static async findByStallId(stallId, query) {
    const queryText = `
      SELECT r.*,
        s.full_name as student_name,
        s.registration_no,
        sc.school_name as student_school
      FROM rankings r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE r.stall_id = $1
      ORDER BY r.rank ASC, r.submitted_at ASC
    `;
    const results = await query(queryText, [stallId]);
    return results.map(row => new RankingModel(row));
  }

  // Update ranking
  static async update(id, data, query) {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (data.rank !== undefined) {
      updates.push(`rank = $${paramCount}`);
      values.push(data.rank);
      paramCount++;
    }

    if (data.score !== undefined) {
      updates.push(`score = $${paramCount}`);
      values.push(data.score);
      paramCount++;
    }

    if (updates.length === 0) {
      return null;
    }

    values.push(id);
    const queryText = `
      UPDATE rankings
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const results = await query(queryText, values);
    return results.length > 0 ? new RankingModel(results[0]) : null;
  }

  // Delete ranking
  static async delete(id, query) {
    const queryText = `DELETE FROM rankings WHERE id = $1 RETURNING *`;
    const results = await query(queryText, [id]);
    return results.length > 0;
  }

  // Check if student has completed ranking
  static async hasStudentRanked(studentId, query) {
    const queryText = `
      SELECT COUNT(*) as count FROM rankings WHERE student_id = $1
    `;
    const results = await query(queryText, [studentId]);
    return parseInt(results[0]?.count || 0) === 3;
  }

  // Get student's rankings for a specific event
  static async findByStudentAndEvent(studentId, eventId, query) {
    const queryText = `
      SELECT r.*,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM rankings r
      LEFT JOIN stalls st ON r.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE r.student_id = $1 AND r.event_id = $2
      ORDER BY r.rank ASC
    `;
    const results = await query(queryText, [studentId, eventId]);
    return results.map(row => new RankingModel(row));
  }

  // Check if student has completed ranking for a specific event
  static async hasCompletedEventRanking(studentId, eventId, query) {
    const queryText = `
      SELECT COUNT(*) as count FROM rankings WHERE student_id = $1 AND event_id = $2
    `;
    const results = await query(queryText, [studentId, eventId]);
    return parseInt(results[0]?.count || 0) === 3;
  }

  // Get all rankings for a stall
  static async findByStall(stallId, query) {
    const queryText = `
      SELECT r.*,
        s.full_name as student_name,
        s.registration_no,
        sc.school_name as student_school
      FROM rankings r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE r.stall_id = $1
      ORDER BY r.rank ASC, r.submitted_at ASC
    `;
    const results = await query(queryText, [stallId]);
    return results.map(row => new RankingModel(row));
  }

  // Get stall ranking statistics
  static async getStallStats(stallId, query) {
    const queryText = `
      SELECT 
        COUNT(*) FILTER (WHERE rank = 1) as rank_1_count,
        COUNT(*) FILTER (WHERE rank = 2) as rank_2_count,
        COUNT(*) FILTER (WHERE rank = 3) as rank_3_count,
        (COUNT(*) FILTER (WHERE rank = 1) * 3 +
         COUNT(*) FILTER (WHERE rank = 2) * 2 +
         COUNT(*) FILTER (WHERE rank = 3) * 1) as weighted_score
      FROM rankings
      WHERE stall_id = $1
    `;
    const results = await query(queryText, [stallId]);
    return results[0];
  }

  // Global ranking statistics
  static async getGlobalStats(query) {
    const queryText = `
      SELECT 
        COUNT(DISTINCT student_id) as students_who_ranked,
        COUNT(*) as total_rankings
      FROM rankings
    `;
    const results = await query(queryText);
    return results[0];
  }
}

export default RankingModel;
