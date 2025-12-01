-- Rollback migration: Remove student authentication fields
-- WARNING: This will delete data in new columns (date_of_birth, pincode, address, etc.)

BEGIN;

-- Drop constraints
ALTER TABLE students DROP CONSTRAINT IF EXISTS chk_batch_year;
ALTER TABLE students DROP CONSTRAINT IF EXISTS chk_pincode_format;

-- Drop indexes
DROP INDEX IF EXISTS idx_students_batch;
DROP INDEX IF EXISTS idx_students_program;
DROP INDEX IF EXISTS idx_students_pincode;
DROP INDEX IF EXISTS idx_students_dob;

-- Make email NOT NULL again (ensure no NULL emails before running this)
-- ALTER TABLE students ALTER COLUMN email SET NOT NULL;

-- Drop columns
ALTER TABLE students
  DROP COLUMN IF EXISTS date_of_birth,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS pincode,
  DROP COLUMN IF EXISTS program_name,
  DROP COLUMN IF EXISTS batch,
  DROP COLUMN IF EXISTS is_first_login,
  DROP COLUMN IF EXISTS password_reset_required;

COMMIT;
