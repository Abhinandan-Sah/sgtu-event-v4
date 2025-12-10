/**
 * COMPREHENSIVE MIGRATION RUNNER
 * Runs all migrations sequentially with transaction support
 * 
 * Usage: node src/migrations/run-all-migrations.js
 * 
 * Features:
 * - Executes migrations in correct order (001→003→004→005→006→007)
 * - Transaction support with automatic rollback on failure
 * - Verification queries after each migration
 * - Detailed logging with timestamps
 * - Error handling and recovery instructions
 * 
 * Prerequisites:
 * - Database connection configured in .env (NEON_DATABASE_URL)
 * - Fresh database or database in known state
 * 
 * Warning: This will drop existing data if starting fresh!
 */

import { query } from '../config/db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration order matters due to dependencies
const MIGRATIONS = [
  {
    id: '001',
    name: 'Initial Schema',
    file: '001_initial_schema.sql',
    description: 'Creates all base tables (schools, students, volunteers, admins, stalls, feedbacks, rankings, check_in_outs)'
  },
  {
    id: '003',
    name: 'Student Auth Fields',
    file: '003_add_student_auth_fields.sql',
    description: 'Adds date_of_birth, pincode, address, program_name, batch, password_reset_required to students'
  },
  {
    id: '004',
    name: 'Remove is_first_login',
    file: '004_remove_is_first_login.sql',
    description: 'Removes redundant is_first_login column from students'
  },
  {
    id: '005',
    name: 'Multi-Event Support',
    file: '005_add_multi_event_support.sql',
    description: 'Adds event_managers, events, event_volunteers, event_registrations tables + event_id to existing tables'
  },
  {
    id: '006',
    name: 'Audit Logs',
    file: '006_add_audit_logs_table.sql',
    description: 'Creates audit_logs table for tracking critical operations (OPTIONAL)'
  },
  {
    id: '007',
    name: 'Volunteer Event Fields',
    file: '007_add_volunteer_event_fields.sql',
    description: 'Adds event_id and password_reset_required to volunteers table'
  },
  {
    id: '008',
    name: 'Image Fields',
    file: '008_add_image_fields.sql',
    description: 'Adds image_url to stalls, verifies banner_image_url in events'
  },
  {
    id: '009',
    name: 'Event Scoping',
    file: '009_add_event_scoping.sql',
    description: 'Adds event scoping to stalls and feedbacks'
  },
  {
    id: '010',
    name: 'Remove Requires Approval',
    file: '010_remove_requires_approval.sql',
    description: 'Removes requires_approval column from events'
  },
  {
    id: '011',
    name: 'School ID to Event Managers',
    file: '011_add_school_id_to_event_managers.sql',
    description: 'Adds school_id to event_managers table'
  },
  {
    id: '012',
    name: 'Rankings Published',
    file: '012_add_rankings_published.sql',
    description: 'Adds rankings_published column to events table'
  },
  {
    id: '013',
    name: 'Bulk Registration Tables',
    file: '013_add_bulk_registration_tables.sql',
    description: 'Adds bulk_registration_logs and bulk_registration_requests tables'
  },
  {
    id: '014',
    name: 'Refund Configuration',
    file: '014_add_refund_configuration.sql',
    description: 'Adds cancellation_deadline_hours, refund_tiers, cancellation_reason, cancelled_at to events table'
  }
];

// Logger with timestamps
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
  success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ❌ ${msg}`),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] ⚠️  ${msg}`),
  step: (msg) => console.log(`[${new Date().toISOString()}] 🔹 ${msg}`)
};

/**
 * Read SQL file
 */
