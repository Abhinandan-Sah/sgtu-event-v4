// Stall Model - Event stalls with static QR codes
import QRCodeService from '../services/qrCode.js';

class StallModel {
  constructor(data) {
    this.id = data.id;
    this.stall_number = data.stall_number;
    this.stall_name = data.stall_name;
    this.school_id = data.school_id;
    this.description = data.description;
    this.role = data.role;
    this.qr_code_token = data.qr_code_token;
    this.total_feedback_count = data.total_feedback_count;
    this.rank_1_votes = data.rank_1_votes;
    this.rank_2_votes = data.rank_2_votes;
    this.rank_3_votes = data.rank_3_votes;
    this.weighted_score = data.weighted_score;
    this.location = data.location;
    this.is_active = data.is_active;
    this.event_id = data.event_id;
    this.image_url = data.image_url;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    // Join fields
    this.school_name = data.school_name;
  }

  static async findAll(sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.is_active = true
      ORDER BY s.stall_number ASC
    `;
    const results = await sql(query);
    return results.map(row => new StallModel(row));
  }

  static async findByEvent(eventId, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.event_id = $1 AND s.is_active = true
      ORDER BY s.stall_number ASC
    `;
    const results = await sql(query, [eventId]);
    return results.map(row => new StallModel(row));
  }

  // Count total stalls for an event
  static async countByEvent(eventId, sql) {
    const query = `SELECT COUNT(*) as count FROM stalls WHERE event_id = $1 AND is_active = true`;
    const results = await sql(query, [eventId]);
    return parseInt(results[0]?.count || 0);
  }

  static async findById(id, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.id = $1 LIMIT 1
    `;
    const results = await sql(query, [id]);
    return results.length > 0 ? new StallModel(results[0]) : null;
  }

  static async findByQRToken(token, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.qr_code_token = $1 LIMIT 1
    `;
    const results = await sql(query, [token]);
    return results.length > 0 ? new StallModel(results[0]) : null;
  }

  static async findBySchool(schoolId, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.school_id = $1 AND s.is_active = true
      ORDER BY s.stall_number ASC
    `;
    const results = await sql(query, [schoolId]);
    return results.map(row => new StallModel(row));
  }

  static async findBySchoolName(schoolName, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE sc.school_name = $1 AND s.is_active = true
      ORDER BY s.stall_number ASC
    `;
    const results = await sql(query, [schoolName]);
    return results.map(row => new StallModel(row));
  }

  static async findByStallNumber(stallNumber, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.stall_number = $1 LIMIT 1
    `;
    const results = await sql(query, [stallNumber]);
    return results.length > 0 ? new StallModel(results[0]) : null;
  }

  static async update(id, data, sql) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.stall_name !== undefined) {
      fields.push(`stall_name = $${paramCount++}`);
      values.push(data.stall_name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.location !== undefined) {
      fields.push(`location = $${paramCount++}`);
      values.push(data.location);
    }
    if (data.image_url !== undefined) {
      fields.push(`image_url = $${paramCount++}`);
      values.push(data.image_url);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(data.is_active);
    }

    if (fields.length === 0) {
      return await StallModel.findById(id, sql);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE stalls
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    const results = await sql(query, values);
    return results.length > 0 ? new StallModel(results[0]) : null;
  }

  static async delete(id, sql) {
    const query = `
      UPDATE stalls
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const results = await sql(query, [id]);
    return results.length > 0;
  }

  static async create(data, sql) {
    // Generate QR code token first (required field)
    const qrToken = QRCodeService.generateStallQRToken({ stall_number: data.stall_number });
    
    const query = `
      INSERT INTO stalls (
        stall_number, stall_name, school_id, description,
        location, role, is_active, event_id, image_url, qr_code_token,
        total_feedback_count, rank_1_votes, rank_2_votes, rank_3_votes, weighted_score,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'STALL', true, $6, $7, $8, 0, 0, 0, 0, 0, NOW(), NOW())
      RETURNING *
    `;
    const results = await sql(query, [
      data.stall_number,
      data.stall_name,
      data.school_id,
      data.description || null,
      data.location || null,
      data.event_id || null,
      data.image_url || null,
      qrToken
    ]);
    
    return new StallModel(results[0]);
  }

