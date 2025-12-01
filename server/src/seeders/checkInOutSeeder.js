// CheckInOut Seeder - Seeds sample check-in/out records for testing analytics
import { query } from '../config/db.js';

export async function seedCheckInOuts() {
  console.log('📊 Seeding check-in/out records...');
  
  try {
    // Get sample students and volunteers
    const students = await query('SELECT id FROM students LIMIT 5');
    const volunteers = await query('SELECT id FROM volunteers LIMIT 2');
    
    if (students.length === 0 || volunteers.length === 0) {
      console.log('   ⏭  Skipped: No students or volunteers found\n');
      return;
    }

    let created = 0;
    
    // Create sample check-ins and check-outs
    const checkInOuts = [
      {
        student_id: students[0].id,
        volunteer_id: volunteers[0].id,
        scan_type: 'CHECKIN',
        scan_number: 1,
        duration_minutes: null
      },
      {
        student_id: students[0].id,
        volunteer_id: volunteers[0].id,
        scan_type: 'CHECKOUT',
        scan_number: 2,
        duration_minutes: 120
      },
      {
        student_id: students[1].id,
        volunteer_id: volunteers[0].id,
        scan_type: 'CHECKIN',
        scan_number: 1,
        duration_minutes: null
      },
      {
        student_id: students[1].id,
        volunteer_id: volunteers[1].id,
        scan_type: 'CHECKOUT',
        scan_number: 2,
        duration_minutes: 90
      },
      {
        student_id: students[2].id,
        volunteer_id: volunteers[0].id,
        scan_type: 'CHECKIN',
        scan_number: 1,
        duration_minutes: null
      }
    ];

    for (const record of checkInOuts) {
      try {
        const insertQuery = `
          INSERT INTO check_in_outs (student_id, volunteer_id, scan_type, scan_number, duration_minutes, scanned_at)
          VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${Math.floor(Math.random() * 10)} hours')
          ON CONFLICT (student_id, scan_number) DO NOTHING
          RETURNING *
        `;
        
        const result = await query(insertQuery, [
          record.student_id,
          record.volunteer_id,
          record.scan_type,
          record.scan_number,
          record.duration_minutes
        ]);
        
        if (result.length > 0) {
          created++;
        }
      } catch (error) {
        // Skip on conflict
      }
    }

    console.log(`   ✅ Check-in/outs: ${created} created\n`);
  } catch (error) {
    console.error(`   ✗ Failed to seed check-in/outs: ${error.message}\n`);
  }
}

export default seedCheckInOuts;
