-- Migration: Add event_id and password_reset_required to volunteers table
-- Makes volunteers event-specific and enables password reset workflow

BEGIN;

-- Add event_id to volunteers (volunteers belong to specific events)
ALTER TABLE volunteers 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

-- Add password_reset_required for first-time login verification
ALTER TABLE volunteers
ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT TRUE;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_volunteers_event ON volunteers(event_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_password_reset ON volunteers(password_reset_required);

COMMIT;

-- Rollback instructions:
-- ALTER TABLE volunteers DROP COLUMN IF EXISTS event_id;
-- ALTER TABLE volunteers DROP COLUMN IF EXISTS password_reset_required;
