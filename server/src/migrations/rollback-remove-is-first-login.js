const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/db');

async function rollbackMigration() {
  try {
    console.log('🔄 Starting rollback: Add back is_first_login column...\n');

    // Read the rollback SQL file
    const rollbackPath = path.join(__dirname, '004_remove_is_first_login_down.sql');
    const rollbackSQL = fs.readFileSync(rollbackPath, 'utf8');

    // Execute the rollback
    await query(rollbackSQL);

    console.log('✅ Rollback completed successfully!');
    console.log('📝 Changes made:');
    console.log('   - Added back is_first_login column to students table');
    console.log('   - Synced values with password_reset_required\n');

    // Verify the rollback
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

    if (rows.some(col => col.column_name === 'is_first_login')) {
      console.log('\n✅ Verification passed: is_first_login column restored');
    }

  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

rollbackMigration();
