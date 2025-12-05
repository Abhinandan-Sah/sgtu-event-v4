-- Rollback Migration 010: Add back requires_approval field (if needed)
-- This is the rollback script in case you need to revert the changes

-- Add back the requires_approval column
ALTER TABLE events ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE;

-- Add comment
COMMENT ON COLUMN events.requires_approval IS 'Indicates if event requires admin approval (kept for backward compatibility)';

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE '✓ Rollback 010 completed';
    RAISE NOTICE '✓ requires_approval column restored';
END $$;
