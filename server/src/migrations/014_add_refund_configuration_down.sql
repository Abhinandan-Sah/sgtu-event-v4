-- Migration Rollback: Remove refund configuration fields
-- Rollback for 014_add_refund_configuration.sql

-- Drop indexes
DROP INDEX IF EXISTS idx_events_cancelled_at;

-- Remove columns
ALTER TABLE events DROP COLUMN IF EXISTS cancellation_deadline_hours;
ALTER TABLE events DROP COLUMN IF EXISTS refund_tiers;
ALTER TABLE events DROP COLUMN IF EXISTS cancellation_reason;
ALTER TABLE events DROP COLUMN IF EXISTS cancelled_at;

-- Verify the rollback
DO $$
BEGIN
  -- Check if columns are removed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' 
    AND column_name IN ('cancellation_deadline_hours', 'refund_tiers', 'cancellation_reason', 'cancelled_at')
  ) THEN
    RAISE NOTICE '✅ Rollback 014: Refund configuration fields removed successfully';
  ELSE
    RAISE EXCEPTION '❌ Rollback 014: Failed to remove refund configuration fields';
  END IF;
END $$;
