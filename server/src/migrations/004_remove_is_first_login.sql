-- Migration: Remove redundant is_first_login column
-- Date: 2025-11-23
-- Reason: Consolidating to single password_reset_required flag for cleaner code

-- Drop the redundant is_first_login column
ALTER TABLE students DROP COLUMN IF EXISTS is_first_login;

-- Add comment to document the change
COMMENT ON COLUMN students.password_reset_required IS 'Indicates if user must reset password (used for first-time login and admin-initiated resets)';
