// Rollback Database - Drop all tables
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

async function rollbackDatabase() {
  console.log('⚠️  WARNING: This will delete ALL data in your database!\n');
  console.log('🗑️  Dropping all tables...\n');

  const sql = neon(process.env.NEON_DATABASE_URL);

  try {
    // Drop migration tracking table first
    console.log('📌 Dropping migration tracking...');
    await sql`DROP TABLE IF EXISTS _migrations CASCADE`;
    console.log('   ✓ Migration tracking dropped\n');

    // Drop all triggers first
    console.log('📌 Dropping triggers...');
    await sql`DROP TRIGGER IF EXISTS update_stalls_updated_at ON stalls CASCADE`;
    await sql`DROP TRIGGER IF EXISTS update_admins_updated_at ON admins CASCADE`;
    await sql`DROP TRIGGER IF EXISTS update_volunteers_updated_at ON volunteers CASCADE`;
    await sql`DROP TRIGGER IF EXISTS update_students_updated_at ON students CASCADE`;
    await sql`DROP TRIGGER IF EXISTS update_schools_updated_at ON schools CASCADE`;
    console.log('   ✓ Triggers dropped\n');

    // Drop function
    console.log('📌 Dropping functions...');
    await sql`DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE`;
    console.log('   ✓ Functions dropped\n');

    // Drop tables in correct order (child tables first)
    console.log('📌 Dropping tables...');
    
    await sql`DROP TABLE IF EXISTS rankings CASCADE`;
    console.log('   ✓ Dropped rankings');
    
    await sql`DROP TABLE IF EXISTS feedbacks CASCADE`;
    console.log('   ✓ Dropped feedbacks');
    
    await sql`DROP TABLE IF EXISTS check_in_outs CASCADE`;
    console.log('   ✓ Dropped check_in_outs');
    
    await sql`DROP TABLE IF EXISTS stalls CASCADE`;
    console.log('   ✓ Dropped stalls');
    
    await sql`DROP TABLE IF EXISTS admins CASCADE`;
    console.log('   ✓ Dropped admins');
    
    await sql`DROP TABLE IF EXISTS volunteers CASCADE`;
    console.log('   ✓ Dropped volunteers');
    
    await sql`DROP TABLE IF EXISTS students CASCADE`;
    console.log('   ✓ Dropped students');
    
    await sql`DROP TABLE IF EXISTS schools CASCADE`;
    console.log('   ✓ Dropped schools');

    console.log('\n✅ All tables dropped successfully!\n');
    console.log('📝 Next step: Run migration to recreate tables');
    console.log('   node src/migrations/run-migration.js\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    process.exit(1);
  }
}

rollbackDatabase();
