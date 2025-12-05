/**
 * Run Single Migration - 010_remove_requires_approval
 * 
 * ⚠️ IMPORTANT: This migration is ONLY for existing databases!
 * 
 * Fresh database setups using migration 005 (updated version) do NOT need this.
 * Migration 005 was already fixed to exclude the requires_approval column.
 * 
 * This script runs only the specific migration to remove the requires_approval field
 * from existing databases that were set up before the security fix.
 * 
 * Usage: node src/migrations/run-010-migration.js
 *        OR: npm run migrate:010
 */

import { query } from '../config/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function runMigration() {
  console.log(`\n${colors.cyan}============================================================${colors.reset}`);
  console.log(`${colors.cyan}Running Migration 010: Remove requires_approval${colors.reset}`);
  console.log(`${colors.cyan}============================================================${colors.reset}\n`);

  try {
    // Test connection
    console.log(`${colors.blue}ℹ${colors.reset} Testing database connection...`);
    const testResult = await query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`${colors.green}✓${colors.reset} Connected to database: ${testResult[0].db_name}\n`);

    // Check if column exists before migration
    console.log(`${colors.blue}ℹ${colors.reset} Checking current schema...`);
    const columnCheck = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'requires_approval'
    `);

    if (columnCheck.length === 0) {
      console.log(`${colors.yellow}⚠${colors.reset} Column 'requires_approval' does not exist - migration already applied or not needed\n`);
      process.exit(0);
    }

    console.log(`${colors.green}✓${colors.reset} Found column 'requires_approval' (${columnCheck[0].data_type})\n`);

    // Execute migration in separate statements
    console.log(`${colors.blue}ℹ${colors.reset} Executing migration...\n`);

    // Step 1: Drop the column
    console.log(`  ${colors.cyan}→${colors.reset} Dropping requires_approval column...`);
    await query(`ALTER TABLE events DROP COLUMN IF EXISTS requires_approval`);
    console.log(`  ${colors.green}✓${colors.reset} Column dropped\n`);

    // Step 2: Fix any incorrectly approved events
    console.log(`  ${colors.cyan}→${colors.reset} Fixing incorrectly approved events...`);
    const fixResult = await query(`
      UPDATE events 
      SET status = 'DRAFT' 
      WHERE status = 'APPROVED' 
        AND created_by_manager_id IS NOT NULL 
        AND approved_by_admin_id IS NULL
    `);
    console.log(`  ${colors.green}✓${colors.reset} Fixed ${fixResult.length} events\n`);

    console.log(`${colors.green}✓${colors.reset} Migration executed successfully\n`);

    // Verify column was removed
    console.log(`${colors.blue}ℹ${colors.reset} Verifying changes...`);
    const verifyCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'requires_approval'
    `);

    if (verifyCheck.length === 0) {
      console.log(`${colors.green}✓${colors.reset} Column 'requires_approval' successfully removed\n`);
    } else {
      console.log(`${colors.red}✗${colors.reset} Column still exists - verification failed\n`);
      process.exit(1);
    }

    // Show updated event columns
    console.log(`${colors.blue}ℹ${colors.reset} Current events table structure:`);
    const eventColumns = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'events'
      ORDER BY ordinal_position
    `);

    eventColumns.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      console.log(`  ${colors.cyan}→${colors.reset} ${col.column_name} (${col.data_type}) ${nullable}${defaultVal}`);
    });

    console.log(`\n${colors.green}============================================================${colors.reset}`);
    console.log(`${colors.green}✓ Migration 010 Completed Successfully!${colors.reset}`);
    console.log(`${colors.green}============================================================${colors.reset}\n`);

    console.log(`${colors.yellow}📋 Summary:${colors.reset}`);
    console.log(`   • Removed 'requires_approval' column from events table`);
    console.log(`   • All manager events now must go through approval workflow`);
    console.log(`   • Security vulnerability fixed\n`);

    console.log(`${colors.blue}💡 Next Steps:${colors.reset}`);
    console.log(`   1. Test event creation: Events should start with status 'DRAFT'`);
    console.log(`   2. Test approval workflow: DRAFT → PENDING_APPROVAL → APPROVED`);
    console.log(`   3. Restart server: npm run dev\n`);

    process.exit(0);

  } catch (error) {
    console.error(`\n${colors.red}✗ Migration Failed!${colors.reset}`);
    console.error(`${colors.red}Error:${colors.reset} ${error.message}\n`);
    console.error(error.stack);

    console.log(`\n${colors.yellow}📋 Rollback Instructions:${colors.reset}`);
    console.log(`   To rollback this migration, run:`);
    console.log(`   ${colors.cyan}node src/migrations/rollback-010-migration.js${colors.reset}\n`);

    process.exit(1);
  }
}

// Run migration
runMigration();
