// StudentEventRanking Model - Tracks per-event ranking completion
class StudentEventRankingModel {
  constructor(data) {
    this.id = data.id;
    this.student_id = data.student_id;
    this.event_id = data.event_id;
    this.has_completed_ranking = data.has_completed_ranking;
    this.completed_at = data.completed_at;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Create or update student event ranking record
   * @param {Object} data - { student_id, event_id, has_completed_ranking, completed_at }
   * @param {Function} query - Database query function
   * @returns {StudentEventRankingModel}
   */
  static async upsert(data, query) {
    const queryText = `
      INSERT INTO student_event_rankings (
        student_id, event_id, has_completed_ranking, completed_at
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (student_id, event_id)
      DO UPDATE SET
        has_completed_ranking = $3,
        completed_at = $4,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const results = await query(queryText, [
      data.student_id,
      data.event_id,
      data.has_completed_ranking ?? false,
      data.completed_at || null
    ]);
    return new StudentEventRankingModel(results[0]);
  }

  /**
   * Find ranking completion status for student in event
   * @param {string} studentId - UUID of the student
   * @param {string} eventId - UUID of the event
   * @param {Function} query - Database query function
   * @returns {StudentEventRankingModel | null}
   */
  static async findByStudentAndEvent(studentId, eventId, query) {
    const queryText = `
      SELECT * FROM student_event_rankings
      WHERE student_id = $1 AND event_id = $2
      LIMIT 1
    `;
    const results = await query(queryText, [studentId, eventId]);
    return results.length > 0 ? new StudentEventRankingModel(results[0]) : null;
  }

  /**
   * Check if student has completed ranking for event
   * @param {string} studentId - UUID of the student
   * @param {string} eventId - UUID of the event
   * @param {Function} query - Database query function
   * @returns {boolean}
   */
  static async hasCompleted(studentId, eventId, query) {
    const record = await StudentEventRankingModel.findByStudentAndEvent(
      studentId,
      eventId,
      query
    );
    return record ? record.has_completed_ranking : false;
  }

  /**
   * Mark ranking as completed for student in event
   * @param {string} studentId - UUID of the student
   * @param {string} eventId - UUID of the event
   * @param {Function} query - Database query function
   * @returns {StudentEventRankingModel}
   */
  static async markCompleted(studentId, eventId, query) {
    return await StudentEventRankingModel.upsert(
      {
        student_id: studentId,
        event_id: eventId,
        has_completed_ranking: true,
        completed_at: new Date()
      },
      query
    );
  }

  /**
   * Reset ranking completion status for student in event
   * @param {string} studentId - UUID of the student
   * @param {string} eventId - UUID of the event
   * @param {Function} query - Database query function
   * @returns {StudentEventRankingModel}
   */
  static async reset(studentId, eventId, query) {
    return await StudentEventRankingModel.upsert(
      {
        student_id: studentId,
        event_id: eventId,
        has_completed_ranking: false,
        completed_at: null
      },
      query
    );
  }

  /**
   * Get all students who completed ranking for an event
   * @param {string} eventId - UUID of the event
   * @param {Function} query - Database query function
   * @returns {Array<StudentEventRankingModel>}
   */
  static async findCompletedByEvent(eventId, query) {
    const queryText = `
      SELECT * FROM student_event_rankings
      WHERE event_id = $1 AND has_completed_ranking = true
      ORDER BY completed_at ASC
    `;
    const results = await query(queryText, [eventId]);
    return results.map(row => new StudentEventRankingModel(row));
  }

  /**
   * Get event ranking statistics
   * @param {string} eventId - UUID of the event
   * @param {Function} query - Database query function
   * @returns {Object} { total_students, completed_count, completion_rate }
   */
  static async getEventStats(eventId, query) {
    const queryText = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(*) FILTER (WHERE has_completed_ranking = true) as completed_count,
        ROUND(
          (COUNT(*) FILTER (WHERE has_completed_ranking = true)::decimal / 
          NULLIF(COUNT(*), 0)) * 100, 
          2
        ) as completion_rate
      FROM student_event_rankings
      WHERE event_id = $1
    `;
    const results = await query(queryText, [eventId]);
    return {
      total_students: parseInt(results[0]?.total_students || 0),
      completed_count: parseInt(results[0]?.completed_count || 0),
      completion_rate: parseFloat(results[0]?.completion_rate || 0)
    };
  }

  /**
   * Get all events student has completed rankings for
   * @param {string} studentId - UUID of the student
   * @param {Function} query - Database query function
   * @returns {Array<string>} Array of event IDs
   */
  static async getCompletedEventsByStudent(studentId, query) {
    const queryText = `
      SELECT event_id FROM student_event_rankings
      WHERE student_id = $1 AND has_completed_ranking = true
      ORDER BY completed_at ASC
    `;
    const results = await query(queryText, [studentId]);
    return results.map(row => row.event_id);
  }

  /**
   * Delete ranking completion record
   * @param {string} studentId - UUID of the student
   * @param {string} eventId - UUID of the event
   * @param {Function} query - Database query function
   * @returns {boolean}
   */
  static async delete(studentId, eventId, query) {
    const queryText = `
      DELETE FROM student_event_rankings 
      WHERE student_id = $1 AND event_id = $2
      RETURNING *
    `;
    const results = await query(queryText, [studentId, eventId]);
    return results.length > 0;
  }
}

export default StudentEventRankingModel;
