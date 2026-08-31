-- Ensure NIK column exists and enforce UNIQUE for ON CONFLICT (nik) upsert.
-- Fix rbac.test.ts: 'no unique or exclusion constraint matching the ON CONFLICT specification'
ALTER TABLE lecturers ADD COLUMN IF NOT EXISTS nik VARCHAR(50);

-- Postgres tidak mendukung 'ADD CONSTRAINT IF NOT EXISTS' → pakai DO block.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lecturers_nik_key' AND conrelid = 'lecturers'::regclass
    ) THEN
        ALTER TABLE lecturers ADD CONSTRAINT lecturers_nik_key UNIQUE (nik);
    END IF;
END $$;