import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function makeMandatory() {
  const client = await pool.connect();
  
  try {
    console.log('🔒 Making DOB and Pincode MANDATORY...\n');
    
    await client.query('BEGIN');
    
    // Step 1: Update any NULL values to temporary defaults (for existing records)
    console.log('  Checking for NULL values...');
    const nullCheck = await client.query(`
      SELECT COUNT(*) as count 
      FROM students 
      WHERE date_of_birth IS NULL OR pincode IS NULL
    `);
    
    if (parseInt(nullCheck.rows[0].count) > 0) {
      console.log(`  Found ${nullCheck.rows[0].count} records with NULL values`);
      console.log('  Setting temporary defaults...');
      
      await client.query(`
        UPDATE students 
        SET date_of_birth = '2000-01-01' 
        WHERE date_of_birth IS NULL
      `);
      
      await client.query(`
        UPDATE students 
        SET pincode = '000000' 
        WHERE pincode IS NULL
      `);
      
      console.log('  ✓ Temporary defaults set\n');
    } else {
      console.log('  ✓ No NULL values found\n');
    }
    
    // Step 2: Make columns NOT NULL
    console.log('  Making date_of_birth NOT NULL...');
    await client.query(`
      ALTER TABLE students 
      ALTER COLUMN date_of_birth SET NOT NULL
    `);
    
    console.log('  Making pincode NOT NULL...');
    await client.query(`
      ALTER TABLE students 
      ALTER COLUMN pincode SET NOT NULL
    `);
    
    // Step 3: Add validation constraints
    console.log('  Adding DOB validation (must be 15-80 years old)...');
    await client.query(`
      ALTER TABLE students 
      DROP CONSTRAINT IF EXISTS chk_dob_realistic
    `);
    await client.query(`
      ALTER TABLE students 
      ADD CONSTRAINT chk_dob_realistic 
      CHECK (
        date_of_birth >= '1945-01-01' 
        AND date_of_birth <= CURRENT_DATE - INTERVAL '15 years'
      )
    `);
    
    console.log('  Adding pincode format validation (6 digits)...');
    await client.query(`
      ALTER TABLE students 
      DROP CONSTRAINT IF EXISTS chk_pincode_format
    `);
    await client.query(`
      ALTER TABLE students 
      ADD CONSTRAINT chk_pincode_format 
      CHECK (pincode ~ '^[0-9]{6}$')
    `);
    
    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!\n');
    
    // Verify the changes
    const result = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'students' 
      AND column_name IN ('date_of_birth', 'pincode')
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Updated schema:');
    console.table(result.rows);
    
    // Check constraints
    const constraints = await client.query(`
      SELECT 
        conname as constraint_name, 
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname IN ('chk_dob_realistic', 'chk_pincode_format')
    `);
    
    console.log('\n🔒 Active constraints:');
    console.table(constraints.rows);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

makeMandatory();
