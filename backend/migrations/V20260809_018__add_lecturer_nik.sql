-- Add NIK column to lecturers table
ALTER TABLE lecturers ADD COLUMN IF NOT EXISTS nik VARCHAR(50);
