-- ============================================================
-- Migration: Add Audit Logs Table
-- Version: 006
-- Description: Creates audit_logs table for tracking critical operations
-- Author: Event Management Team
-- Date: 2025-11-25
-- Status: OPTIONAL - Run when ready to persist audit logs to database
-- ============================================================

-- ============================================================
-- AUDIT_LOGS TABLE
-- Tracks all critical operations for security and compliance
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event type and details
    event_type VARCHAR(50) NOT NULL,
    
    -- User information
    user_id UUID,
    user_role VARCHAR(20) NOT NULL,
    
    -- Resource affected
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    
    -- Additional context
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Request information
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_user_role ON audit_logs(user_role);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_metadata ON audit_logs USING gin(metadata);

-- Comments
COMMENT ON TABLE audit_logs IS 'Audit trail for all critical operations in the system';
COMMENT ON COLUMN audit_logs.event_type IS 'Type of event (EVENT_CREATED, EVENT_APPROVED, etc.)';
COMMENT ON COLUMN audit_logs.user_id IS 'ID of user who performed the action (nullable for system operations)';
COMMENT ON COLUMN audit_logs.user_role IS 'Role of user (ADMIN, EVENT_MANAGER, STUDENT, VOLUNTEER, SYSTEM)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (EVENT, VOLUNTEER, REGISTRATION, etc.)';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context data in JSON format';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address of the request';
COMMENT ON COLUMN audit_logs.user_agent IS 'User agent string from the request';

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================

-- Check if table was created successfully
-- SELECT COUNT(*) FROM audit_logs;

-- Sample query to view recent audit logs
-- SELECT 
--   event_type,
--   user_role,
--   resource_type,
--   created_at,
--   metadata->>'event_name' as event_name
-- FROM audit_logs
-- ORDER BY created_at DESC
-- LIMIT 20;

-- ============================================================
-- ROLLBACK (if needed)
-- ============================================================

-- DROP TABLE IF EXISTS audit_logs;
