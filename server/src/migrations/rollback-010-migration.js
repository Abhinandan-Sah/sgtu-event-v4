/**
 * Rollback Migration 010 - Add back requires_approval field
 * 
 * This script rolls back the migration by adding back the requires_approval column
 * 
 * Usage: node src/migrations/rollback-010-migration.js
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

async function rollbackMigration() {
  console.log(`\n${colors.cyan}============================================================${colors.reset}`);
  console.log(`${colors.cyan}Rollback Migration 010: Add back requires_approval${colors.reset}`);
  console.log(`${colors.cyan}============================================================${colors.reset}\n`);

  try {
    // Test connection
    console.log(`${colors.blue}ℹ${colors.reset} Testing database connection...`);
    const testResult = await query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`${colors.green}✓${colors.reset} Connected to database: ${testResult[0].db_name}\n`);

    // Check if column already exists
    console.log(`${colors.blue}ℹ${colors.reset} Checking current schema...`);
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'requires_approval'
    `);

    if (columnCheck.length > 0) {
      console.log(`${colors.yellow}⚠${colors.reset} Column 'requires_approval' already exists - rollback not needed\n`);
      process.exit(0);
    }

    console.log(`${colors.green}✓${colors.reset} Column 'requires_approval' does not exist - proceeding with rollback\n`);

    // Execute rollback
    console.log(`${colors.blue}ℹ${colors.reset} Executing rollback...`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE`);
    console.log(`${colors.green}✓${colors.reset} Rollback executed successfully\n`);

    // Verify column was added
    console.log(`${colors.blue}ℹ${colors.reset} Verifying changes...`);
    const verifyCheck = await query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'requires_approval'
    `);

    if (verifyCheck.length > 0) {
      console.log(`${colors.green}✓${colors.reset} Column 'requires_approval' successfully added back`);
      console.log(`  Type: ${verifyCheck[0].data_type}`);
      console.log(`  Default: ${verifyCheck[0].column_default}\n`);
    } else {
      console.log(`${colors.red}✗${colors.reset} Column was not added - verification failed\n`);
      process.exit(1);
    }

    console.log(`\n${colors.green}============================================================${colors.reset}`);
    console.log(`${colors.green}✓ Rollback 010 Completed Successfully!${colors.reset}`);
    console.log(`${colors.green}============================================================${colors.reset}\n`);

    console.log(`${colors.yellow}📋 Summary:${colors.reset}`);
    console.log(`   • Added back 'requires_approval' column to events table`);
    console.log(`   • Column restored with DEFAULT TRUE\n`);

    console.log(`${colors.blue}💡 Next Steps:${colors.reset}`);
    console.log(`   1. Update Event.model.js to use requires_approval again`);
    console.log(`   2. Restart server: npm run dev\n`);

    process.exit(0);

  } catch (error) {
    console.error(`\n${colors.red}✗ Rollback Failed!${colors.reset}`);
    console.error(`${colors.red}Error:${colors.reset} ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run rollback
rollbackMigration();
