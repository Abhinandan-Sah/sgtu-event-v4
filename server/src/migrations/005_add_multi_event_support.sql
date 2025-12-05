-- ============================================================
-- Migration: Add Multi-Event Management System
-- Version: 005
-- Description: Transforms single-event system to multi-event platform
--              with event managers, paid events, Razorpay integration,
--              and dynamic volunteer assignment
-- Author: Event Management Team
-- Date: 2025-11-24
-- ============================================================

-- ============================================================
-- 1. EVENT MANAGERS TABLE
-- Manages events, assigns volunteers, requires admin approval
-- ============================================================
CREATE TABLE IF NOT EXISTS event_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    organization VARCHAR(200), -- University department or external org
    role VARCHAR(20) DEFAULT 'EVENT_MANAGER' CHECK (role IN ('EVENT_MANAGER')),
    
    -- Admin approval system
    is_approved_by_admin BOOLEAN DEFAULT FALSE,
    approved_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Account status
    is_active BOOLEAN DEFAULT TRUE,
    total_events_created INTEGER DEFAULT 0,
    total_events_completed INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for event_managers
CREATE INDEX idx_event_managers_email ON event_managers(email);
CREATE INDEX idx_event_managers_approved ON event_managers(is_approved_by_admin, is_active);
CREATE INDEX idx_event_managers_created_at ON event_managers(created_at DESC);

-- ============================================================
-- 2. EVENTS TABLE
-- Core events table supporting free and paid events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name VARCHAR(200) NOT NULL,
    event_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., "TECH-FEST-2025"
    description TEXT,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('FREE', 'PAID')),
    
    -- Pricing (for PAID events)
    price DECIMAL(10, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'INR',
    
    -- Event details
    event_category VARCHAR(50), -- Workshop, Seminar, Competition, Exhibition, Conference
    tags TEXT[], -- Array of tags for filtering
    venue VARCHAR(200),
    
    -- Date and time
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    registration_start_date TIMESTAMP NOT NULL,
    registration_end_date TIMESTAMP NOT NULL,
    
    -- Capacity management
    max_capacity INTEGER, -- NULL = unlimited
    current_registrations INTEGER DEFAULT 0,
    waitlist_enabled BOOLEAN DEFAULT FALSE,
    
    -- Event status lifecycle
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT',            -- Being created
        'PENDING_APPROVAL', -- Waiting for admin approval
        'APPROVED',         -- Admin approved, not yet started
        'ACTIVE',           -- Currently running
        'COMPLETED',        -- Finished
        'CANCELLED',        -- Cancelled by admin/manager
        'ARCHIVED'          -- Historical record
    )),
    
    -- Ownership and approval
    created_by_manager_id UUID NOT NULL REFERENCES event_managers(id) ON DELETE RESTRICT,
    approved_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    admin_approved_at TIMESTAMP,
    admin_rejection_reason TEXT,
    
    -- Permissions and visibility
    is_visible BOOLEAN DEFAULT TRUE,
    
    -- Analytics (cached counters)
    total_registrations INTEGER DEFAULT 0,
    total_paid_registrations INTEGER DEFAULT 0,
    total_revenue DECIMAL(12, 2) DEFAULT 0.00,
    total_check_ins INTEGER DEFAULT 0,
    total_feedbacks INTEGER DEFAULT 0,
    
    -- Refund policy
    refund_policy TEXT,
    refund_enabled BOOLEAN DEFAULT FALSE,
    
    -- Banner and media
    banner_image_url TEXT,
    event_images TEXT[], -- Array of image URLs
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for events
CREATE INDEX idx_events_code ON events(event_code);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_category ON events(event_category);
CREATE INDEX idx_events_manager ON events(created_by_manager_id);
CREATE INDEX idx_events_dates ON events(start_date, end_date);
CREATE INDEX idx_events_registration_dates ON events(registration_start_date, registration_end_date);
CREATE INDEX idx_events_visible ON events(is_visible, status);
CREATE INDEX idx_events_created_at ON events(created_at DESC);

