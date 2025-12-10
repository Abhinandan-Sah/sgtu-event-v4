-- Migration 011: Add school_id to event_managers table
-- This migration adds school_id foreign key to link event managers to their schools
-- Date: 2025-12-06
--
-- Changes:
-- 1. Add school_id column (nullable to preserve existing data)
-- 2. Keep organization column for backward compatibility (will be deprecated)
-- 3. Add foreign key constraint to schools table
-- 4. Add password_reset_required flag for first-time login flow

-- Add school_id column (nullable for existing records)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'event_managers' 
        AND column_name = 'school_id'
    ) THEN
        ALTER TABLE event_managers 
        ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
        RAISE NOTICE 'Column school_id added to event_managers table';
    ELSE
        RAISE NOTICE 'Column school_id already exists in event_managers table';
    END IF;
END $$;

-- Add password_reset_required flag
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'event_managers' 
        AND column_name = 'password_reset_required'
    ) THEN
        ALTER TABLE event_managers 
        ADD COLUMN password_reset_required BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column password_reset_required added to event_managers table';
    ELSE
        RAISE NOTICE 'Column password_reset_required already exists in event_managers table';
    END IF;
END $$;

-- Create index on school_id for better query performance
CREATE INDEX IF NOT EXISTS idx_event_managers_school_id ON event_managers(school_id);

-- Add comments for documentation
COMMENT ON COLUMN event_managers.school_id IS 'Foreign key to schools table - links event manager to their school';
COMMENT ON COLUMN event_managers.organization IS 'DEPRECATED: Use school_id instead. Kept for backward compatibility with existing records.';
COMMENT ON COLUMN event_managers.password_reset_required IS 'TRUE if using auto-generated password, requires reset on first login';

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE '✓ Migration 011 completed successfully';
    RAISE NOTICE '✓ Added school_id column to event_managers table';
    RAISE NOTICE '✓ Added password_reset_required flag';
    RAISE NOTICE '✓ Created index on school_id';
    RAISE NOTICE '✓ organization column kept for backward compatibility';
    RAISE NOTICE '';
    RAISE NOTICE 'NOTES:';
    RAISE NOTICE '- Existing event managers will have school_id = NULL (organization still available)';
    RAISE NOTICE '- New event managers should use school_id instead of organization';
    RAISE NOTICE '- Password pattern changed to: firstname@phonenumber';
    RAISE NOTICE '- Verification uses: phone + school_id';
END $$;
