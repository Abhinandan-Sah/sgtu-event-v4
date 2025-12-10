-- Migration 011 Rollback: Remove school_id from event_managers table
-- This rollback script removes the changes made in migration 011
-- Date: 2025-12-06

-- Drop index
DROP INDEX IF EXISTS idx_event_managers_school_id;

-- Remove password_reset_required column
ALTER TABLE event_managers DROP COLUMN IF EXISTS password_reset_required;

-- Remove school_id column
ALTER TABLE event_managers DROP COLUMN IF EXISTS school_id;

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE '✓ Migration 011 rollback completed';
    RAISE NOTICE '✓ Removed school_id column from event_managers';
    RAISE NOTICE '✓ Removed password_reset_required column';
    RAISE NOTICE '✓ Dropped index idx_event_managers_school_id';
END $$;
