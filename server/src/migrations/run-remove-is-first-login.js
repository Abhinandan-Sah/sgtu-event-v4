const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/db');

async function runMigration() {
  try {
    console.log('🚀 Starting migration: Remove is_first_login column...\n');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '004_remove_is_first_login.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('📝 Changes made:');
    console.log('   - Removed is_first_login column from students table');
    console.log('   - Added documentation comment to password_reset_required column\n');

    // Verify the change
    console.log('🔍 Verifying schema...');
    const { rows } = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'students'
      AND column_name IN ('is_first_login', 'password_reset_required')
      ORDER BY column_name;
    `);

    console.log('\n📊 Current student authentication columns:');
    rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    if (!rows.some(col => col.column_name === 'is_first_login')) {
      console.log('\n✅ Verification passed: is_first_login column successfully removed');
    } else {
      console.log('\n⚠️  Warning: is_first_login column still exists');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nTo rollback, run:');
    console.error('node src/migrations/rollback-remove-is-first-login.js');
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
