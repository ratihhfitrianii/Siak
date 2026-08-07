-- V20260806_017__grades_remedial_per_component.down.sql
-- Rollback T3.6: Nilai Detail - remedial per komponen

DROP INDEX IF EXISTS idx_grades_remedial;

ALTER TABLE grades
  DROP COLUMN IF EXISTS remedial_tugas_score,
  DROP COLUMN IF EXISTS remedial_uts_score,
  DROP COLUMN IF EXISTS remedial_uas_score;

-- Note: remedial_score and is_remedial are NOT restored automatically
-- to avoid data loss. If needed, restore from backup.