-- Rollback migration: Remove rankings_published column
-- This reverts the changes made in 012_add_rankings_published.sql

-- Drop index
DROP INDEX IF EXISTS idx_events_rankings_published;

-- Remove column
ALTER TABLE events 
DROP COLUMN IF EXISTS rankings_published;
