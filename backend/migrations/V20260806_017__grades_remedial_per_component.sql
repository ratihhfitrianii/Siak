// V20260806_017__grades_remedial_per_component.sql
// T3.6: Nilai Detail - remedial per komponen (F-06a, F-10)
// Tambah kolom remedial per komponen: tugas, UTS, UAS
-- Migraso data existing: copy scores from column 'remedial_score' -> remedial_uas_score

BEGIN;

-- Alter tabel untuk menambah kolom
ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS remedial_tugas_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS remedial_uts_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS remedial_uas_score NUMERIC(5,2);

-- Update existing records (jika ada)
UPDATE grades
  SET remedial_uas_score = remedial_score
WHERE remedial_score IS NOT NULL;

-- Membuat index untuk query yang efisien
CREATE INDEX IF NOT EXISTS idx_grades_remedial ON grades (remedial_tugas_score, remedial_uts_score, remedial_uas_score);

COMMIT;

-- Verifikasi: tampilkan kolom-kolom
SELECT id, tugas_score, uts_score, uas_score, remedial_score, remedial_tugas_score, remedial_uts_score, remedial_uas_score
FROM grades
LIMIT 5;