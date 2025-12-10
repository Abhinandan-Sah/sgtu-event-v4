// Migration 011 Runner - Add school_id to event_managers table
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration011() {
  console.log('\n🚀 Running Migration 011: Add school_id to event_managers\n');
  
  const sql = neon(process.env.NEON_DATABASE_URL);
  
  try {
    // Read migration SQL file
    const migrationSQL = readFileSync(
      join(__dirname, '011_add_school_id_to_event_managers.sql'), 
      'utf8'
    );
    
    // Split into individual statements and execute separately (Neon limitation)
    console.log('📝 Executing migration SQL...');
    
    // Split by DO blocks and other statements
    const statements = migrationSQL
      .split(/(?=DO \$\$)|(?=CREATE INDEX)|(?=COMMENT ON)/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      if (statement) {
        await sql(statement);
      }
    }
    
    console.log('\n✅ Migration 011 completed successfully!');
    console.log('\n📋 Changes applied:');
    console.log('   ✓ Added school_id column to event_managers table');
    console.log('   ✓ Added password_reset_required column');
    console.log('   ✓ Created index on school_id');
    console.log('   ✓ Kept organization column for backward compatibility');
    console.log('\n📌 Notes:');
    console.log('   - Existing event managers will have school_id = NULL');
    console.log('   - New event managers should use school_id instead of organization');
    console.log('   - Password pattern: firstname@phonenumber');
    console.log('   - Verification uses: phone + school_id');
    
  } catch (error) {
    console.error('\n❌ Migration 011 failed:', error.message);
    console.error('\n💡 Possible solutions:');
    console.error('   1. Check if migration was already applied');
    console.error('   2. Verify database connection');
    console.error('   3. Check migration SQL syntax');
    throw error;
  }
}

// Run migration
runMigration011()
  .then(() => {
    console.log('\n✨ Migration 011 process completed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration 011 process failed\n');
    process.exit(1);
  });
