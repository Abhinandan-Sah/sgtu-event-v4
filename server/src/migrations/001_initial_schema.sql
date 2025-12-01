-- Migration: Create all tables for SGTU Event Management System
-- Database: PostgreSQL (Neon)
-- Generated: 2025-11-16

-- ============================================
-- 1. SCHOOLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name VARCHAR(200) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_name ON schools(school_name);

-- ============================================
-- 2. STUDENTS TABLE (11,000+ records)
-- ============================================
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_no VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  phone VARCHAR(15),
  role VARCHAR(20) DEFAULT 'STUDENT' CHECK (role IN ('STUDENT')),
  
  -- Event tracking fields
  is_inside_event BOOLEAN DEFAULT FALSE,
  total_scan_count INTEGER DEFAULT 0,
  feedback_count INTEGER DEFAULT 0 CHECK (feedback_count >= 0 AND feedback_count <= 200),
  has_completed_ranking BOOLEAN DEFAULT FALSE,
  selected_category VARCHAR(20) CHECK (selected_category IN ('CATEGORY_1', 'CATEGORY_2', 'BOTH')),
  
  -- Timestamps
  last_checkin_at TIMESTAMP,
  last_checkout_at TIMESTAMP,
  total_active_duration_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance (11k+ students)
CREATE INDEX idx_students_registration ON students(registration_no);
CREATE INDEX idx_students_email ON students(email);
CREATE INDEX idx_students_school ON students(school_id);
CREATE INDEX idx_students_inside ON students(is_inside_event);
CREATE INDEX idx_students_feedback_count ON students(feedback_count DESC);
CREATE INDEX idx_students_duration ON students(total_active_duration_minutes DESC);

-- ============================================
-- 3. VOLUNTEERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(15),
  role VARCHAR(20) DEFAULT 'VOLUNTEER' CHECK (role IN ('VOLUNTEER')),
  assigned_location VARCHAR(100), -- e.g., "Main Entrance", "Exit Gate"
  is_active BOOLEAN DEFAULT TRUE,
  total_scans_performed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_volunteers_email ON volunteers(email);
CREATE INDEX idx_volunteers_active ON volunteers(is_active);

-- ============================================
-- 4. ADMINS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'SUPER_ADMIN')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

-- ============================================
-- 5. STALLS TABLE (200+ stalls)
-- ============================================
CREATE TABLE IF NOT EXISTS stalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_number VARCHAR(20) UNIQUE NOT NULL,
  stall_name VARCHAR(200) NOT NULL,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  description TEXT,
  location VARCHAR(100),
  role VARCHAR(20) DEFAULT 'STALL' CHECK (role IN ('STALL')),
  
  -- Static QR Code for stall
  qr_code_token TEXT UNIQUE NOT NULL,
  
  -- Cached counters (updated via triggers/background jobs)
  total_feedback_count INTEGER DEFAULT 0,
  
  -- Ranking votes (Category 2)
  rank_1_votes INTEGER DEFAULT 0,
  rank_2_votes INTEGER DEFAULT 0,
  rank_3_votes INTEGER DEFAULT 0,
  weighted_score DECIMAL(10, 2) DEFAULT 0.00,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for leaderboards
CREATE INDEX idx_stalls_number ON stalls(stall_number);
CREATE INDEX idx_stalls_school ON stalls(school_id);
CREATE INDEX idx_stalls_qr ON stalls(qr_code_token);
CREATE INDEX idx_stalls_feedback_count ON stalls(total_feedback_count DESC);
CREATE INDEX idx_stalls_weighted_score ON stalls(weighted_score DESC);

-- ============================================
-- 6. CHECK_IN_OUTS TABLE (Entry/Exit tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS check_in_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE SET NULL,
  scan_type VARCHAR(10) NOT NULL CHECK (scan_type IN ('CHECKIN', 'CHECKOUT')),
  scan_number INTEGER NOT NULL, -- 1, 2, 3, 4... (odd=checkin, even=checkout)
  scanned_at TIMESTAMP DEFAULT NOW(),
  duration_minutes INTEGER, -- Calculated on checkout
  
  CONSTRAINT unique_student_scan UNIQUE (student_id, scan_number)
);

-- Indexes for analytics
CREATE INDEX idx_checkinout_student ON check_in_outs(student_id, scanned_at DESC);
CREATE INDEX idx_checkinout_volunteer ON check_in_outs(volunteer_id);
CREATE INDEX idx_checkinout_type ON check_in_outs(scan_type);
CREATE INDEX idx_checkinout_time ON check_in_outs(scanned_at DESC);

-- ============================================
-- 7. FEEDBACKS TABLE (Category 1 - Max 200/student)
-- ============================================
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate feedback
  CONSTRAINT unique_student_stall_feedback UNIQUE (student_id, stall_id)
);

-- Indexes for queries
CREATE INDEX idx_feedbacks_student ON feedbacks(student_id);
CREATE INDEX idx_feedbacks_stall ON feedbacks(stall_id);
CREATE INDEX idx_feedbacks_time ON feedbacks(submitted_at DESC);

-- ============================================
-- 8. RANKINGS TABLE (Category 2 - One-time top 3)
-- ============================================
CREATE TABLE IF NOT EXISTS rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 3),
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure student can only rank each position once
  CONSTRAINT unique_student_rank UNIQUE (student_id, rank)
);

-- Indexes for leaderboards
CREATE INDEX idx_rankings_student ON rankings(student_id);
CREATE INDEX idx_rankings_stall_rank ON rankings(stall_id, rank);

-- ============================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- ============================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_volunteers_updated_at BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stalls_updated_at BEFORE UPDATE ON stalls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Default Schools
-- ============================================
INSERT INTO schools (school_name, description)
VALUES 
  ('School of Computer Science and Engineering', 'Computer Science, AI, Cybersecurity programs. Located in Block A'),
  ('School of Mechanical Engineering', 'Mechanical and Automotive Engineering programs. Located in Block B'),
  ('School of Civil Engineering', 'Civil and Construction Engineering programs. Located in Block C'),
  ('School of Electrical Engineering', 'Electrical and Electronics Engineering programs. Located in Block D')
ON CONFLICT (school_name) DO NOTHING;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify tables created successfully:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT COUNT(*) FROM schools;
