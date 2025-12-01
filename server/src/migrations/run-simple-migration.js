import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting migration...\n');
    
    await client.query('BEGIN');
    
    // Add new columns
    console.log('  Adding new columns...');
    await client.query(`
      ALTER TABLE students
        ADD COLUMN IF NOT EXISTS date_of_birth DATE,
        ADD COLUMN IF NOT EXISTS address TEXT,
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(6),
        ADD COLUMN IF NOT EXISTS program_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS batch INTEGER,
        ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT TRUE
    `);
    
    // Make email nullable
    console.log('  Making email optional...');
    await client.query('ALTER TABLE students ALTER COLUMN email DROP NOT NULL');
    
    // Add indexes
    console.log('  Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_students_program ON students(program_name)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_students_pincode ON students(pincode)');
    
    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!\n');
    
    // Verify
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'students' 
      AND column_name IN ('email', 'date_of_birth', 'pincode', 'program_name', 'batch', 'is_first_login', 'password_reset_required', 'address')
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Updated columns:');
    console.table(result.rows);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
