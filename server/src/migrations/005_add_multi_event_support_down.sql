-- ============================================================
-- Rollback Migration: Remove Multi-Event Management System
-- Version: 005 DOWN
-- Description: Removes all multi-event tables and columns
-- ============================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trg_update_event_registration_count ON event_registrations;
DROP TRIGGER IF EXISTS trg_update_volunteer_event_count ON event_volunteers;
DROP TRIGGER IF EXISTS trg_update_event_manager_stats ON events;

-- Drop functions
DROP FUNCTION IF EXISTS update_event_registration_count();
DROP FUNCTION IF EXISTS update_volunteer_event_count();
DROP FUNCTION IF EXISTS update_event_manager_stats();

-- Remove columns from existing tables
ALTER TABLE students
DROP COLUMN IF EXISTS total_events_registered,
DROP COLUMN IF EXISTS total_paid_events,
DROP COLUMN IF EXISTS total_spent_on_events;

ALTER TABLE volunteers
DROP COLUMN IF EXISTS total_events_assigned;

ALTER TABLE rankings
DROP COLUMN IF EXISTS event_id;

ALTER TABLE feedbacks
DROP COLUMN IF EXISTS event_id;

ALTER TABLE check_in_outs
DROP COLUMN IF EXISTS event_id;

ALTER TABLE stalls
DROP COLUMN IF EXISTS event_id;

-- Drop indexes for removed columns
DROP INDEX IF EXISTS idx_stalls_event;
DROP INDEX IF EXISTS idx_check_in_outs_event;
DROP INDEX IF EXISTS idx_feedbacks_event;
DROP INDEX IF EXISTS idx_rankings_event;

-- Drop new tables (in reverse order of creation due to foreign keys)
DROP TABLE IF EXISTS event_permissions;
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS event_volunteers;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS event_managers;

-- ============================================================
-- ROLLBACK COMPLETE
-- ============================================================
