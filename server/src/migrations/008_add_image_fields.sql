-- ============================================================
-- Migration: Add Image Fields to Stalls Table
-- Version: 007
-- Description: Adds image_url field for stall images (Cloudinary)
--              Validates that events.banner_image_url exists (added in 005)
-- Author: Event Management Team
-- Date: 2025-11-26
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ADD IMAGE URL TO STALLS
-- For storing Cloudinary image URLs for stall displays
-- ============================================================

ALTER TABLE stalls 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add index for querying stalls with images
CREATE INDEX IF NOT EXISTS idx_stalls_image_url ON stalls(image_url) WHERE image_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN stalls.image_url IS 'Cloudinary image URL for stall display (optional, can be NULL for stalls without images)';

-- ============================================================
-- 2. VERIFY EVENTS TABLE HAS IMAGE FIELDS
-- banner_image_url and event_images were added in migration 005
-- This is just a verification check
-- ============================================================

-- Check if banner_image_url exists (should already exist from migration 005)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'banner_image_url'
    ) THEN
        RAISE EXCEPTION 'Events table missing banner_image_url column. Please run migration 005 first.';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'event_images'
    ) THEN
        RAISE EXCEPTION 'Events table missing event_images column. Please run migration 005 first.';
    END IF;
    
    RAISE NOTICE 'Events table image fields verified successfully';
END $$;

-- ============================================================
-- 3. ADD CONSTRAINTS (OPTIONAL - Cloudinary URL Format)
-- Uncomment if you want to enforce Cloudinary URL format
-- ============================================================

-- ALTER TABLE stalls 
-- ADD CONSTRAINT chk_stall_image_url_format 
-- CHECK (
--     image_url IS NULL OR 
--     image_url ~ '^https?://res\.cloudinary\.com/.*'
-- );

-- ALTER TABLE events
-- ADD CONSTRAINT chk_event_banner_url_format
-- CHECK (
--     banner_image_url IS NULL OR
--     banner_image_url ~ '^https?://res\.cloudinary\.com/.*'
-- );

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Verify stalls table has image_url column
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'stalls' AND column_name = 'image_url';

-- Verify events table has image columns
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'events' AND column_name IN ('banner_image_url', 'event_images');

-- Count stalls with images
-- SELECT 
--   COUNT(*) as total_stalls,
--   COUNT(image_url) as stalls_with_images,
--   COUNT(*) - COUNT(image_url) as stalls_without_images
-- FROM stalls;

-- ============================================================
-- SAMPLE UPDATE QUERIES (for testing)
-- ============================================================

-- Update a stall with sample Cloudinary URL
-- UPDATE stalls 
-- SET image_url = 'https://res.cloudinary.com/dl4rdt9w0/image/upload/v1234567890/stalls/stall-cs-001.jpg'
-- WHERE stall_number = 'CS-001';

-- Update event with banner image
-- UPDATE events
-- SET banner_image_url = 'https://res.cloudinary.com/dl4rdt9w0/image/upload/v1234567890/events/tech-fest-2025.jpg'
-- WHERE event_code = 'TECH-FEST-2025';