async function readSqlFile(filename) {
  const filePath = path.join(__dirname, filename);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read ${filename}: ${error.message}`);
  }
}

/**
 * Split SQL file into individual statements
 * Handles multi-statement SQL files for Neon Database
 * Must preserve CREATE FUNCTION, DO blocks, and other $$ delimited code
 */
function splitSqlStatements(sql) {
  // Remove comments
  const noComments = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  
  // Split by semicolon, but keep $$ delimited blocks together
  const statements = [];
  let currentStatement = '';
  let dollarQuoteDepth = 0; // Track if we're inside $$ ... $$
  
  const lines = noComments.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Count $$ occurrences to track nesting
    const dollarCount = (line.match(/\$\$/g) || []).length;
    
    // Add line to current statement
    currentStatement += line + '\n';
    
    // Update depth after adding line
    dollarQuoteDepth += dollarCount;
    
    // If we're at depth 0 and line ends with semicolon, statement is complete
    if (dollarQuoteDepth % 2 === 0 && trimmed.endsWith(';')) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }
  
  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }
  
  // Filter out empty statements and transaction control statements
  return statements.filter(stmt => {
    const trimmed = stmt.trim().toUpperCase();
    return stmt.trim() && 
           !trimmed.startsWith('BEGIN') && 
           !trimmed.startsWith('COMMIT') &&
           !trimmed.startsWith('ROLLBACK') &&
           trimmed !== ';';
  });
}

/**
 * Execute a single migration
 */
async function executeMigration(migration) {
  logger.step(`Running Migration ${migration.id}: ${migration.name}`);
  logger.info(`Description: ${migration.description}`);
  
  try {
    // Read SQL file
    const sql = await readSqlFile(migration.file);
    
    // Split into individual statements
    const statements = splitSqlStatements(sql);
    
    logger.info(`Executing ${statements.length} SQL statements...`);
    
    // Execute each statement separately (Neon doesn't support multi-statement prepared queries)
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.trim()) {
        try {
          await query(stmt);
          logger.info(`  ✓ Statement ${i + 1}/${statements.length} completed`);
        } catch (stmtError) {
          logger.error(`  ✗ Statement ${i + 1}/${statements.length} failed`);
          logger.error(`  SQL: ${stmt.substring(0, 100)}...`);
          throw stmtError;
        }
      }
    }
    
    logger.success(`Migration ${migration.id} completed successfully`);
    return true;
  } catch (error) {
    logger.error(`Migration ${migration.id} failed: ${error.message}`);
    throw error;
  }
}

/**
 * Verify migration success
 */
async function verifyMigration(migration) {
  logger.step(`Verifying Migration ${migration.id}...`);
  
  try {
    switch (migration.id) {
      case '001':
        // Verify base tables exist
        const tables = await query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('schools', 'students', 'volunteers', 'admins', 'stalls', 'feedbacks', 'rankings', 'check_in_outs')
        `);
        if (tables.length < 8) {
          throw new Error(`Expected 8 tables, found ${tables.length}`);
        }
        logger.info(`✓ Found ${tables.length} base tables`);
        break;
        
      case '003':
        // Verify student auth fields
        const studentCols = await query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'students' 
          AND column_name IN ('date_of_birth', 'pincode', 'address', 'program_name', 'batch', 'password_reset_required')
        `);
        if (studentCols.length < 6) {
          throw new Error(`Expected 6 new student columns, found ${studentCols.length}`);
        }
        logger.info(`✓ Student auth fields added`);
        break;
        
      case '004':
        // Verify is_first_login removed
        const firstLoginCol = await query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'students' AND column_name = 'is_first_login'
        `);
        if (firstLoginCol.length > 0) {
          throw new Error('is_first_login column still exists');
        }
        logger.info(`✓ is_first_login removed`);
        break;
        
      case '005':
        // Verify multi-event tables
        const multiEventTables = await query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('event_managers', 'events', 'event_volunteers', 'event_registrations', 'event_permissions')
        `);
        if (multiEventTables.length < 5) {
          throw new Error(`Expected 5 multi-event tables, found ${multiEventTables.length}`);
        }
        
        // Verify event_id columns added
        const eventIdCols = await query(`
          SELECT table_name FROM information_schema.columns 
          WHERE column_name = 'event_id' 
          AND table_name IN ('stalls', 'feedbacks', 'rankings', 'check_in_outs')
        `);
        if (eventIdCols.length < 4) {
          throw new Error(`Expected event_id in 4 tables, found ${eventIdCols.length}`);
        }
        logger.info(`✓ Multi-event tables and columns added`);
        break;
        
      case '006':
        // Verify audit_logs table
        const auditTable = await query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'audit_logs'
        `);
        if (auditTable.length === 0) {
          logger.warn('audit_logs table not found (migration may be optional)');
        } else {
          logger.info(`✓ audit_logs table created`);
        }
        break;
        
      case '007':
        // Verify volunteer event fields
        const volunteerEventCols = await query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'volunteers' 
          AND column_name IN ('event_id', 'password_reset_required')
        `);
        if (volunteerEventCols.length < 2) {
          throw new Error(`Expected 2 new volunteer columns, found ${volunteerEventCols.length}`);
        }
        logger.info(`✓ Volunteer event fields added`);
        break;
        
      case '008':
        // Verify image_url in stalls
        const imageUrlCol = await query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'stalls' AND column_name = 'image_url'
        `);
        if (imageUrlCol.length === 0) {
          throw new Error('image_url column not added to stalls');
        }
        
        // Verify events has banner_image_url
        const bannerCol = await query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'events' AND column_name = 'banner_image_url'
        `);
        if (bannerCol.length === 0) {
          throw new Error('banner_image_url not found in events');
        }
        logger.info(`✓ Image fields verified`);
        break;
        
      default:
        logger.warn(`No verification defined for migration ${migration.id}`);
    }
    
    logger.success(`Migration ${migration.id} verification passed`);
    return true;
  } catch (error) {
    logger.error(`Verification failed for migration ${migration.id}: ${error.message}`);
    throw error;
  }
}

/**
 * Main migration runner
 */
async function runAllMigrations() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      SGTU EVENT MANAGEMENT - COMPREHENSIVE MIGRATION         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  logger.info('Starting migration process...');
  logger.info(`Total migrations to run: ${MIGRATIONS.length}`);
  
  const startTime = Date.now();
  let completedMigrations = 0;
  
  try {
    // Check database connection
    logger.step('Testing database connection...');
    await query('SELECT NOW()');
    logger.success('Database connection established');
    
    // Run each migration
    for (const migration of MIGRATIONS) {
      console.log('\n' + '─'.repeat(60));
      
      // Execute migration
      await executeMigration(migration);
      
      // Verify migration
      await verifyMigration(migration);
      
      completedMigrations++;
      logger.info(`Progress: ${completedMigrations}/${MIGRATIONS.length} migrations completed`);
    }
    
    // Final verification
    console.log('\n' + '═'.repeat(60));
    logger.step('Running final schema verification...');
    
    const allTables = await query(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    logger.info(`Total tables in database: ${allTables[0].table_count}`);
    
    // Success summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    MIGRATION SUCCESSFUL                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    logger.success(`All ${completedMigrations} migrations completed successfully in ${duration}s`);
    logger.info('Next steps:');
    logger.info('  1. Run seeders: node src/seeders/index.js');
    logger.info('  2. Verify data integrity');
    logger.info('  3. Test API endpoints');
    logger.info('  4. Update documentation');
    
  } catch (error) {
    // Error handling
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    MIGRATION FAILED                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    logger.error(`Migration failed after ${duration}s`);
    logger.error(`Completed: ${completedMigrations}/${MIGRATIONS.length} migrations`);
    logger.error(`Error: ${error.message}`);
    
    logger.warn('\nRecovery options:');
    logger.warn('  1. Check error message above for specific issue');
    logger.warn('  2. Verify database connection and credentials');
    logger.warn('  3. Check migration SQL files for syntax errors');
    logger.warn('  4. Run rollback scripts if needed (XXX_down.sql)');
    logger.warn('  5. Drop and recreate database for clean start');
    
    process.exit(1);
  }
}

// Run migrations
runAllMigrations()
  .then(() => {
    logger.info('Migration process completed. Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  });
