-- Migration 009: Add Event Scoping Support
-- This migration adds support for event-scoped student operations:
-- 1. Tracking ranking completion per event (instead of global flag)
-- 2. Composite indexes for efficient event-filtered queries
-- 3. Optimizing queries on feedbacks, check_in_outs, and rankings tables

-- Create student_event_rankings table to track per-event ranking completion
CREATE TABLE IF NOT EXISTS student_event_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    has_completed_ranking BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Ensure one ranking record per student per event
    UNIQUE(student_id, event_id)
);

-- Add composite indexes for efficient event-scoped queries on feedbacks table
-- This speeds up: "Get all feedbacks by student for specific event"
CREATE INDEX IF NOT EXISTS idx_feedbacks_student_event 
ON feedbacks(student_id, event_id);

-- Index for counting feedbacks by event
CREATE INDEX IF NOT EXISTS idx_feedbacks_event 
ON feedbacks(event_id);

-- Add composite indexes for efficient event-scoped queries on check_in_outs table
-- This speeds up: "Get check-in history for student in specific event"
CREATE INDEX IF NOT EXISTS idx_check_in_outs_student_event 
ON check_in_outs(student_id, event_id);

-- Index for event-specific check-in queries
CREATE INDEX IF NOT EXISTS idx_check_in_outs_event 
ON check_in_outs(event_id);

-- Add composite indexes for efficient event-scoped queries on rankings table
-- This speeds up: "Get rankings submitted by student for specific event"
CREATE INDEX IF NOT EXISTS idx_rankings_student_event 
ON rankings(student_id, event_id);

-- Index for event-specific ranking queries
CREATE INDEX IF NOT EXISTS idx_rankings_event 
ON rankings(event_id);

-- Add index on stalls.event_id for counting stalls per event
CREATE INDEX IF NOT EXISTS idx_stalls_event 
ON stalls(event_id);

-- Add index on event_registrations for quick lookup
CREATE INDEX IF NOT EXISTS idx_event_registrations_student_event 
ON event_registrations(student_id, event_id);

-- Add trigger to update updated_at timestamp on student_event_rankings
CREATE OR REPLACE FUNCTION update_student_event_rankings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_student_event_rankings_updated_at
BEFORE UPDATE ON student_event_rankings
FOR EACH ROW
EXECUTE FUNCTION update_student_event_rankings_updated_at();

-- Migration verification query
-- Run this to verify migration completed successfully:
-- SELECT EXISTS (
--     SELECT FROM information_schema.tables 
--     WHERE table_schema = 'public' 
--     AND table_name = 'student_event_rankings'
-- ) as table_exists,
-- EXISTS (
--     SELECT FROM pg_indexes 
--     WHERE indexname = 'idx_feedbacks_student_event'
-- ) as feedbacks_index_exists,
-- EXISTS (
--     SELECT FROM pg_indexes 
--     WHERE indexname = 'idx_check_in_outs_student_event'
-- ) as checkins_index_exists,
-- EXISTS (
--     SELECT FROM pg_indexes 
--     WHERE indexname = 'idx_rankings_student_event'
-- ) as rankings_index_exists;
