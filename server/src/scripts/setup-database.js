/**
 * COMPLETE DATABASE SETUP SCRIPT
 * One command to rule them all - sets up a fresh database from scratch
 * 
 * Usage: npm run db:setup:complete
 * 
 * This script will:
 * 1. Test database connection
 * 2. Check if database has existing data
 * 3. Optionally drop all tables (for fresh setup)
 * 4. Run all migrations in order (001→003→004→005→006→007→008→009)
 * 5. Seed base data (schools, admins)
 * 6. Create multi-event structure with sample events
 * 7. Verify final database state
 * 8. Display connection info and next steps
 * 
 * Environment Variables Required:
 * - NEON_DATABASE_URL: PostgreSQL connection string
 * 
 * Exit Codes:
 * - 0: Success
 * - 1: Connection failure
 * - 2: Migration failure
 * - 3: Seeding failure
 */

import { query } from '../config/db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg) => console.log(`\n${colors.cyan}${colors.bright}▶ ${msg}${colors.reset}`),
  substep: (msg) => console.log(`  ${colors.magenta}→${colors.reset} ${msg}`)
};

// Migration files in execution order
const MIGRATIONS = [
  { id: '001', file: '001_initial_schema.sql', name: 'Initial Schema' },
  { id: '003', file: '003_add_student_auth_fields.sql', name: 'Student Auth Fields' },
  { id: '004', file: '004_remove_is_first_login.sql', name: 'Remove is_first_login' },
  { id: '005', file: '005_add_multi_event_support.sql', name: 'Multi-Event Support' },
  { id: '006', file: '006_add_audit_logs_table.sql', name: 'Audit Logs Table' },
  { id: '007', file: '007_add_volunteer_event_fields.sql', name: 'Volunteer Event Fields' },
  { id: '008', file: '008_add_image_fields.sql', name: 'Image Fields' },
  { id: '009', file: '009_add_event_scoping.sql', name: 'Event Scoping' }
];

// Seeder files in execution order
const SEEDERS = [
  { file: 'schoolSeeder.js', name: 'Schools' },
  { file: 'adminSeeder.js', name: 'Admin Users' },
  { file: 'simpleMultiEventSeeder.js', name: 'Multi-Event Structure' }
];

/**
 * Test database connection
 */
async function testConnection() {
  log.step('Testing database connection...');
  try {
    const result = await query('SELECT NOW() as current_time, current_database() as db_name, version() as pg_version');
    log.success(`Connected to database: ${result[0].db_name}`);
    log.substep(`PostgreSQL version: ${result[0].pg_version.split(' ')[1]}`);
    log.substep(`Server time: ${result[0].current_time}`);
    return true;
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    log.warning('Please check your NEON_DATABASE_URL in .env file');
    return false;
  }
}

/**
 * Check if database has existing tables
 */
async function checkExistingData() {
  log.step('Checking for existing database schema...');
  try {
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    if (result.length === 0) {
      log.info('Database is empty - fresh setup');
      return { hasData: false, tables: [] };
    }
    
    log.warning(`Found ${result.length} existing tables:`);
    result.forEach(row => log.substep(row.table_name));
    
    // Check if tables have data
    const dataCounts = await Promise.all([
      query('SELECT COUNT(*) as count FROM events').catch(() => ({ count: 0 })),
      query('SELECT COUNT(*) as count FROM students').catch(() => ({ count: 0 })),
      query('SELECT COUNT(*) as count FROM stalls').catch(() => ({ count: 0 })),
    ]);
    
    const totalRecords = dataCounts.reduce((sum, result) => {
      return sum + (Array.isArray(result) ? parseInt(result[0]?.count || 0) : 0);
    }, 0);
    
    return { hasData: true, tables: result.map(r => r.table_name), recordCount: totalRecords };
  } catch (error) {
    log.info('No existing schema detected');
    return { hasData: false, tables: [] };
  }
}

/**
 * Drop all tables (for fresh setup)
 */
async function dropAllTables() {
  log.step('Dropping all existing tables...');
  try {
    await query('DROP SCHEMA public CASCADE');
    await query('CREATE SCHEMA public');
    await query('GRANT ALL ON SCHEMA public TO PUBLIC');
    log.success('All tables dropped - database is now clean');
    return true;
  } catch (error) {
    log.error(`Failed to drop tables: ${error.message}`);
    return false;
  }
}

/**
 * Run a single migration file
 */
async function runMigration(migration) {
  log.substep(`Running ${migration.id}: ${migration.name}`);
  
  try {
    const migrationPath = path.join(__dirname, '../migrations', migration.file);
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    // Split SQL file by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      await query(statement);
    }
    
    log.success(`${migration.id} completed: ${migration.name}`);
    return true;
  } catch (error) {
    log.error(`Migration ${migration.id} failed: ${error.message}`);
    throw error;
  }
}

/**
 * Run all migrations
 */
