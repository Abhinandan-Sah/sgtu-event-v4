-- Migration 013: Add Bulk Registration Tables
-- Creates tables for tracking bulk student event registrations
-- Supports admin approval workflow for large uploads (>200 students)

-- ============================================================
-- TABLE 1: Bulk Registration Logs (Complete history)
-- ============================================================
CREATE TABLE IF NOT EXISTS bulk_registration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL,
  uploaded_by_role VARCHAR(50) NOT NULL CHECK (uploaded_by_role IN ('ADMIN', 'EVENT_MANAGER')),
  
  -- Upload statistics
  total_students_attempted INTEGER NOT NULL,
  successful_registrations INTEGER DEFAULT 0,
  failed_registrations INTEGER DEFAULT 0,
  duplicate_registrations INTEGER DEFAULT 0,
  
  -- File information
  file_name VARCHAR(255),
  file_path TEXT,
  status VARCHAR(50) DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'FAILED', 'PARTIAL', 'PENDING_APPROVAL')),
  
  -- Security & audit flags
  capacity_overridden BOOLEAN DEFAULT FALSE,
  attention_required BOOLEAN DEFAULT FALSE,
  
  -- Error details (structured JSON)
  error_details JSONB,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: Bulk Registration Requests (Pending approvals >200)
-- ============================================================
CREATE TABLE IF NOT EXISTS bulk_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  bulk_log_id UUID REFERENCES bulk_registration_logs(id) ON DELETE CASCADE,
  
  -- Requester information
  requested_by_user_id UUID NOT NULL,
  requested_by_role VARCHAR(50) NOT NULL CHECK (requested_by_role IN ('EVENT_MANAGER')),
  
  -- Request details
  total_count INTEGER NOT NULL,
  student_data JSONB NOT NULL, -- Array of {registration_no, student_id}
  
  -- Approval workflow
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'PROCESSING')),
  
  approved_by_admin_id UUID REFERENCES admins(id),
  approved_at TIMESTAMP,
  
  rejected_by_admin_id UUID REFERENCES admins(id),
  rejected_at TIMESTAMP,
  rejection_reason_code VARCHAR(50),
  rejection_reason_text TEXT,
  
  -- Processing job
  job_id UUID,
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  
  -- Expiry
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES for Performance
-- ============================================================

-- Bulk registration logs indexes
CREATE INDEX IF NOT EXISTS idx_bulk_logs_event ON bulk_registration_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_bulk_logs_uploader ON bulk_registration_logs(uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_logs_created ON bulk_registration_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_logs_status ON bulk_registration_logs(status) WHERE status = 'PENDING_APPROVAL';
CREATE INDEX IF NOT EXISTS idx_bulk_logs_attention ON bulk_registration_logs(attention_required) WHERE attention_required = TRUE;

-- Bulk registration requests indexes
CREATE INDEX IF NOT EXISTS idx_bulk_requests_event ON bulk_registration_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_bulk_requests_requester ON bulk_registration_requests(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_requests_status ON bulk_registration_requests(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_bulk_requests_expires ON bulk_registration_requests(expires_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_bulk_requests_job ON bulk_registration_requests(job_id) WHERE job_id IS NOT NULL;

-- ============================================================
-- TRIGGER: Auto-expire old pending requests
-- ============================================================
CREATE OR REPLACE FUNCTION expire_old_bulk_requests()
RETURNS void AS $$
BEGIN
  UPDATE bulk_registration_requests
  SET 
    status = 'EXPIRED',
    updated_at = NOW()
  WHERE status = 'PENDING' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job to run expiry check (call this periodically via cron/scheduler)
-- For now, we'll call it on each INSERT/UPDATE
CREATE OR REPLACE FUNCTION trigger_expire_requests()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM expire_old_bulk_requests();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_expire_requests
AFTER INSERT OR UPDATE ON bulk_registration_requests
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_expire_requests();

-- ============================================================
-- TRIGGER: Update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_bulk_registration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bulk_logs_timestamp
BEFORE UPDATE ON bulk_registration_logs
FOR EACH ROW
EXECUTE FUNCTION update_bulk_registration_timestamp();

CREATE TRIGGER update_bulk_requests_timestamp
BEFORE UPDATE ON bulk_registration_requests
FOR EACH ROW
EXECUTE FUNCTION update_bulk_registration_timestamp();

-- ============================================================
-- COMMENTS for Documentation
-- ============================================================
COMMENT ON TABLE bulk_registration_logs IS 'Tracks all bulk student registration uploads (admin & event managers)';
COMMENT ON TABLE bulk_registration_requests IS 'Pending approval requests for uploads >200 students';
COMMENT ON COLUMN bulk_registration_logs.capacity_overridden IS 'Admin used bypass_capacity flag';
COMMENT ON COLUMN bulk_registration_logs.attention_required IS 'Flagged for admin review';
COMMENT ON COLUMN bulk_registration_logs.error_details IS 'JSON array of {row, registration_no, error}';
COMMENT ON COLUMN bulk_registration_requests.student_data IS 'JSON array of {registration_no, student_id}';
COMMENT ON COLUMN bulk_registration_requests.job_id IS 'Background job ID for async processing';

-- ============================================================
-- SEED DATA: None required
-- ============================================================

-- Migration complete
