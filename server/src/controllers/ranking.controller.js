import Ranking from '../models/Ranking.model.js';
import Stall from '../models/Stall.model.js';
import { successResponse, errorResponse } from '../helpers/response.js';
import { query } from '../config/db.js';

/**
 * Ranking Controller
 * Handles ranking operations and leaderboard
 */

/**
 * Get all rankings for specific event (EVENT_MANAGER/ADMIN)
 * @route GET /api/ranking/:eventId
 */
const getAllRankings = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const queryText = `
      SELECT 
        r.id,
        r.rank,
        r.submitted_at,
        r.event_id,
        s.full_name as student_name,
        s.registration_no,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM rankings r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN stalls st ON r.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE r.event_id = $1
      ORDER BY r.submitted_at DESC
    `;

    const rankings = await query(queryText, [eventId]);
    
    return successResponse(res, rankings);
  } catch (error) {
    next(error);
  }
};

/**
 * Get ranking by stall ID for specific event
 * @route GET /api/ranking/:eventId/stall/:stallId
 */
const getRankingByStall = async (req, res, next) => {
  try {
    const { eventId, stallId } = req.params;
    
    const queryText = `
      SELECT 
        r.*,
        s.full_name as student_name,
        s.registration_no,
        sc.school_name as student_school
      FROM rankings r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN schools sc ON s.school_id = sc.id
      WHERE r.stall_id = $1 AND r.event_id = $2
      ORDER BY r.rank ASC, r.submitted_at ASC
    `;

    const rankings = await query(queryText, [stallId, eventId]);

    if (!rankings || rankings.length === 0) {
      return errorResponse(res, 'No rankings found for this stall in this event', 404);
    }

    return successResponse(res, {
      stall_id: stallId,
      event_id: eventId,
      total_rankings: rankings.length,
      rank_1_count: rankings.filter(r => r.rank === 1).length,
      rank_2_count: rankings.filter(r => r.rank === 2).length,
      rank_3_count: rankings.filter(r => r.rank === 3).length,
      rankings: rankings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get top N stalls using comprehensive weighted scoring
 * @route GET /api/ranking/top/:limit
 * Formula: 
 *   - Ranking Votes: Rank1(×5) + Rank2(×3) + Rank3(×1) [Max weight: 40%]
 *   - Avg Rating: (1-5 stars) × 20 [Max weight: 35%]
 *   - Total Feedbacks: Count × 0.1 [Max weight: 15%]
 *   - Unique Visitors: Count × 0.05 [Max weight: 10%]
 * Total Score = (ranking_score×0.4) + (rating_score×0.35) + (feedback_score×0.15) + (visitor_score×0.1)
 */
const getTopRankings = async (req, res, next) => {
  try {
    const { eventId, limit } = req.params;
    const limitNum = parseInt(limit) || 10;

    // Comprehensive stall scoring query with event filtering
    const queryText = `
      WITH stall_metrics AS (
        SELECT 
          st.id as stall_id,
          st.stall_name,
          st.stall_number,
          sc.school_name,
          st.location,
          
          -- Ranking votes (Category 2)
          COALESCE(st.rank_1_votes, 0) as rank_1_votes,
          COALESCE(st.rank_2_votes, 0) as rank_2_votes,
          COALESCE(st.rank_3_votes, 0) as rank_3_votes,
          
          -- Feedback metrics (Category 1)
          COUNT(DISTINCT f.id) as total_feedbacks,
          COALESCE(AVG(f.rating), 0) as avg_rating,
          
          -- Visitor metrics (unique students who gave feedback)
          COUNT(DISTINCT f.student_id) as unique_visitors,
          
          -- Comment engagement (comments show deeper interest)
          COUNT(DISTINCT f.id) FILTER (WHERE f.comment IS NOT NULL AND LENGTH(f.comment) > 0) as feedback_with_comments
          
        FROM stalls st
        LEFT JOIN schools sc ON st.school_id = sc.id
        LEFT JOIN feedbacks f ON st.id = f.stall_id AND f.event_id = $2
        WHERE st.is_active = true AND st.event_id = $2
        GROUP BY st.id, st.stall_name, st.stall_number, sc.school_name, st.location,
                 st.rank_1_votes, st.rank_2_votes, st.rank_3_votes
      ),
      normalized_scores AS (
        SELECT 
          *,
          
          -- 1️⃣ RANKING SCORE (40% weight) - Weighted voting system
          --    Rank 1 = 5 points, Rank 2 = 3 points, Rank 3 = 1 point
          ((rank_1_votes * 5) + (rank_2_votes * 3) + (rank_3_votes * 1)) as ranking_points,
          
          -- 2️⃣ RATING SCORE (35% weight) - Average star rating × 20
          (avg_rating * 20) as rating_points,
          
          -- 3️⃣ FEEDBACK SCORE (15% weight) - Total feedback count × 0.1
          (total_feedbacks * 0.1) as feedback_points,
          
          -- 4️⃣ VISITOR SCORE (10% weight) - Unique visitors × 0.05
          (unique_visitors * 0.05) as visitor_points
          
        FROM stall_metrics
      ),
      max_values AS (
        SELECT 
          GREATEST(MAX(ranking_points), 1) as max_ranking,
          GREATEST(MAX(rating_points), 1) as max_rating,
          GREATEST(MAX(feedback_points), 1) as max_feedback,
          GREATEST(MAX(visitor_points), 1) as max_visitor
        FROM normalized_scores
      )
      SELECT 
        ns.*,
        
        -- Normalize each metric to 0-100 scale, then apply weights
        ((ns.ranking_points / mv.max_ranking * 100) * 0.40) as weighted_ranking_score,
        ((ns.rating_points / mv.max_rating * 100) * 0.35) as weighted_rating_score,
        ((ns.feedback_points / mv.max_feedback * 100) * 0.15) as weighted_feedback_score,
        ((ns.visitor_points / mv.max_visitor * 100) * 0.10) as weighted_visitor_score,
        
        -- TOTAL SCORE (0-100)
        (
          ((ns.ranking_points / mv.max_ranking * 100) * 0.40) +
          ((ns.rating_points / mv.max_rating * 100) * 0.35) +
          ((ns.feedback_points / mv.max_feedback * 100) * 0.15) +
          ((ns.visitor_points / mv.max_visitor * 100) * 0.10)
        ) as final_score
        
      FROM normalized_scores ns, max_values mv
      WHERE (ns.total_feedbacks > 0 OR ns.rank_1_votes > 0 OR ns.rank_2_votes > 0 OR ns.rank_3_votes > 0)
      ORDER BY final_score DESC, avg_rating DESC, total_feedbacks DESC
      LIMIT $1
    `;

    const results = await query(queryText, [limitNum, eventId]);

    // Format response with detailed breakdown
    const leaderboard = results.map((stall, index) => ({
      position: index + 1,
      stall_id: stall.stall_id,
      stall_name: stall.stall_name,
      stall_number: stall.stall_number,
      school_name: stall.school_name,
      location: stall.location,
      
      // Final Score
      final_score: parseFloat(stall.final_score).toFixed(2),
      
      // Score Breakdown
      score_breakdown: {
        ranking_score: parseFloat(stall.weighted_ranking_score).toFixed(2),
        rating_score: parseFloat(stall.weighted_rating_score).toFixed(2),
        feedback_score: parseFloat(stall.weighted_feedback_score).toFixed(2),
        visitor_score: parseFloat(stall.weighted_visitor_score).toFixed(2)
      },
      
      // Raw Metrics
      metrics: {
        ranking_votes: {
          rank_1: parseInt(stall.rank_1_votes),
          rank_2: parseInt(stall.rank_2_votes),
          rank_3: parseInt(stall.rank_3_votes),
          total_points: parseFloat(stall.ranking_points).toFixed(0)
        },
        feedback: {
          avg_rating: parseFloat(stall.avg_rating).toFixed(2),
          total_feedbacks: parseInt(stall.total_feedbacks),
          feedbacks_with_comments: parseInt(stall.feedback_with_comments),
          comment_rate: stall.total_feedbacks > 0 
            ? (parseInt(stall.feedback_with_comments) / parseInt(stall.total_feedbacks) * 100).toFixed(1) + '%'
            : '0%'
        },
        visitors: {
          unique_visitors: parseInt(stall.unique_visitors)
        }
      }
    }));

    return successResponse(res, {
      leaderboard,
      total_stalls: leaderboard.length,
      scoring_formula: {
        description: 'Comprehensive weighted scoring system',
        weights: {
          ranking_votes: '40%',
          average_rating: '35%',
          feedback_count: '15%',
          unique_visitors: '10%'
        },
        ranking_points: 'Rank1(×5) + Rank2(×3) + Rank3(×1)',
        max_score: 100
      }
    }, `Top ${limitNum} stalls calculated successfully`);
  } catch (error) {
    next(error);
  }
};

/**
 * Update ranking (admin only)
 * @route PUT /api/ranking/:id
 */
const updateRanking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rank, score } = req.body;

    const updateData = {};
    if (rank !== undefined) updateData.rank = rank;
    if (score !== undefined) updateData.score = score;

    const updatedRanking = await Ranking.update(id, updateData, query);
    if (!updatedRanking) {
      return errorResponse(res, 'Ranking not found', 404);
    }

    return successResponse(res, updatedRanking, 'Ranking updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate and update comprehensive stall rankings (admin only)
 * @route POST /api/ranking/calculate
 * Updates stalls table with ranking votes, feedback stats, and weighted scores
 */
const calculateRankings = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Calculate comprehensive metrics for event stalls
    const queryText = `
      WITH stall_calculations AS (
        SELECT 
          st.id,
          st.stall_name,
          st.stall_number,
          
          -- Ranking votes
          COUNT(DISTINCT r.id) FILTER (WHERE r.rank = 1) as rank_1_votes,
          COUNT(DISTINCT r.id) FILTER (WHERE r.rank = 2) as rank_2_votes,
          COUNT(DISTINCT r.id) FILTER (WHERE r.rank = 3) as rank_3_votes,
          
          -- Feedback count
          COUNT(DISTINCT f.id) as total_feedback_count,
          
          -- Average rating
          COALESCE(AVG(f.rating), 0) as avg_rating,
          
          -- Weighted score (ranking votes only for backward compatibility)
          (COUNT(DISTINCT r.id) FILTER (WHERE r.rank = 1) * 5 +
           COUNT(DISTINCT r.id) FILTER (WHERE r.rank = 2) * 3 +
           COUNT(DISTINCT r.id) FILTER (WHERE r.rank = 3) * 1) as weighted_score
          
        FROM stalls st
        LEFT JOIN rankings r ON st.id = r.stall_id AND r.event_id = $1
        LEFT JOIN feedbacks f ON st.id = f.stall_id AND f.event_id = $1
        WHERE st.is_active = true AND st.event_id = $1
        GROUP BY st.id, st.stall_name, st.stall_number
      )
      SELECT * FROM stall_calculations
      ORDER BY weighted_score DESC, avg_rating DESC
    `;

    const stallScores = await query(queryText, [eventId]);

    // Batch update stalls table
    const updatePromises = stallScores.map(stall => 
      query(
        `UPDATE stalls 
         SET rank_1_votes = $1, 
             rank_2_votes = $2, 
             rank_3_votes = $3,
             total_feedback_count = $4,
             weighted_score = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          stall.rank_1_votes,
          stall.rank_2_votes,
          stall.rank_3_votes,
          stall.total_feedback_count,
          stall.weighted_score,
          stall.id
        ]
      )
    );

    await Promise.all(updatePromises);

    return successResponse(res, {
      total_stalls_updated: stallScores.length,
      top_10_preview: stallScores.slice(0, 10).map((s, i) => ({
        position: i + 1,
        stall_name: s.stall_name,
        stall_number: s.stall_number,
        rank_1_votes: parseInt(s.rank_1_votes),
        rank_2_votes: parseInt(s.rank_2_votes),
        rank_3_votes: parseInt(s.rank_3_votes),
        total_feedbacks: parseInt(s.total_feedback_count),
        avg_rating: parseFloat(s.avg_rating).toFixed(2),
        weighted_score: parseFloat(s.weighted_score).toFixed(2)
      })),
      statistics: {
        stalls_with_rankings: stallScores.filter(s => s.weighted_score > 0).length,
        stalls_with_feedback: stallScores.filter(s => s.total_feedback_count > 0).length,
        avg_feedback_per_stall: (stallScores.reduce((sum, s) => sum + parseInt(s.total_feedback_count), 0) / stallScores.length).toFixed(2)
      }
    }, 'Stall rankings calculated and cached successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Create ranking (student submits their top 3)
 * @route POST /api/ranking
 */
const createRanking = async (req, res, next) => {
  try {
    const { rankings } = req.body; // Array of { stall_id, rank }

    if (!Array.isArray(rankings) || rankings.length !== 3) {
      return errorResponse(res, 'Must provide exactly 3 stall rankings', 400);
    }

    // Validate ranks are 1, 2, 3
    const ranks = rankings.map(r => r.rank).sort();
    if (ranks.join(',') !== '1,2,3') {
      return errorResponse(res, 'Rankings must be exactly ranks 1, 2, and 3', 400);
    }

    // Get current event from active check-in
    const activeCheckInResult = await query(
      `SELECT event_id FROM check_in_outs 
       WHERE student_id = $1 AND scan_type = 'CHECKIN' 
       ORDER BY scanned_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (!activeCheckInResult || activeCheckInResult.length === 0) {
      return errorResponse(res, 'You must be checked in to submit rankings', 403);
    }

    const currentEventId = activeCheckInResult[0].event_id;

    // Check if student already ranked THIS EVENT
    const hasRanked = await Ranking.hasCompletedEventRanking(req.user.id, currentEventId, query);
    if (hasRanked) {
      return errorResponse(res, 'You have already submitted your rankings for this event', 409);
    }

    // Validate stalls belong to current event
    const stallIds = rankings.map(r => r.stall_id);
    const stallCheckQuery = await query(
      `SELECT id, stall_name, event_id FROM stalls WHERE id = ANY($1::uuid[])`,
      [stallIds]
    );

    if (stallCheckQuery.length !== 3) {
      return errorResponse(res, 'One or more stalls not found', 404);
    }

    const wrongEventStalls = stallCheckQuery.filter(s => s.event_id !== currentEventId);
    if (wrongEventStalls.length > 0) {
      return errorResponse(
        res,
        `All stalls must be from your current event. Invalid: ${wrongEventStalls.map(s => s.stall_name).join(', ')}`,
        403
      );
    }

    // Create rankings with event_id
    const rankingData = rankings.map(r => ({
      student_id: req.user.id,
      stall_id: r.stall_id,
      rank: r.rank,
      event_id: currentEventId
    }));

    const created = await Ranking.bulkCreate(rankingData, query);

    return successResponse(res, created, 'Rankings submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete ranking (admin only)
 * @route DELETE /api/ranking/:id
 */
const deleteRanking = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const deleted = await Ranking.delete(id, query);
    if (!deleted) {
      return errorResponse(res, 'Ranking not found', 404);
    }

    return successResponse(res, null, 'Ranking deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get top N students using comprehensive engagement scoring
 * @route GET /api/ranking/students/top/:limit
 * Formula (3-Day Event, 200 Stalls):
 *   - Event Duration: Progressive scoring 0-24 hours (6h/day optimal) [Weight: 30%]
 *   - Feedback Quantity: Progressive scoring 0-180 feedbacks (90% coverage) [Weight: 25%]
 *   - Feedback Quality: Comment depth & helpfulness [Weight: 20%]
 *   - Engagement: Rankings + visits + multi-day attendance [Weight: 15%]
 *   - Consistency: Balanced participation across days [Weight: 10%]
 * Total Score = weighted sum of progressive metrics
 */
const getTopStudents = async (req, res, next) => {
  try {
    const { eventId, limit } = req.params;
    const limitNum = parseInt(limit) || 10;

    const queryText = `
      WITH student_metrics AS (
        SELECT 
          s.id as student_id,
          s.registration_no,
          s.full_name,
          sc.school_name,
          
          -- Duration metric (3-day event: up to 24 hours realistic)
          COALESCE(SUM(co.duration_minutes), 0) as total_duration_minutes,
          
          -- Feedback metrics (200 stalls, 90% coverage = 180 max)
          COUNT(DISTINCT f.id) as total_feedbacks,
          COUNT(DISTINCT f.id) FILTER (WHERE f.comment IS NOT NULL AND LENGTH(f.comment) > 20) as quality_feedbacks,
          COALESCE(AVG(LENGTH(f.comment)), 0) as avg_comment_length,
          
          -- Ranking participation for this event
          COALESCE((SELECT has_completed_ranking FROM student_event_rankings WHERE student_id = s.id AND event_id = $2), false) as completed_ranking,
          
          -- Visit frequency (consistency across days)
          COUNT(DISTINCT co.id) as total_visits,
          
          -- Multi-day consistency (visits spread across multiple days)
          COUNT(DISTINCT DATE(co.scanned_at)) as unique_days_attended,
          
          -- Account age
          EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 3600 as account_age_hours
          
        FROM students s
        LEFT JOIN schools sc ON s.school_id = sc.id
        LEFT JOIN feedbacks f ON s.id = f.student_id AND f.event_id = $2
        LEFT JOIN check_in_outs co ON s.id = co.student_id AND co.event_id = $2
        GROUP BY s.id, s.registration_no, s.full_name, sc.school_name, s.created_at
      ),
      scored_students AS (
        SELECT 
          *,
          
          -- 1️⃣ DURATION SCORE (30% weight) - Progressive scoring for 3-day event
          --    Optimal: 18 hours (6h/day), Max: 24 hours (8h/day)
          CASE 
            WHEN total_duration_minutes >= 1440 THEN 100  -- 24+ hours = perfect
            WHEN total_duration_minutes >= 1080 THEN 90 + ((total_duration_minutes - 1080) / 360.0 * 10)  -- 18-24h (90-100)
            WHEN total_duration_minutes >= 720 THEN 75 + ((total_duration_minutes - 720) / 360.0 * 15)   -- 12-18h (75-90)
            WHEN total_duration_minutes >= 360 THEN 50 + ((total_duration_minutes - 360) / 360.0 * 25)   -- 6-12h (50-75)
            ELSE (total_duration_minutes / 360.0 * 50)  -- 0-6h (0-50)
          END as duration_score,
          
          -- 2️⃣ FEEDBACK QUANTITY SCORE (25% weight) - Progressive scoring
          --    Optimal: 120 feedbacks (40/day), Max: 180 (60/day, 90% of stalls)
          CASE 
            WHEN total_feedbacks >= 180 THEN 100  -- 90%+ coverage = perfect
            WHEN total_feedbacks >= 120 THEN 85 + ((total_feedbacks - 120) / 60.0 * 15)  -- 120-180 (85-100)
            WHEN total_feedbacks >= 80 THEN 70 + ((total_feedbacks - 80) / 40.0 * 15)    -- 80-120 (70-85)
            WHEN total_feedbacks >= 40 THEN 50 + ((total_feedbacks - 40) / 40.0 * 20)    -- 40-80 (50-70)
            ELSE (total_feedbacks / 40.0 * 50)  -- 0-40 (0-50)
          END as feedback_quantity_score,
          
          -- 3️⃣ FEEDBACK QUALITY SCORE (20% weight) - Comment quality matters
          --    Quality = (quality_feedbacks / total_feedbacks) × 60% + comment_depth × 40%
          CASE 
            WHEN total_feedbacks > 0 THEN
              (
                -- Quality rate (60% of quality score) - comments >20 chars
                ((quality_feedbacks::DECIMAL / GREATEST(total_feedbacks, 1)) * 60) +
                -- Comment depth (40% of quality score) - avg length capped at 150
                (LEAST(avg_comment_length, 150) / 150.0 * 40)
              )
            ELSE 0
          END as feedback_quality_score,
          
          -- 4️⃣ ENGAGEMENT SCORE (15% weight) - Multi-faceted participation
          --    Ranking completion (40 pts) + Visit frequency (30 pts) + Multi-day (30 pts)
          (
            (completed_ranking * 40) +                                    -- 40 pts for rankings
            (LEAST(total_visits, 15) / 15.0 * 30) +                      -- 30 pts for 15+ visits
            (LEAST(unique_days_attended, 3) / 3.0 * 30)                  -- 30 pts for all 3 days
          ) as engagement_score,
          
          -- 5️⃣ CONSISTENCY SCORE (10% weight) - Balanced participation
          --    Rewards regular visits across days, not one marathon session
          CASE 
            WHEN total_visits >= 6 AND unique_days_attended >= 2 THEN
              -- Good: multiple days + reasonable session lengths
              LEAST(
                ((total_duration_minutes::DECIMAL / GREATEST(total_visits, 1)) / 180.0 * 50) +  -- Avg session length
                ((unique_days_attended::DECIMAL / 3.0) * 50),                                    -- Multi-day bonus
                100
              )
            WHEN total_visits > 0 THEN
              -- Okay: at least participated, but could be better
              LEAST((total_duration_minutes::DECIMAL / GREATEST(total_visits, 1)) / 180.0 * 100, 100)
            ELSE 0
          END as consistency_score
          
        FROM student_metrics
        WHERE total_feedbacks > 0 OR total_duration_minutes > 0 OR completed_ranking = 1
      )
      SELECT 
        *,
        
        -- Weighted final scores
        (duration_score * 0.30) as weighted_duration,
        (feedback_quantity_score * 0.25) as weighted_feedback_qty,
        (feedback_quality_score * 0.20) as weighted_feedback_qual,
        (engagement_score * 0.15) as weighted_engagement,
        (consistency_score * 0.10) as weighted_consistency,
        
        -- FINAL SCORE (0-100)
        (
          (duration_score * 0.30) +
          (feedback_quantity_score * 0.25) +
          (feedback_quality_score * 0.20) +
          (engagement_score * 0.15) +
          (consistency_score * 0.10)
        ) as final_score
        
      FROM scored_students
      ORDER BY final_score DESC, total_feedbacks DESC, total_duration_minutes DESC
      LIMIT $1
    `;

    const results = await query(queryText, [limitNum, eventId]);

    const leaderboard = results.map((student, index) => ({
      position: index + 1,
      student_id: student.student_id,
      registration_no: student.registration_no,
      full_name: student.full_name,
      school_name: student.school_name,
      
      // Final Score
      final_score: parseFloat(student.final_score).toFixed(2),
      
      // Score Breakdown (detailed component scores)
      score_breakdown: {
        duration_score: parseFloat(student.weighted_duration).toFixed(2),
        feedback_quantity_score: parseFloat(student.weighted_feedback_qty).toFixed(2),
        feedback_quality_score: parseFloat(student.weighted_feedback_qual).toFixed(2),
        engagement_score: parseFloat(student.weighted_engagement).toFixed(2),
        consistency_score: parseFloat(student.weighted_consistency).toFixed(2)
      },
      
      // Raw Metrics
      metrics: {
        event_participation: {
          total_duration_minutes: parseInt(student.total_duration_minutes),
          duration_formatted: `${Math.floor(student.total_duration_minutes / 60)}h ${student.total_duration_minutes % 60}m`,
          total_visits: parseInt(student.total_visits),
          unique_days_attended: parseInt(student.unique_days_attended || 0),
          avg_duration_per_visit: student.total_visits > 0 
            ? (student.total_duration_minutes / student.total_visits).toFixed(1) + ' min'
            : '0 min'
        },
        feedback_stats: {
          total_feedbacks: parseInt(student.total_feedbacks),
          quality_feedbacks: parseInt(student.quality_feedbacks),
          avg_comment_length: parseFloat(student.avg_comment_length).toFixed(0),
          quality_rate: student.total_feedbacks > 0
            ? (student.quality_feedbacks / student.total_feedbacks * 100).toFixed(1) + '%'
            : '0%',
          coverage_rate: ((student.total_feedbacks / 200) * 100).toFixed(1) + '%'  // % of 200 stalls
        },
        engagement: {
          completed_ranking: student.completed_ranking === 1,
          account_age_hours: parseFloat(student.account_age_hours).toFixed(1)
        }
      }
    }));

    return successResponse(res, {
      leaderboard,
      total_students: leaderboard.length,
      scoring_formula: {
        description: 'Progressive engagement scoring for 3-day event with 200 stalls',
        event_context: {
          total_days: 3,
          total_stalls: 200,
          max_duration: '24 hours (8h/day)',
          optimal_duration: '18 hours (6h/day)',
          max_feedbacks: '180 (90% coverage)',
          optimal_feedbacks: '120 (40/day)'
        },
        weights: {
          event_duration: '30%',
          feedback_quantity: '25%',
          feedback_quality: '20%',
          engagement_activities: '15%',
          consistency: '10%'
        },
        progressive_scoring: {
          duration_tiers: [
            '0-6h: 0-50 pts (minimum participation)',
            '6-12h: 50-75 pts (good engagement)',
            '12-18h: 75-90 pts (excellent commitment)',
            '18-24h: 90-100 pts (exceptional dedication)'
          ],
          feedback_tiers: [
            '0-40: 0-50 pts (casual visitor)',
            '40-80: 50-70 pts (engaged participant)',
            '80-120: 70-85 pts (active contributor)',
            '120-180: 85-100 pts (comprehensive coverage)'
          ]
        },
        max_score: 100
      }
    }, `Top ${limitNum} students calculated successfully`);
  } catch (error) {
    next(error);
  }
};

/**
 * Get top N schools using student ranking participation
 * @route GET /api/ranking/:eventId/schools/top/:limit
 * Schools earn points when their stalls are ranked by their own students
 */
const getTopSchools = async (req, res, next) => {
  try {
    const { eventId, limit } = req.params;
    const limitNum = parseInt(limit) || 10;

    const queryText = `
      SELECT 
        sc.id as school_id,
        sc.school_name,
        COUNT(DISTINCT ser.student_id) as total_students_ranked,
        SUM(CASE WHEN st.school_id = sc.id THEN 
          CASE r.rank
            WHEN 1 THEN 5
            WHEN 2 THEN 3
            WHEN 3 THEN 1
            ELSE 0
          END
        ELSE 0 END) as school_score,
        SUM(CASE WHEN st.school_id = sc.id AND r.rank = 1 THEN 1 ELSE 0 END) as rank_1_count,
        SUM(CASE WHEN st.school_id = sc.id AND r.rank = 2 THEN 1 ELSE 0 END) as rank_2_count,
        SUM(CASE WHEN st.school_id = sc.id AND r.rank = 3 THEN 1 ELSE 0 END) as rank_3_count,
        COUNT(DISTINCT CASE WHEN st.school_id = sc.id THEN st.id END) as ranked_stalls_count
      FROM schools sc
      LEFT JOIN students s ON s.school_id = sc.id
      LEFT JOIN student_event_rankings ser ON ser.student_id = s.id AND ser.event_id = $1 AND ser.has_completed_ranking = true
      LEFT JOIN rankings r ON r.student_id = s.id AND r.event_id = $1
      LEFT JOIN stalls st ON r.stall_id = st.id
      WHERE ser.has_completed_ranking = true
      GROUP BY sc.id, sc.school_name
      HAVING SUM(CASE WHEN st.school_id = sc.id THEN 
        CASE r.rank
          WHEN 1 THEN 5
          WHEN 2 THEN 3
          WHEN 3 THEN 1
          ELSE 0
        END
      ELSE 0 END) > 0
      ORDER BY school_score DESC, total_students_ranked DESC
      LIMIT $2
    `;

    const topSchools = await query(queryText, [eventId, limitNum]);

    // Get overall stats
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT ser.student_id) as total_students_participated,
        COUNT(DISTINCT sc.id) as total_schools_participated,
        COUNT(DISTINCT st.id) as total_stalls_ranked
      FROM student_event_rankings ser
      JOIN students s ON ser.student_id = s.id
      JOIN rankings r ON r.student_id = s.id AND r.event_id = $1
      JOIN stalls st ON r.stall_id = st.id
      JOIN schools sc ON s.school_id = sc.id
      WHERE ser.event_id = $1 AND ser.has_completed_ranking = true
    `;

    const stats = await query(statsQuery, [eventId]);

    return successResponse(res, {
      event_id: eventId,
      top_schools: topSchools.map((school, index) => ({
        position: index + 1,
        school_id: school.school_id,
        school_name: school.school_name,
        total_score: parseInt(school.school_score),
        breakdown: {
          rank_1_votes: parseInt(school.rank_1_count),
          rank_2_votes: parseInt(school.rank_2_count),
          rank_3_votes: parseInt(school.rank_3_count)
        },
        students_participated: parseInt(school.total_students_ranked),
        stalls_ranked: parseInt(school.ranked_stalls_count)
      })),
      scoring_system: {
        rank_1: '5 points',
        rank_2: '3 points',
        rank_3: '1 point',
        description: 'Schools earn points when their stalls are ranked by students from their own school'
      },
      overall_stats: {
        total_students_participated: parseInt(stats[0]?.total_students_participated || 0),
        total_schools_participated: parseInt(stats[0]?.total_schools_participated || 0),
        total_stalls_ranked: parseInt(stats[0]?.total_stalls_ranked || 0)
      }
    }, 'Top schools retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's own submitted ranking for specific event
 * @route GET /api/ranking/:eventId/my-ranking
 */
const getMyRanking = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const queryText = `
      SELECT 
        r.rank,
        r.submitted_at,
        st.stall_name,
        st.stall_number,
        sc.school_name
      FROM rankings r
      LEFT JOIN stalls st ON r.stall_id = st.id
      LEFT JOIN schools sc ON st.school_id = sc.id
      WHERE r.student_id = $1 AND r.event_id = $2
      ORDER BY r.rank ASC
    `;

    const rankings = await query(queryText, [req.user.id, eventId]);

    if (!rankings || rankings.length === 0) {
      return errorResponse(res, 'You have not submitted rankings for this event yet', 404);
    }

    return successResponse(res, {
      event_id: eventId,
      rankings: rankings.map(r => ({
        rank: r.rank,
        stall_name: r.stall_name,
        stall_number: r.stall_number,
        school_name: r.school_name,
        submitted_at: r.submitted_at
      }))
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAllRankings,
  getRankingByStall,
  getTopRankings,
  getTopStudents,
  getTopSchools,
  getMyRanking,
  updateRanking,
  calculateRankings,
  createRanking,
  deleteRanking
};
