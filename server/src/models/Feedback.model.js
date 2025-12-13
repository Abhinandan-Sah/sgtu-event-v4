// Feedback Model - Student feedback for stalls (Category 1 - Max 200 per student)
class FeedbackModel {
  constructor(data) {
    this.id = data.id;
    this.student_id = data.student_id;
    this.stall_id = data.stall_id;
    this.rating = data.rating;
    this.comment = data.comment;
    this.submitted_at = data.submitted_at;
    this.event_id = data.event_id;
    // Join fields
    this.student_name = data.student_name;
    this.registration_no = data.registration_no;
    this.stall_name = data.stall_name;
    this.stall_number = data.stall_number;
    this.school_name = data.school_name;
  }

  static async create(data, sql) {
    const query = `
      INSERT INTO feedbacks (
        student_id, stall_id, rating, comment, event_id, submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;
    const results = await sql(query, [
      data.student_id,
      data.stall_id,
      data.rating,
      data.comment || null,
      data.event_id || null
    ]);
    return new FeedbackModel(results[0]);
  }

  // Check if student already gave feedback to this stall
  static async findByStudentAndStall(studentId, stallId, sql) {
    const query = `
      SELECT f.*,
        s.full_name as student_name,
        s.registration_no,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM feedbacks f
      LEFT JOIN students s ON f.student_id = s.id
      LEFT JOIN stalls st ON f.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE f.student_id = $1 AND f.stall_id = $2
      LIMIT 1
    `;
    const results = await sql(query, [studentId, stallId]);
    return results.length > 0 ? new FeedbackModel(results[0]) : null;
  }

  // Get all feedbacks by student (with persistence check)
  static async findByStudent(studentId, sql) {
    const query = `
      SELECT f.*,
        st.stall_name,
        st.stall_number,
        sc.school_name,
        e.event_name,
        e.event_code
      FROM feedbacks f
      LEFT JOIN stalls st ON f.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      LEFT JOIN events e ON f.event_id = e.id
      WHERE f.student_id = $1
      ORDER BY f.submitted_at DESC
    `;
    const results = await sql(query, [studentId]);
    return results.map(row => new FeedbackModel(row));
  }

  // Get all feedbacks for a stall
  static async findByStall(stallId, sql) {
    const query = `
      SELECT f.*,
        s.full_name as student_name,
        s.registration_no,
        sc.school_name as student_school
      FROM feedbacks f
      LEFT JOIN students s ON f.student_id = s.id
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE f.stall_id = $1
      ORDER BY f.submitted_at DESC
    `;
    const results = await sql(query, [stallId]);
    return results.map(row => new FeedbackModel(row));
  }

  // Count feedbacks by student
  static async countByStudent(studentId, sql) {
    const query = `SELECT COUNT(*) as count FROM feedbacks WHERE student_id = $1`;
    const results = await sql(query, [studentId]);
    return parseInt(results[0]?.count || 0);
  }

  // Count feedbacks by student for a specific event
  static async countByStudentAndEvent(studentId, eventId, sql) {
    const query = `SELECT COUNT(*) as count FROM feedbacks WHERE student_id = $1 AND event_id = $2`;
    const results = await sql(query, [studentId, eventId]);
    return parseInt(results[0]?.count || 0);
  }

  // Get all feedbacks by student for a specific event
  static async getByStudentAndEvent(studentId, eventId, sql) {
    const query = `
      SELECT f.*,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM feedbacks f
      LEFT JOIN stalls st ON f.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE f.student_id = $1 AND f.event_id = $2
      ORDER BY f.submitted_at DESC
    `;
    const results = await sql(query, [studentId, eventId]);
    return results.map(row => new FeedbackModel(row));
  }

  // Get stall average rating and total feedbacks
  static async getStallStats(stallId, sql) {
    const query = `
      SELECT 
        COUNT(*) as total_feedbacks,
        AVG(rating) as average_rating,
        COUNT(DISTINCT student_id) as unique_students
      FROM feedbacks
      WHERE stall_id = $1
    `;
    const results = await sql(query, [stallId]);
    return {
      total_feedbacks: parseInt(results[0]?.total_feedbacks || 0),
      average_rating: parseFloat(results[0]?.average_rating || 0).toFixed(2),
      unique_students: parseInt(results[0]?.unique_students || 0)
    };
  }

  // Global feedback statistics
  static async getGlobalStats(sql) {
    const query = `
      SELECT 
        COUNT(*) as total_feedbacks,
        COUNT(DISTINCT student_id) as unique_students,
        COUNT(DISTINCT stall_id) as stalls_with_feedback,
        AVG(rating) as average_rating
      FROM feedbacks
    `;
    const results = await sql(query);
    return {
      ...results[0],
      average_rating: parseFloat(results[0]?.average_rating || 0).toFixed(2)
    };
  }

  // Get all feedbacks for a specific event
  static async findByEvent(eventId, sql) {
    const query = `
      SELECT f.*,
        s.full_name as student_name,
        s.registration_no,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM feedbacks f
      LEFT JOIN students s ON f.student_id = s.id
      LEFT JOIN stalls st ON f.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE f.event_id = $1
      ORDER BY f.submitted_at DESC
    `;
    const results = await sql(query, [eventId]);
    return results.map(row => new FeedbackModel(row));
  }
}

export default FeedbackModel;