-- ============================================================
-- 3. EVENT_VOLUNTEERS JUNCTION TABLE
-- Maps volunteers to events they can scan for
-- ============================================================
CREATE TABLE IF NOT EXISTS event_volunteers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    
    -- Assignment details
    assigned_by_manager_id UUID NOT NULL REFERENCES event_managers(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    
    -- Permissions (for future granular control)
    permissions TEXT[] DEFAULT ARRAY['SCAN', 'VIEW_STUDENTS'], -- ['SCAN', 'VIEW_STUDENTS', 'VERIFY_PAYMENTS']
    
    -- Location assignment
    assigned_location VARCHAR(100), -- e.g., "Main Gate", "Registration Desk"
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Performance tracking
    total_scans_for_event INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(event_id, volunteer_id) -- One volunteer per event (can be assigned multiple times if removed and re-added)
);

-- Indexes for event_volunteers
CREATE INDEX idx_event_volunteers_event ON event_volunteers(event_id);
CREATE INDEX idx_event_volunteers_volunteer ON event_volunteers(volunteer_id);
CREATE INDEX idx_event_volunteers_active ON event_volunteers(is_active);
CREATE INDEX idx_event_volunteers_manager ON event_volunteers(assigned_by_manager_id);

-- ============================================================
-- 4. EVENT_REGISTRATIONS TABLE
-- Tracks student registrations for events (free and paid)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    
    -- Registration type
    registration_type VARCHAR(20) NOT NULL CHECK (registration_type IN ('FREE', 'PAID', 'WAITLIST')),
    
    -- Payment details (for PAID events)
    payment_status VARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN (
        'PENDING',      -- Payment initiated but not completed
        'COMPLETED',    -- Payment successful
        'FAILED',       -- Payment failed
        'REFUNDED',     -- Payment refunded
        'NOT_REQUIRED'  -- For FREE events
    )),
    
    -- Razorpay integration
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    payment_amount DECIMAL(10, 2) DEFAULT 0.00,
    payment_currency VARCHAR(3) DEFAULT 'INR',
    payment_completed_at TIMESTAMP,
    
    -- Refund details
    refund_initiated BOOLEAN DEFAULT FALSE,
    refund_amount DECIMAL(10, 2),
    refund_reason TEXT,
    refunded_at TIMESTAMP,
    
    -- Event participation
    has_checked_in BOOLEAN DEFAULT FALSE,
    check_in_count INTEGER DEFAULT 0,
    last_check_in_at TIMESTAMP,
    total_time_spent_minutes INTEGER DEFAULT 0,
    
    -- Feedback and engagement
    has_submitted_feedback BOOLEAN DEFAULT FALSE,
    feedback_submitted_at TIMESTAMP,
    
    -- QR code for this specific event (event-specific rotating QR)
    event_qr_token TEXT, -- Optional: can be dynamically generated
    
    -- Status
    registration_status VARCHAR(20) DEFAULT 'CONFIRMED' CHECK (registration_status IN (
        'CONFIRMED',    -- Registration confirmed
        'CANCELLED',    -- Cancelled by student
        'WAITLISTED',   -- On waitlist
        'EXPIRED'       -- Registration expired (no-show)
    )),
    
    -- Audit fields
    registered_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(event_id, student_id) -- One registration per student per event
);

-- Indexes for event_registrations
CREATE INDEX idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX idx_event_registrations_student ON event_registrations(student_id);
CREATE INDEX idx_event_registrations_payment_status ON event_registrations(payment_status);
CREATE INDEX idx_event_registrations_registration_status ON event_registrations(registration_status);
CREATE INDEX idx_event_registrations_razorpay_order ON event_registrations(razorpay_order_id);
CREATE INDEX idx_event_registrations_razorpay_payment ON event_registrations(razorpay_payment_id);
CREATE INDEX idx_event_registrations_registered_at ON event_registrations(registered_at DESC);
CREATE INDEX idx_event_registrations_type ON event_registrations(registration_type);

