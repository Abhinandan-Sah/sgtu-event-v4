/**
 * Clean up partially created multi-event tables
 * Run this if migration fails midway
 */

import { query } from '../config/db.js';

async function cleanup() {
  console.log('🧹 Cleaning up multi-event tables...\n');
  
  try {
    // Drop tables in correct order (reverse of dependencies)
    const tables = [
      'event_registrations',
      'event_volunteers',
      'event_permissions',
      'events',
      'event_managers'
    ];
    
    for (const table of tables) {
      try {
        await query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`✅ Dropped: ${table}`);
      } catch (error) {
        console.log(`⚠️  ${table}: ${error.message}`);
      }
    }
    
    console.log('\n✅ Cleanup complete! You can now run the migration again.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

cleanup();
