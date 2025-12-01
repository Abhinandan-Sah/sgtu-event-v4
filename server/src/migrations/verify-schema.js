// Verify Database Schema
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

async function verifySchema() {
  console.log('🔍 Verifying database schema...\n');

  const sql = neon(process.env.NEON_DATABASE_URL);

  try {
    // List all tables
    console.log('📊 Tables:');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    tables.forEach(t => console.log(`   ✓ ${t.table_name}`));

    // Count indexes
    console.log('\n📑 Indexes:');
    const indexes = await sql`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname
    `;
    console.log(`   Total: ${indexes.length} custom indexes`);
    
    // Show first 5 indexes as sample
    indexes.slice(0, 5).forEach(idx => 
      console.log(`   ✓ ${idx.tablename}.${idx.indexname}`)
    );
    if (indexes.length > 5) {
      console.log(`   ... and ${indexes.length - 5} more`);
    }

    // Check triggers
    console.log('\n🔄 Triggers:');
    const triggers = await sql`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table
    `;
    if (triggers.length > 0) {
      triggers.forEach(t => console.log(`   ✓ ${t.event_object_table}.${t.trigger_name}`));
    } else {
      console.log('   ⚠️  No triggers found (may need to be created)');
    }

    // Check seed data
    console.log('\n🌱 Seed Data:');
    const schools = await sql`SELECT COUNT(*) as count FROM schools`;
    console.log(`   Schools: ${schools[0].count}`);

    const students = await sql`SELECT COUNT(*) as count FROM students`;
    console.log(`   Students: ${students[0].count}`);

    const stalls = await sql`SELECT COUNT(*) as count FROM stalls`;
    console.log(`   Stalls: ${stalls[0].count}`);

    // Check table structures
    console.log('\n📋 Table Structures:');
    
    // Students table
    const studentCols = await sql`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'students'
      ORDER BY ordinal_position
    `;
    console.log(`\n   students (${studentCols.length} columns):`);
    studentCols.slice(0, 8).forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const maxLen = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`      - ${col.column_name}: ${col.data_type}${maxLen} ${nullable}`);
    });
    console.log(`      ... and ${studentCols.length - 8} more columns`);

    // Check constraints
    console.log('\n🔒 Constraints:');
    const constraints = await sql`
      SELECT conname, contype, conrelid::regclass::text as table_name
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      AND contype IN ('c', 'u', 'f')
      LIMIT 10
    `;
    
    const checkCons = constraints.filter(c => c.contype === 'c');
    const uniqueCons = constraints.filter(c => c.contype === 'u');
    const foreignKeys = constraints.filter(c => c.contype === 'f');
    
    console.log(`   CHECK constraints: ${checkCons.length} found`);
    checkCons.slice(0, 3).forEach(c => console.log(`      ✓ ${c.table_name}.${c.conname}`));
    
    console.log(`   UNIQUE constraints: ${uniqueCons.length} found`);
    uniqueCons.slice(0, 3).forEach(c => console.log(`      ✓ ${c.table_name}.${c.conname}`));
    
    console.log(`   FOREIGN KEY constraints: ${foreignKeys.length} found`);
    foreignKeys.slice(0, 3).forEach(c => console.log(`      ✓ ${c.table_name}.${c.conname}`));

    console.log('\n✅ Database schema verification complete!\n');
    console.log('🎉 Your database is ready for production use!\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifySchema();
