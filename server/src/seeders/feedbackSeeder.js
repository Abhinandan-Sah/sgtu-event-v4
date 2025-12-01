// Feedback Seeder - Seeds sample feedback for stalls
import { query } from '../config/db.js';

export async function seedFeedbacks() {
  console.log('⭐ Seeding feedbacks...');
  
  try {
    // Get sample students and stalls
    const students = await query('SELECT id FROM students LIMIT 5');
    const stalls = await query('SELECT id FROM stalls LIMIT 5');
    
    if (students.length === 0 || stalls.length === 0) {
      console.log('   ⏭  Skipped: No students or stalls found\n');
      return;
    }

    let created = 0;
    const feedbackTexts = [
      'Excellent presentation and innovative ideas!',
      'Very informative and well organized.',
      'Great project, learned a lot!',
      'Impressive work, keep it up!',
      'Good effort, but could be improved.',
      'Outstanding display and explanation.',
      'Interesting concepts, well executed.',
      'Nice project, very creative!',
      'Well done, very professional.',
      'Inspiring work, great team!'
    ];

    // Create feedbacks (each student rates 2-3 stalls)
    for (let i = 0; i < students.length; i++) {
      const numFeedbacks = Math.floor(Math.random() * 2) + 2; // 2-3 feedbacks per student
      
      for (let j = 0; j < numFeedbacks; j++) {
        const stallIndex = (i + j) % stalls.length;
        const rating = Math.floor(Math.random() * 2) + 4; // 4-5 stars
        const feedbackText = feedbackTexts[Math.floor(Math.random() * feedbackTexts.length)];
        
        try {
          const insertQuery = `
            INSERT INTO feedbacks (student_id, stall_id, rating, comment, submitted_at)
            VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${Math.floor(Math.random() * 5)} hours')
            ON CONFLICT (student_id, stall_id) DO NOTHING
            RETURNING *
          `;
          
          const result = await query(insertQuery, [
            students[i].id,
            stalls[stallIndex].id,
            rating,
            feedbackText
          ]);
          
          if (result.length > 0) {
            created++;
          }
        } catch (error) {
          // Skip on conflict
        }
      }
    }

    console.log(`   ✅ Feedbacks: ${created} created\n`);
  } catch (error) {
    console.error(`   ✗ Failed to seed feedbacks: ${error.message}\n`);
  }
}

export default seedFeedbacks;
