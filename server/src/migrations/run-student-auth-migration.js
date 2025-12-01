/**
 * Migration Runner: Add Student Authentication Fields
 * Production-ready migration with proper error handling and logging
 * Run: node src/migrations/run-student-auth-migration.js
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  let client;

  try {
    console.log(' Starting student authentication migration...\n');

    client = await pool.connect();

    // Read migration SQL file
    const migrationPath = path.join(__dirname, '003_add_student_auth_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log(' Migration file loaded: 003_add_student_auth_fields.sql');
    
    // Execute migration
    await client.query(migrationSQL);

    console.log(' Migration executed successfully!\n');

    // Verify changes
    console.log(' Verifying schema changes...\n');
    
    const verifyQuery = `
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default 
      FROM information_schema.columns 
      WHERE table_name = 'students' 
        AND column_name IN (
          'date_of_birth', 
          'address', 
          'pincode', 
          'program_name', 
          'batch', 
          'is_first_login', 
          'password_reset_required',
          'email'
        )
      ORDER BY ordinal_position
    `;

    const result = await client.query(verifyQuery);
    
    console.log(' New/Modified Columns:');
    console.table(result.rows);

    // Verify indexes
    const indexQuery = `
      SELECT 
        indexname, 
        indexdef 
      FROM pg_indexes 
      WHERE tablename = 'students' 
        AND indexname LIKE 'idx_students_%'
      ORDER BY indexname
    `;

    const indexResult = await client.query(indexQuery);
    console.log('\n New Indexes:');
    console.table(indexResult.rows);

    // Verify constraints
    const constraintQuery = `
      SELECT 
        conname as constraint_name, 
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname IN ('chk_batch_year', 'chk_pincode_format')
    `;

    const constraintResult = await client.query(constraintQuery);
    console.log('\n New Constraints:');
    console.table(constraintResult.rows);

    console.log('\n Migration completed successfully!');
    console.log(' Next steps:');
    console.log('   1. Update Student.model.js with new fields');
    console.log('   2. Update student.controller.js with password reset logic');
    console.log('   3. Update student.route.js with new endpoints\n');

  } catch (error) {
    console.error(' Migration failed:', error.message);
    console.error('\n Error details:', error);
    
    if (error.code) {
      console.error('Error code:', error.code);
    }
    
    console.error('\n To rollback, run: node src/migrations/rollback-student-auth.js\n');
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Execute migration
runMigration();
