-- Ensure NIK column exists and enforce UNIQUE for ON CONFLICT (nik) upsert.
-- Fix rbac.test.ts: 'no unique or exclusion constraint matching the ON CONFLICT specification'
ALTER TABLE lecturers ADD COLUMN IF NOT EXISTS nik VARCHAR(50);
ALTER TABLE lecturers ADD CONSTRAINT IF NOT EXISTS lecturers_nik_key UNIQUE (nik);
