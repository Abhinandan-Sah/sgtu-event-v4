-- Migration: Add rankings_published column to events table
-- Purpose: Control visibility of rankings (auto-publish on completion or manual admin control)
-- Author: System
-- Date: 2025-12-07

-- Add rankings_published column
-- NULL = use auto-logic (show if status = 'COMPLETED')
-- TRUE = force show (admin override to publish early)
-- FALSE = force hide (admin override to keep hidden even after completion)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS rankings_published BOOLEAN DEFAULT NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_events_rankings_published 
ON events(rankings_published) 
WHERE rankings_published IS NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN events.rankings_published IS 
'Controls ranking visibility: NULL=auto (show if COMPLETED), TRUE=force show, FALSE=force hide';
