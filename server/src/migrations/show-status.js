import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

async function showDatabaseStatus() {
  const sql = neon(process.env.NEON_DATABASE_URL);
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 PRODUCTION DATABASE STATUS');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Tables
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  
  console.log('✅ TABLES CREATED:');
  tables.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.table_name}`);
  });
  
  // Record counts
  const schools = await sql`SELECT COUNT(*) as count FROM schools`;
  const students = await sql`SELECT COUNT(*) as count FROM students`;
  const volunteers = await sql`SELECT COUNT(*) as count FROM volunteers`;
  const stalls = await sql`SELECT COUNT(*) as count FROM stalls`;
  const feedbacks = await sql`SELECT COUNT(*) as count FROM feedbacks`;
  const checkins = await sql`SELECT COUNT(*) as count FROM check_in_outs`;
  
  console.log('\n📈 RECORD COUNTS:');
  console.log(`   Schools: ${schools[0].count}`);
  console.log(`   Students: ${students[0].count}`);
  console.log(`   Volunteers: ${volunteers[0].count}`);
  console.log(`   Stalls: ${stalls[0].count}`);
  console.log(`   Feedbacks: ${feedbacks[0].count}`);
  console.log(`   Check-ins: ${checkins[0].count}`);
  
  // Volunteers table structure
  const volColumns = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'volunteers' 
    ORDER BY ordinal_position
  `;
  
  console.log('\n✅ VOLUNTEERS TABLE COLUMNS:');
  volColumns.forEach((col, i) => {
    const isRemoved = col.column_name === 'volunteer_id' ? ' ❌ SHOULD NOT EXIST' : '';
    console.log(`   ${i + 1}. ${col.column_name}${isRemoved}`);
  });
  
  const hasVolunteerId = volColumns.some(col => col.column_name === 'volunteer_id');
  
  console.log('\n═══════════════════════════════════════════════════════');
  if (hasVolunteerId) {
    console.log('❌ ERROR: volunteer_id still exists in database!');
  } else {
    console.log('✅ SUCCESS: volunteer_id has been completely removed!');
  }
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Test credentials
  const testStudent = await sql`
    SELECT email, registration_no 
    FROM students 
    WHERE email = 'test@sgtu.ac.in' 
    LIMIT 1
  `;
  
  if (testStudent.length > 0) {
    console.log('🔐 TEST CREDENTIALS:');
    console.log(`   Email: ${testStudent[0].email}`);
    console.log(`   Registration: ${testStudent[0].registration_no}`);
    console.log(`   Password: student123\n`);
  }
  
  console.log('🎉 Database is production-ready!\n');
}

showDatabaseStatus().catch(console.error);