  static async bulkCreate(stalls, sql) {
    if (!stalls || stalls.length === 0) return [];
    
    const values = [];
    const placeholders = [];
    
    for (let i = 0; i < stalls.length; i++) {
      const offset = i * 8;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
      );
      values.push(
        stalls[i].stall_number,
        stalls[i].stall_name,
        stalls[i].school_id,
        stalls[i].description || null,
        stalls[i].qr_code_token,
        stalls[i].location || null,
        stalls[i].event_id || null,
        stalls[i].image_url || null
      );
    }

    const query = `
      INSERT INTO stalls (
        stall_number, stall_name, school_id, description, qr_code_token, location, event_id, image_url
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (stall_number) DO NOTHING
      RETURNING *
    `;
    
    const results = await sql(query, values);
    return results.map(row => new StallModel(row));
  }

  // Increment feedback count when student submits feedback
  static async incrementFeedbackCount(id, sql) {
    const query = `
      UPDATE stalls
      SET total_feedback_count = total_feedback_count + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING total_feedback_count
    `;
    const results = await sql(query, [id]);
    return results[0]?.total_feedback_count || 0;
  }

  // Increment rank votes and recalculate weighted score
  static async incrementRankVote(id, rank, sql) {
    const query = `
      UPDATE stalls
      SET rank_${rank}_votes = rank_${rank}_votes + 1,
          weighted_score = (rank_1_votes + ${rank === 1 ? 1 : 0}) * 3 +
                          (rank_2_votes + ${rank === 2 ? 1 : 0}) * 2 +
                          (rank_3_votes + ${rank === 3 ? 1 : 0}) * 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const results = await sql(query, [id]);
    return results.length > 0 ? new StallModel(results[0]) : null;
  }

  // Leaderboard: Top stalls by feedback count (Category 1)
  static async getTopByFeedback(limit = 200, sql) {
    const query = `
      SELECT s.*, sc.school_name
      FROM stalls s
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE s.is_active = true AND s.total_feedback_count > 0
      ORDER BY s.total_feedback_count DESC, s.created_at ASC
      LIMIT $1
    `;
    const results = await sql(query, [limit]);
    return results.map(row => new StallModel(row));
  }

  // Leaderboard: Top 3 stalls per school by weighted ranking (Category 2)
  static async getSchoolRankings(sql) {
    const query = `
      SELECT 
        sc.id as school_id,
        sc.school_name,
        json_agg(
          json_build_object(
            'id', s.id,
            'stall_number', s.stall_number,
            'stall_name', s.stall_name,
            'rank_1_votes', s.rank_1_votes,
            'rank_2_votes', s.rank_2_votes,
            'rank_3_votes', s.rank_3_votes,
            'weighted_score', s.weighted_score
          ) ORDER BY s.weighted_score DESC
        ) FILTER (WHERE s.id IS NOT NULL) as top_stalls
      FROM schools sc
      LEFT JOIN LATERAL (
        SELECT * FROM stalls
        WHERE school_id = sc.id AND is_active = true AND weighted_score > 0
        ORDER BY weighted_score DESC
        LIMIT 3
      ) s ON true
      GROUP BY sc.id, sc.school_name
      HAVING COUNT(s.id) > 0
      ORDER BY sc.school_name ASC
    `;
    const results = await sql(query);
    return results;
  }

  static async getStats(sql) {
    const query = `
      SELECT 
        COUNT(*) as total_stalls,
        COUNT(*) FILTER (WHERE is_active = true) as active_stalls,
        SUM(total_feedback_count) as total_feedbacks,
        AVG(total_feedback_count) as avg_feedback_per_stall
      FROM stalls
    `;
    const results = await sql(query);
    return results[0];
  }
}

export default StallModel;
