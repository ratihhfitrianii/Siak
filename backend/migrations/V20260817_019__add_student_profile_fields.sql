-- Add profile fields to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE students ADD COLUMN IF NOT EXISTS personal_email VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;
