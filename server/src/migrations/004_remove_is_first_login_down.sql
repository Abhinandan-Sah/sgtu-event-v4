-- Rollback: Add back is_first_login column
-- Date: 2025-11-23

-- Add back the is_first_login column
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT true;

-- Sync with password_reset_required for existing records
UPDATE students 
SET is_first_login = password_reset_required 
WHERE is_first_login IS NULL;

-- Remove comment
COMMENT ON COLUMN students.password_reset_required IS NULL;
