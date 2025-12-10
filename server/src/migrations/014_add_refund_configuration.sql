-- Migration: Add refund configuration fields
-- Adds cancellation_deadline_hours and refund_tiers to events table

-- Add cancellation deadline field (hours before event start)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS cancellation_deadline_hours INTEGER DEFAULT 24;

-- Add refund tiers configuration (JSONB array)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS refund_tiers JSONB DEFAULT NULL;

-- Add cancellation reason field
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT DEFAULT NULL;

-- Add cancelled_at timestamp
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN events.cancellation_deadline_hours IS 'Minimum hours before event start to allow cancellation';
COMMENT ON COLUMN events.refund_tiers IS 'Array of refund tiers: [{days_before: 7, percent: 100}, {days_before: 3, percent: 50}]';
COMMENT ON COLUMN events.cancellation_reason IS 'Reason for event cancellation (if status is CANCELLED)';
COMMENT ON COLUMN events.cancelled_at IS 'Timestamp when event was cancelled';

-- Update existing events with default values
UPDATE events 
SET cancellation_deadline_hours = 24 
WHERE cancellation_deadline_hours IS NULL;

-- Example of setting default refund tiers for paid events
-- Uncomment if you want to set default tiers for existing events
-- UPDATE events 
-- SET refund_tiers = '[
--   {"days_before": 7, "percent": 100},
--   {"days_before": 3, "percent": 50},
--   {"days_before": 0, "percent": 0}
-- ]'::jsonb
-- WHERE event_type = 'PAID' AND refund_enabled = true AND refund_tiers IS NULL;

-- Create index for better query performance on cancelled events
CREATE INDEX IF NOT EXISTS idx_events_cancelled_at ON events(cancelled_at) WHERE cancelled_at IS NOT NULL;

-- Verify the migration
DO $$
BEGIN
  -- Check if columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' 
    AND column_name IN ('cancellation_deadline_hours', 'refund_tiers', 'cancellation_reason', 'cancelled_at')
  ) THEN
    RAISE NOTICE '✅ Migration 014: Refund configuration fields added successfully';
  ELSE
    RAISE EXCEPTION '❌ Migration 014: Failed to add refund configuration fields';
  END IF;
END $$;
