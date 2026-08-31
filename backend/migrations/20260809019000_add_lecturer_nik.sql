-- Add nik column to lecturers table (if not exists)
-- This migration re-adds the nik column that was previously added by 20260809018_add_lecturer_nik
-- but the migration file was removed. This uses a new sequence number to avoid conflict.

ALTER TABLE lecturers
ADD COLUMN IF NOT EXISTS nik VARCHAR(50);