// Database Migration Runner for Neon PostgreSQL
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sql = neon(process.env.NEON_DATABASE_URL);

async function runMigration() {
  try {
    console.log('🚀 Starting database migration...\n');

    // Create migrations tracking table if not exists
    await sql(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get list of migration files (in order)
    const migrationFiles = [
      '001_initial_schema.sql',
      '003_add_student_auth_fields.sql',
      '004_remove_is_first_login.sql'
    ];

    // Check which migrations have already been run
    const executedMigrations = await sql('SELECT migration_name FROM _migrations');
    const executedNames = new Set(executedMigrations.map(m => m.migration_name));

    console.log(`📊 Found ${migrationFiles.length} migration files\n`);

    for (const fileName of migrationFiles) {
      // Skip if already executed
      if (executedNames.has(fileName)) {
        console.log(`⏭️  Skipped: ${fileName} (already executed)`);
        continue;
      }

      console.log(`📄 Running migration: ${fileName}`);

      // Read migration file
      const migrationPath = path.join(__dirname, fileName);
      let migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      // Remove single-line comments
      migrationSQL = migrationSQL
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');

      // Split by semicolons but preserve function bodies ($$...$$)
      const statements = [];
      let current = '';
      let inDollarQuote = false;

      for (let i = 0; i < migrationSQL.length; i++) {
        const char = migrationSQL[i];
        const next = migrationSQL[i + 1];

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

      console.log(`   📊 Found ${statements.length} SQL statements\n`);

      // Execute each statement
      let executed = 0;
      for (const statement of statements) {
        try {
          await sql(statement);
          executed++;
          
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
            console.log(`     ✓ Created function: update_updated_at_column()`);
          } else if (statement.includes('INSERT INTO')) {
            console.log(`     ✓ Inserted seed data`);
          }
        } catch (error) {
          // Silently skip if index/constraint already exists (idempotent migrations)
          if (error.code === '42P07' || error.code === '42710') {
            console.log(`     ⏭️  Skipped: ${error.message.split(':')[0]} (already exists)`);
            executed++;
            continue;
          }
          console.error(`     ✗ Failed statement: ${statement.substring(0, 50)}...`);
          throw error;
        }
      }

      console.log(`   ✅ Executed ${executed} statements`);

      // Mark migration as executed
      await sql('INSERT INTO _migrations (migration_name) VALUES ($1)', [fileName]);
      console.log(`   📝 Marked ${fileName} as executed\n`);
    }

    console.log(`\n✅ All migrations completed successfully!\n`);

    console.log('\n🔍 Verifying tables...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name != '_migrations'
      ORDER BY table_name
    `;

    console.log('\n📊 Created tables:');
    tables.forEach(t => console.log(`   ✓ ${t.table_name}`));

    console.log('\n🎉 Database schema is ready! Run `npm run seed` to populate data.\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