-- ============================================================
-- 5. EVENT_PERMISSIONS TABLE (Optional - for audit trail)
-- Tracks admin approvals/rejections of event creation
-- ============================================================
CREATE TABLE IF NOT EXISTS event_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    manager_id UUID NOT NULL REFERENCES event_managers(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    
    -- Permission type
    permission_type VARCHAR(20) CHECK (permission_type IN ('APPROVED', 'REJECTED', 'REVOKED')),
    
    -- Details
    reason TEXT,
    notes TEXT,
    
    -- Audit
    granted_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(event_id, permission_type, granted_at) -- Allow multiple approvals/rejections over time
);

-- Indexes for event_permissions
CREATE INDEX idx_event_permissions_event ON event_permissions(event_id);
CREATE INDEX idx_event_permissions_manager ON event_permissions(manager_id);
CREATE INDEX idx_event_permissions_admin ON event_permissions(admin_id);
CREATE INDEX idx_event_permissions_type ON event_permissions(permission_type);

-- ============================================================
-- 6. ADD event_id TO EXISTING TABLES
-- Make existing tables event-aware for multi-event support
-- ============================================================

-- Add event_id to stalls (stalls belong to specific events)
ALTER TABLE stalls 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

-- Add index for stall-event relationship
CREATE INDEX IF NOT EXISTS idx_stalls_event ON stalls(event_id);

-- Add event_id to check_in_outs (track which event the check-in is for)
ALTER TABLE check_in_outs 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

-- Add index for check-in-event relationship
CREATE INDEX IF NOT EXISTS idx_check_in_outs_event ON check_in_outs(event_id);

-- Add event_id to feedbacks (feedback for stalls in specific events)
ALTER TABLE feedbacks 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

-- Add index for feedback-event relationship
CREATE INDEX IF NOT EXISTS idx_feedbacks_event ON feedbacks(event_id);

-- Add event_id to rankings (rankings are event-specific)
ALTER TABLE rankings 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

-- Add index for ranking-event relationship
CREATE INDEX IF NOT EXISTS idx_rankings_event ON rankings(event_id);

-- ============================================================
-- 7. ADD PAYMENT TRACKING TO STUDENTS
-- Track payment history and registration counts
-- ============================================================

ALTER TABLE students
ADD COLUMN IF NOT EXISTS total_events_registered INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid_events INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent_on_events DECIMAL(10, 2) DEFAULT 0.00;

-- ============================================================
-- ============================================================
-- 8. ADD EVENT TRACKING TO VOLUNTEERS - DISABLED
-- Note: Column not needed - can query event_volunteers table directly
-- Keeping this commented for reference
-- ============================================================

-- ALTER TABLE volunteers
-- ADD COLUMN IF NOT EXISTS total_events_assigned INTEGER DEFAULT 0;

-- ============================================================
-- 9. HELPER FUNCTIONS AND TRIGGERS
-- ============================================================

-- Function to update event registration count
CREATE OR REPLACE FUNCTION update_event_registration_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment registration count
        UPDATE events 
        SET current_registrations = current_registrations + 1,
            total_registrations = total_registrations + 1,
            updated_at = NOW()
        WHERE id = NEW.event_id;
        
        -- If paid event and payment completed, update revenue
        IF NEW.registration_type = 'PAID' AND NEW.payment_status = 'COMPLETED' THEN
            UPDATE events 
            SET total_paid_registrations = total_paid_registrations + 1,
                total_revenue = total_revenue + NEW.payment_amount,
                updated_at = NOW()
            WHERE id = NEW.event_id;
        END IF;
        
        -- Update student stats
        UPDATE students 
        SET total_events_registered = total_events_registered + 1,
            updated_at = NOW()
        WHERE id = NEW.student_id;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- If payment status changed to COMPLETED
        IF OLD.payment_status != 'COMPLETED' AND NEW.payment_status = 'COMPLETED' THEN
            UPDATE events 
            SET total_paid_registrations = total_paid_registrations + 1,
                total_revenue = total_revenue + NEW.payment_amount,
                updated_at = NOW()
            WHERE id = NEW.event_id;
            
            UPDATE students 
            SET total_paid_events = total_paid_events + 1,
                total_spent_on_events = total_spent_on_events + NEW.payment_amount,
                updated_at = NOW()
            WHERE id = NEW.student_id;
        END IF;
        
        -- If refund processed
        IF OLD.payment_status != 'REFUNDED' AND NEW.payment_status = 'REFUNDED' THEN
            UPDATE events 
            SET total_revenue = total_revenue - NEW.refund_amount,
                updated_at = NOW()
            WHERE id = NEW.event_id;
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement registration count
        UPDATE events 
        SET current_registrations = current_registrations - 1,
            updated_at = NOW()
        WHERE id = OLD.event_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for event_registrations