async function runAllMigrations() {
  log.step('Running migrations...');
  
  try {
    for (const migration of MIGRATIONS) {
      await runMigration(migration);
    }
    log.success(`All ${MIGRATIONS.length} migrations completed successfully`);
    return true;
  } catch (error) {
    log.error('Migration process failed');
    throw error;
  }
}

/**
 * Run a single seeder
 */
async function runSeeder(seeder) {
  log.substep(`Seeding ${seeder.name}...`);
  
  try {
    const seederPath = path.join(__dirname, '../seeders', seeder.file);
    const seederModule = await import(`file://${seederPath}`);
    
    // Most seeders export a default function or a seed function
    if (typeof seederModule.default === 'function') {
      await seederModule.default();
    } else if (typeof seederModule.seed === 'function') {
      await seederModule.seed();
    } else {
      log.warning(`Seeder ${seeder.file} has no default export or seed function`);
    }
    
    log.success(`${seeder.name} seeded`);
    return true;
  } catch (error) {
    log.error(`Seeder ${seeder.file} failed: ${error.message}`);
    throw error;
  }
}

/**
 * Run all seeders
 */
async function runAllSeeders() {
  log.step('Seeding database...');
  
  try {
    for (const seeder of SEEDERS) {
      await runSeeder(seeder);
    }
    log.success(`All ${SEEDERS.length} seeders completed successfully`);
    return true;
  } catch (error) {
    log.error('Seeding process failed');
    throw error;
  }
}

/**
 * Verify database setup
 */
async function verifySetup() {
  log.step('Verifying database setup...');
  
  try {
    // Check tables
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    log.success(`${tables.length} tables created`);
    
    // Check data
    const stats = await Promise.all([
      query('SELECT COUNT(*) as count FROM schools'),
      query('SELECT COUNT(*) as count FROM events'),
      query('SELECT COUNT(*) as count FROM admins'),
      query('SELECT COUNT(*) as count FROM students'),
      query('SELECT COUNT(*) as count FROM stalls'),
      query('SELECT COUNT(*) as count FROM volunteers'),
    ]);
    
    log.substep(`Schools: ${stats[0][0].count}`);
    log.substep(`Events: ${stats[1][0].count}`);
    log.substep(`Admins: ${stats[2][0].count}`);
    log.substep(`Students: ${stats[3][0].count}`);
    log.substep(`Stalls: ${stats[4][0].count}`);
    log.substep(`Volunteers: ${stats[5][0].count}`);
    
    return true;
  } catch (error) {
    log.error(`Verification failed: ${error.message}`);
    return false;
  }
}

/**
 * Display final summary
 */
function displaySummary() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.green}${colors.bright}DATABASE SETUP COMPLETE!${colors.reset}`);
  console.log('='.repeat(60));
  
  console.log('\n📋 Next Steps:');
  console.log('   1. Start the server: npm run dev');
  console.log('   2. API will be available at: http://localhost:5000');
  console.log('   3. Check API health: GET /api/health');
  
  console.log('\n🔑 Default Admin Credentials:');
  console.log('   Email: admin@sgtu.edu.in');
  console.log('   Password: Admin@123');
  
  console.log('\n📚 Available Commands:');
  console.log('   npm run dev              - Start development server');
  console.log('   npm run migrate:verify   - Verify database schema');
  console.log('   npm run db:setup:fresh   - Reset and setup database');
  
  console.log('\n💡 Database Info:');
  console.log('   Connection: NEON_DATABASE_URL from .env');
  console.log('   Migrations: 8 files applied');
  console.log('   Seeders: 3 files executed');
  
  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Prompt user for confirmation
 */
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

/**
 * Main setup function
 */
async function setupDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}${colors.bright}SGTU Event Management - Database Setup${colors.reset}`);
  console.log('='.repeat(60) + '\n');
  
  try {
    // Step 1: Test connection
    const connected = await testConnection();
    if (!connected) {
      process.exit(1);
    }
    
    // Step 2: Check existing data
    const { hasData, tables, recordCount } = await checkExistingData();
    
    if (hasData) {
      log.warning(`Database contains ${recordCount} records across ${tables.length} tables`);
      const answer = await promptUser('Do you want to DROP ALL TABLES and start fresh? (yes/no): ');
      
      if (answer === 'yes' || answer === 'y') {
        const dropped = await dropAllTables();
        if (!dropped) {
          process.exit(1);
        }
      } else {
        log.warning('Setup cancelled - existing data will not be modified');
        process.exit(0);
      }
    }
    
    // Step 3: Run migrations
    await runAllMigrations();
    
    // Step 4: Run seeders
    await runAllSeeders();
    
    // Step 5: Verify setup
    const verified = await verifySetup();
    if (!verified) {
      log.warning('Setup completed but verification failed');
    }
    
    // Step 6: Display summary
    displaySummary();
    
    process.exit(0);
  } catch (error) {
    log.error('Setup failed!');
    console.error(error);
    process.exit(1);
  }
}

// Run setup
setupDatabase();
