// Ranking Seeder - Seeds sample rankings for students
import { query } from '../config/db.js';

export async function seedRankings() {
  console.log('🏆 Seeding rankings...');
  
  try {
    // Get sample students and stalls
    const students = await query('SELECT id FROM students LIMIT 5');
    const stalls = await query('SELECT id FROM stalls ORDER BY id LIMIT 5');
    
    if (students.length === 0 || stalls.length === 0) {
      console.log('   ⏭  Skipped: No students or stalls found\n');
      return;
    }

    let created = 0;

    // Create rankings (each student ranks 3 stalls - their top 3)
    for (let i = 0; i < students.length; i++) {
      // Always rank exactly 3 stalls (schema allows rank 1-3 only)
      for (let rank = 1; rank <= 3 && rank <= stalls.length; rank++) {
        const stallIndex = (rank - 1 + i) % stalls.length;
        
        try {
          const insertQuery = `
            INSERT INTO rankings (student_id, stall_id, rank)
            VALUES ($1, $2, $3)
            ON CONFLICT (student_id, rank) DO NOTHING
            RETURNING *
          `;
          
          const result = await query(insertQuery, [
            students[i].id,
            stalls[stallIndex].id,
            rank
          ]);
          
          if (result.length > 0) {
            created++;
          }
        } catch (error) {
          // Skip on conflict
        }
      }
    }

    console.log(`   ✅ Rankings: ${created} created\n`);
  } catch (error) {
    console.error(`   ✗ Failed to seed rankings: ${error.message}\n`);
  }
}

export default seedRankings;
