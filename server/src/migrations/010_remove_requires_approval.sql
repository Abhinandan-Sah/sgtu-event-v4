-- Migration 010: Remove requires_approval field from events table
-- This field created a security vulnerability where event managers could bypass admin approval
-- Date: 2025-12-02
--
-- ⚠️ NOTE: This migration is ONLY needed for existing databases
-- Fresh database setups using migration 005 (updated) do NOT need this migration
-- Migration 005 was already fixed to not include the requires_approval column

-- Check if column exists before attempting to drop
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'events' 
        AND column_name = 'requires_approval'
    ) THEN
        -- Drop the requires_approval column
        ALTER TABLE events DROP COLUMN requires_approval;
        RAISE NOTICE 'Column requires_approval dropped from events table';
    ELSE
        RAISE NOTICE 'Column requires_approval does not exist in events table';
    END IF;
END $$;

-- Ensure all events created by managers start with DRAFT status
-- Update any incorrectly created events
UPDATE events 
SET status = 'DRAFT' 
WHERE status = 'APPROVED' 
  AND created_by_manager_id IS NOT NULL 
  AND approved_by_admin_id IS NULL;

-- Add comment to document the change
COMMENT ON COLUMN events.status IS 'Event lifecycle: DRAFT (created) → PENDING_APPROVAL (submitted) → APPROVED/REJECTED (admin decision) → ACTIVE (live) → COMPLETED/CANCELLED';

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE '✓ Migration 010 completed successfully';
    RAISE NOTICE '✓ Security fix: requires_approval field removed';
    RAISE NOTICE '✓ All manager events must go through approval workflow';
END $$;
