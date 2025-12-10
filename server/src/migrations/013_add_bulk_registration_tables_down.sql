-- Migration 013: Rollback - Drop Bulk Registration Tables

-- Drop triggers first
DROP TRIGGER IF EXISTS auto_expire_requests ON bulk_registration_requests;
DROP TRIGGER IF EXISTS update_bulk_logs_timestamp ON bulk_registration_logs;
DROP TRIGGER IF EXISTS update_bulk_requests_timestamp ON bulk_registration_requests;

-- Drop functions
DROP FUNCTION IF EXISTS trigger_expire_requests();
DROP FUNCTION IF EXISTS expire_old_bulk_requests();
DROP FUNCTION IF EXISTS update_bulk_registration_timestamp();

-- Drop tables (reverse order due to foreign keys)
DROP TABLE IF EXISTS bulk_registration_requests CASCADE;
DROP TABLE IF EXISTS bulk_registration_logs CASCADE;

-- Rollback complete
