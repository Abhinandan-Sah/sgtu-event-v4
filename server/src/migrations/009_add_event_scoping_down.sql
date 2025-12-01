-- Migration 009 Down: Remove Event Scoping Support
-- This migration rolls back the event scoping changes

-- Drop trigger and function
DROP TRIGGER IF EXISTS trigger_update_student_event_rankings_updated_at ON student_event_rankings;
DROP FUNCTION IF EXISTS update_student_event_rankings_updated_at() CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_event_registrations_student_event;
DROP INDEX IF EXISTS idx_stalls_event;
DROP INDEX IF EXISTS idx_rankings_event;
DROP INDEX IF EXISTS idx_rankings_student_event;
DROP INDEX IF EXISTS idx_check_in_outs_event;
DROP INDEX IF EXISTS idx_check_in_outs_student_event;
DROP INDEX IF EXISTS idx_feedbacks_event;
DROP INDEX IF EXISTS idx_feedbacks_student_event;

-- Drop table
DROP TABLE IF EXISTS student_event_rankings CASCADE;
