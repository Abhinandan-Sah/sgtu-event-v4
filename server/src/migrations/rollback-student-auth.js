/**
 * Rollback Script: Remove Student Authentication Fields
 * WARNING: This will permanently delete data in auth-related columns
 * Run: node src/migrations/rollback-student-auth.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function rollbackMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  let client;

  try {
    console.log('  WARNING: This will delete all student authentication data!');
    console.log(' Starting rollback...\n');

    client = await pool.connect();

    // Read rollback SQL file
    const rollbackPath = path.join(__dirname, '003_add_student_auth_fields_down.sql');
    const rollbackSQL = fs.readFileSync(rollbackPath, 'utf8');

    console.log(' Rollback file loaded: 003_add_student_auth_fields_down.sql');
    
    // Execute rollback
    await client.query(rollbackSQL);

    console.log(' Rollback executed successfully!\n');

    // Verify changes
    const verifyQuery = 
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'students' 
      ORDER BY ordinal_position;
    ;

    const result = await client.query(verifyQuery);
    
    console.log(' Remaining columns in students table:');
    console.log(result.rows.map(r => r.column_name).join(', '));

    console.log('\n Rollback completed successfully!\n');

  } catch (error) {
    console.error(' Rollback failed:', error.message);
    console.error('\n Error details:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Execute rollback
rollbackMigration();