DROP TRIGGER IF EXISTS trg_update_event_registration_count ON event_registrations;
CREATE TRIGGER trg_update_event_registration_count
AFTER INSERT OR UPDATE OR DELETE ON event_registrations
FOR EACH ROW
EXECUTE FUNCTION update_event_registration_count();

-- ============================================================
-- VOLUNTEER EVENT COUNT TRIGGER - DISABLED
-- Note: Removed because total_events_assigned column not needed
-- Can query event_volunteers table directly for count
-- ============================================================

-- Function to update event manager stats
CREATE OR REPLACE FUNCTION update_event_manager_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE event_managers 
        SET total_events_created = total_events_created + 1,
            updated_at = NOW()
        WHERE id = NEW.created_by_manager_id;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If event completed
        IF OLD.status != 'COMPLETED' AND NEW.status = 'COMPLETED' THEN
            UPDATE event_managers 
            SET total_events_completed = total_events_completed + 1,
                updated_at = NOW()
            WHERE id = NEW.created_by_manager_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for events
DROP TRIGGER IF EXISTS trg_update_event_manager_stats ON events;
CREATE TRIGGER trg_update_event_manager_stats
AFTER INSERT OR UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION update_event_manager_stats();

-- ============================================================
-- 10. SEED DATA COMMENTS
-- ============================================================

COMMENT ON TABLE event_managers IS 'Event managers who create and manage events, require admin approval';
COMMENT ON TABLE events IS 'Core events table supporting free and paid events with Razorpay integration';
COMMENT ON TABLE event_volunteers IS 'Junction table mapping volunteers to events they can scan for';
COMMENT ON TABLE event_registrations IS 'Student registrations for events with payment tracking';
COMMENT ON TABLE event_permissions IS 'Audit trail for admin approvals/rejections of events';

-- ============================================================
-- FINAL VERIFICATION: Ensure all required columns exist
-- ============================================================

-- Ensure check_in_outs has event_id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'check_in_outs' AND column_name = 'event_id'
    ) THEN
        ALTER TABLE check_in_outs 
        ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
        
        CREATE INDEX IF NOT EXISTS idx_check_in_outs_event ON check_in_outs(event_id);
    END IF;
END $$;

-- Ensure students has tracking columns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'students' AND column_name = 'total_events_registered'
    ) THEN
        ALTER TABLE students
        ADD COLUMN total_events_registered INTEGER DEFAULT 0,
        ADD COLUMN total_paid_events INTEGER DEFAULT 0,
        ADD COLUMN total_spent_on_events DECIMAL(10, 2) DEFAULT 0.00;
    END IF;
END $$;

-- Ensure stalls has event_id column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stalls' AND column_name = 'event_id'
    ) THEN
        ALTER TABLE stalls 
        ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
        
        CREATE INDEX IF NOT EXISTS idx_stalls_event ON stalls(event_id);
    END IF;
END $$;

-- Ensure feedbacks has event_id column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'feedbacks' AND column_name = 'event_id'
    ) THEN
        ALTER TABLE feedbacks 
        ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
        
        CREATE INDEX IF NOT EXISTS idx_feedbacks_event ON feedbacks(event_id);
    END IF;
END $$;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================

-- Verification queries (commented out, use for testing)
-- SELECT COUNT(*) FROM event_managers;
-- SELECT COUNT(*) FROM events;
-- SELECT COUNT(*) FROM event_volunteers;
-- SELECT COUNT(*) FROM event_registrations;
-- SELECT COUNT(*) FROM event_permissions;
