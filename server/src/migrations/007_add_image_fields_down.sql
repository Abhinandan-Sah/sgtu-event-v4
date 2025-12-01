-- ============================================================
-- Migration Rollback: Remove Image Fields from Stalls
-- Version: 007 DOWN
-- Description: Rolls back migration 007 changes
-- ============================================================

BEGIN;

-- Drop index
DROP INDEX IF EXISTS idx_stalls_image_url;

-- Drop constraints if they were added
ALTER TABLE stalls DROP CONSTRAINT IF EXISTS chk_stall_image_url_format;
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_event_banner_url_format;

-- Remove image_url column from stalls
ALTER TABLE stalls DROP COLUMN IF EXISTS image_url;

COMMIT;

-- Verification
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'stalls';
