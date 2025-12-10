import { query } from '../config/db.js';

/**
 * Run the 012_add_rankings_published migration
 */
const runMigration = async () => {
  try {
    console.log('🚀 Running migration: 012_add_rankings_published...\n');

    // Execute each statement separately (Neon doesn't support multiple statements)
    
    // 1. Add rankings_published column
    console.log('📝 Adding rankings_published column...');
    await query(`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS rankings_published BOOLEAN DEFAULT NULL
    `);
    console.log('   ✅ Column added\n');

    // 2. Create index
    console.log('📝 Creating index...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_events_rankings_published 
      ON events(rankings_published) 
      WHERE rankings_published IS NOT NULL
    `);
    console.log('   ✅ Index created\n');

    console.log('✅ Migration completed successfully!\n');
    console.log('📊 Changes applied:');
    console.log('   - Added rankings_published column to events table');
    console.log('   - Created index on rankings_published');
    console.log('   - Default value: NULL (auto-mode)\n');

    // Verify migration
    const verifyQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'rankings_published'
    `;
    const result = await query(verifyQuery);

    if (result.length > 0) {
      console.log('✅ Verification successful:');
      console.log('   Column:', result[0].column_name);
      console.log('   Type:', result[0].data_type);
      console.log('   Nullable:', result[0].is_nullable);
      console.log('   Default:', result[0].column_default || 'NULL');
      console.log('\n🎉 Your existing data is safe and intact!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
};

runMigration();
