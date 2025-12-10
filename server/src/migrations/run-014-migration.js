/**
 * Run Migration 014: Add Refund Configuration
 * Adds cancellation_deadline_hours and refund_tiers to events table
 */

import { query } from '../config/db.js';

async function runMigration() {
  try {
    console.log('🚀 Starting Migration 014: Add Refund Configuration...\n');

    // 1. Add cancellation_deadline_hours column
    console.log('📝 Adding cancellation_deadline_hours column...');
    await query(`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS cancellation_deadline_hours INTEGER DEFAULT 24
    `);
    console.log('   ✅ Column added\n');

    // 2. Add refund_tiers column
    console.log('📝 Adding refund_tiers column...');
    await query(`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS refund_tiers JSONB DEFAULT NULL
    `);
    console.log('   ✅ Column added\n');

    // 3. Add cancellation_reason column
    console.log('📝 Adding cancellation_reason column...');
    await query(`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS cancellation_reason TEXT DEFAULT NULL
    `);
    console.log('   ✅ Column added\n');

    // 4. Add cancelled_at column
    console.log('📝 Adding cancelled_at column...');
    await query(`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP DEFAULT NULL
    `);
    console.log('   ✅ Column added\n');

    // 5. Create index
    console.log('📝 Creating index on cancelled_at...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_events_cancelled_at 
      ON events(cancelled_at) 
      WHERE cancelled_at IS NOT NULL
    `);
    console.log('   ✅ Index created\n');

    console.log('✅ Migration 014 completed successfully!\n');
    console.log('📊 New fields added to events table:');
    console.log('   - cancellation_deadline_hours (INTEGER, default: 24)');
    console.log('   - refund_tiers (JSONB)');
    console.log('   - cancellation_reason (TEXT)');
    console.log('   - cancelled_at (TIMESTAMP)');
    console.log('   - idx_events_cancelled_at (INDEX)\n');

    // Verify migration
    const verifyQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'events' 
      AND column_name IN ('cancellation_deadline_hours', 'refund_tiers', 'cancellation_reason', 'cancelled_at')
      ORDER BY ordinal_position
    `;
    const result = await query(verifyQuery);

    if (result.length === 4) {
      console.log('✅ Verification successful:');
      result.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });
      console.log('\n🎉 Migration completed successfully!');
    } else {
      console.warn('⚠️  Verification incomplete: Expected 4 columns, found', result.length);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration 014 failed:', error);
    process.exit(1);
  }
}

runMigration();
