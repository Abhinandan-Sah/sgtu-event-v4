#!/usr/bin/env node
/**
 * Run Multi-Event Support Migration (005)
 * This script applies the 005_add_multi_event_support.sql migration
 * 
 * Usage: node run-multi-event-migration.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { query } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_FILE = '005_add_multi_event_support.sql';
const MIGRATION_NUMBER = 5;
const MIGRATION_NAME = 'add_multi_event_support';

async function runMigration() {
  console.log('========================================');
  console.log('🚀 MULTI-EVENT SUPPORT MIGRATION');
  console.log('========================================\n');

  try {
    // 1. Check if migration already applied
    console.log('📋 Checking migration status...');
    
    const checkResult = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'event_managers'
      ) as table_exists
    `);

    // Neon returns array directly, not { rows: [] }
    if (checkResult && checkResult[0] && checkResult[0].table_exists) {
      console.log('✅ Migration already applied - tables exist.');
      console.log('   Skipping migration to avoid errors.\n');
      console.log('========================================');
      console.log('✅ MIGRATION ALREADY COMPLETED');
      console.log('========================================\n');
      process.exit(0);
    }

    // 2. Read migration file
    console.log(`\n📄 Reading migration file: ${MIGRATION_FILE}`);
    const migrationPath = path.join(__dirname, MIGRATION_FILE);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file loaded successfully');

    // 3. Execute migration
    console.log('\n🔧 Executing migration...');
    console.log('   This will create:');
    console.log('   - event_managers table');
    console.log('   - events table');
    console.log('   - event_volunteers table');
    console.log('   - event_registrations table');
    console.log('   - Triggers for auto-updating counters');
    console.log('   - Foreign key relationships');

    // Neon doesn't support multiple statements in one query
    // Parse SQL carefully to handle multi-line statements
    const statements = [];
    let currentStatement = '';
    let inFunction = false;
    let inDollarQuote = false;
    
    for (const line of migrationSQL.split('\n')) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('--') || trimmedLine.length === 0) {
        continue;
      }
      
      // Track dollar-quote blocks ($$)
      if (trimmedLine.includes('$$')) {
        inDollarQuote = !inDollarQuote;
      }
      
      // Track if we're inside a function/trigger definition
      if (trimmedLine.toUpperCase().includes('CREATE OR REPLACE FUNCTION') || 
          trimmedLine.toUpperCase().includes('CREATE FUNCTION')) {
        inFunction = true;
      }
      
      // End of function - look for $$ LANGUAGE
      if (inFunction && trimmedLine.includes('$$ LANGUAGE')) {
        inFunction = false;
      }
      
      currentStatement += line + '\n';
      
      // End of statement - look for ; but not inside function/dollar quote
      if (trimmedLine.endsWith(';') && !inFunction && !inDollarQuote) {
        const stmt = currentStatement.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        currentStatement = '';
      }
    }

    console.log(`\n   Executing ${statements.length} SQL statements...`);
    
    let completed = 0;
    for (const statement of statements) {
      try {
        await query(statement);
        completed++;
        
        // Show progress for large migrations
        if (completed % 5 === 0 || statements.length < 20) {
          const statementPreview = statement.substring(0, 60).replace(/\n/g, ' ');
          console.log(`   [${completed}/${statements.length}] ${statementPreview}...`);
        }
      } catch (error) {
        // Skip IF EXISTS errors (object already exists)
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log(`   ⚠️  Skipped (already exists): ${statement.substring(0, 40)}...`);
          completed++;
          continue;
        }
        
        console.error(`\n   ❌ Error executing statement ${completed + 1}:`);
        console.error(`   ${statement.substring(0, 100)}...`);
        throw error;
      }
    }
    
    console.log('✅ Migration executed successfully');

    // 4. Verify tables created
    console.log('\n🔍 Verifying tables...');
    const tables = ['event_managers', 'events', 'event_volunteers', 'event_registrations'];
    
    for (const table of tables) {
      const result = await query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = '${table}'
        ) as exists
      `);
      
      // Neon returns array directly
      if (result && result[0] && result[0].exists) {
        console.log(`   ✅ ${table}`);
      } else {
        console.log(`   ❌ ${table} - MISSING!`);
      }
    }

    // 5. Show table counts
    console.log('\n📊 Table Statistics:');
    for (const table of tables) {
      const countResult = await query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ${table}: ${countResult[0].count} rows`);
    }

    console.log('\n========================================');
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('========================================');
    console.log('\n📝 Next Steps:');
    console.log('   1. Install Razorpay package: npm install razorpay');
    console.log('   2. Update .env with Razorpay credentials');
    console.log('   3. Restart your server');
    console.log('   4. Test event manager registration');
    console.log('   5. Test event creation workflow\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error.message);
    console.error('\n📋 Error Details:', error);
    console.error('\n⚠️  Your database may be in an inconsistent state.');
    console.error('   Consider running the rollback migration: 005_add_multi_event_support_down.sql');
    process.exit(1);
  }
}

/**
 * Helper function to ask user questions
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Run migration
runMigration();
