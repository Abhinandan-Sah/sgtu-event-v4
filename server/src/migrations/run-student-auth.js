import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  try {
    await pool.query(\`n      BEGIN;
      ALTER TABLE students
        ADD COLUMN IF NOT EXISTS date_of_birth DATE,
        ADD COLUMN IF NOT EXISTS address TEXT,
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(6),
        ADD COLUMN IF NOT EXISTS program_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS batch INTEGER,
        ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT TRUE;
      ALTER TABLE students ALTER COLUMN email DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch);
      CREATE INDEX IF NOT EXISTS idx_students_program ON students(program_name);
      ALTER TABLE students ADD CONSTRAINT chk_batch_year CHECK (batch >= 2000 AND batch <= 2030);
      ALTER TABLE students ADD CONSTRAINT chk_pincode_format CHECK (pincode ~ '^[0-9]{6}\$');
      COMMIT;
    \);
    console.log(' Migration successful!');
    const res = await pool.query(\SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'students' AND column_name IN ('email', 'date_of_birth', 'pincode', 'program_name', 'batch', 'is_first_login') ORDER BY ordinal_position\);
    console.table(res.rows);
    pool.end();
  } catch(e) {
    console.error(' Error:', e.message);
    pool.end();
    process.exit(1);
  }
}
migrate();
