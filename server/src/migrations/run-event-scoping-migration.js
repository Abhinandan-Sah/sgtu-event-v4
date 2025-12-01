import { query } from '../config/db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEventScopingMigration() {
  console.log('🚀 Starting Event Scoping Migration (009)...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '009_add_event_scoping.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    // Execute the migration
    console.log('📝 Executing migration SQL...');
    
    // Split migration into individual statements
    const statements = [];
    let current = '';
    let inDollarQuote = false;

    // Remove single-line comments first
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    for (let i = 0; i < cleanSQL.length; i++) {
      const char = cleanSQL[i];
      const next = cleanSQL[i + 1];

      current += char;

      // Detect $$ boundaries
      if (char === '$' && next === '$') {
        inDollarQuote = !inDollarQuote;
        current += next;
        i++; // Skip next $
      }

      // Split on semicolon only if not inside $$
      if (char === ';' && !inDollarQuote) {
        const stmt = current.trim();
        if (stmt && stmt.length > 10) {
          statements.push(stmt);
        }
        current = '';
      }
    }

    // Add last statement if exists
    if (current.trim().length > 10) {
      statements.push(current.trim());
    }

    console.log(`   📊 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (const statement of statements) {
      try {
        await query(statement);
        
        // Show progress
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
          if (tableName) console.log(`     ✓ Created table: ${tableName}`);
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/)?.[1];
          if (indexName) console.log(`     ✓ Created index: ${indexName}`);
        } else if (statement.includes('CREATE TRIGGER')) {
          const triggerName = statement.match(/CREATE TRIGGER (\w+)/)?.[1];
          if (triggerName) console.log(`     ✓ Created trigger: ${triggerName}`);
        } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
          console.log(`     ✓ Created function: update_student_event_rankings_updated_at()`);
        }
      } catch (error) {
        // Silently skip if already exists (idempotent migrations)
        if (error.code === '42P07' || error.code === '42710') {
          console.log(`     ⏭️  Skipped: already exists`);
        } else {
          throw error;
        }
      }
    }
    
    console.log('\n✅ Migration SQL executed successfully\n');

    // Verify the migration
    console.log('🔍 Verifying migration...');
    
    // Check if student_event_rankings table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'student_event_rankings'
      ) as table_exists
    `);
    
    if (!tableCheck[0].table_exists) {
      throw new Error('❌ student_event_rankings table was not created');
    }
    console.log('✅ student_event_rankings table created');

    // Check indexes
    const indexChecks = [
      'idx_feedbacks_student_event',
      'idx_feedbacks_event',
      'idx_check_in_outs_student_event',
      'idx_check_in_outs_event',
      'idx_rankings_student_event',
      'idx_rankings_event',
      'idx_stalls_event',
      'idx_event_registrations_student_event'
    ];

    for (const indexName of indexChecks) {
      const indexCheck = await query(`
        SELECT EXISTS (
          SELECT FROM pg_indexes 
          WHERE indexname = $1
        ) as index_exists
      `, [indexName]);
      
      if (!indexCheck[0].index_exists) {
        throw new Error(`❌ Index ${indexName} was not created`);
      }
      console.log(`✅ Index ${indexName} created`);
    }

    // Check trigger
    const triggerCheck = await query(`
      SELECT EXISTS (
        SELECT FROM pg_trigger 
        WHERE tgname = 'trigger_update_student_event_rankings_updated_at'
      ) as trigger_exists
    `);
    
    if (!triggerCheck[0].trigger_exists) {
      throw new Error('❌ Trigger was not created');
    }
    console.log('✅ Trigger created');

    // Display table structure
    console.log('\n📊 student_event_rankings table structure:');
    const tableStructure = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'student_event_rankings'
      ORDER BY ordinal_position
    `);
    
    console.table(tableStructure);

    console.log('\n✨ Migration 009 completed successfully!');
    console.log('📋 Summary:');
    console.log('   - Created student_event_rankings table');
    console.log('   - Added 8 composite indexes for performance');
    console.log('   - Created trigger for updated_at timestamp');
    console.log('   - Event-scoped queries are now optimized\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\n🔄 Rolling back migration...');
    
    try {
      const rollbackPath = path.join(__dirname, '009_add_event_scoping_down.sql');
      const rollbackSQL = await fs.readFile(rollbackPath, 'utf8');
      
      // Split rollback into individual statements
      const rollbackStatements = rollbackSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 10 && !s.startsWith('--'));
      
      for (const statement of rollbackStatements) {
        try {
          await query(statement);
        } catch (rollbackError) {
          // Ignore errors during rollback (items might not exist)
          if (rollbackError.code !== '42704' && rollbackError.code !== '42P01') {
            console.error(`⚠️  Rollback warning: ${rollbackError.message}`);
          }
        }
      }
      
      console.log('✅ Rollback completed successfully');
    } catch (rollbackError) {
      console.error('❌ Rollback failed:', rollbackError.message);
      console.error('⚠️  Manual intervention may be required');
    }
    
    process.exit(1);
  }
}

runEventScopingMigration();
