-- Migration Down: Drop all tables
-- Use this to rollback the migration

DROP TRIGGER IF EXISTS update_stalls_updated_at ON stalls;
DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
DROP TRIGGER IF EXISTS update_volunteers_updated_at ON volunteers;
DROP TRIGGER IF EXISTS update_students_updated_at ON students;
DROP TRIGGER IF EXISTS update_schools_updated_at ON schools;

DROP FUNCTION IF EXISTS update_updated_at_column();

DROP TABLE IF EXISTS rankings CASCADE;
DROP TABLE IF EXISTS feedbacks CASCADE;
DROP TABLE IF EXISTS check_in_outs CASCADE;
DROP TABLE IF EXISTS stalls CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS volunteers CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS schools CASCADE;
