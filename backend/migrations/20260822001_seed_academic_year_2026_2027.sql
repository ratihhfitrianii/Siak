-- V20260822_001__seed_academic_year_2026_2027.sql
-- Tahun akademik & semester berjalan (Agustus 2026 → Ganjil 2026/2027).
-- Keluhan: dropdown semester Pilih MK dosen hanya menampilkan "Ganjil 2024/2025"
-- karena seed awal berhenti di 2025/2026 dan tidak ada baris is_active terbaru.
--
-- Idempotent: ON CONFLICT DO NOTHING + update kondisional.
-- Setelah migrasi:
--   - academic_years aktif : 2026/2027
--   - semesters aktif      : Ganjil 2026/2026 saja
--   - krs_periods aktif    : KRS Utama Ganjil 2026/2027

-- 1) Tahun akademik 2026/2027
INSERT INTO academic_years (code, start_date, end_date, is_active)
VALUES ('2026/2027', '2026-08-01', '2027-07-31', true)
ON CONFLICT (code) DO NOTHING;

-- 2) Nonaktifkan tahun akademik lama (kecuali yang baru dibuat)
UPDATE academic_years
SET is_active = false
WHERE code <> '2026/2027'
  AND is_active;

-- 3) Semester Ganjil & Genap 2026/2027 (Ganjil = aktif)
INSERT INTO semesters (academic_year_id, code, name, start_date, end_date, krs_start_date, krs_end_date, is_active)
VALUES
    ((SELECT id FROM academic_years WHERE code='2026/2027'), '2026/2027-1', 'Ganjil 2026/2027', '2026-08-01', '2027-01-31', '2026-07-15', '2026-08-15', true),
    ((SELECT id FROM academic_years WHERE code='2026/2027'), '2026/2027-2', 'Genap 2026/2027', '2027-02-01', '2027-07-31', '2027-01-15', '2027-02-15', false)
ON CONFLICT (academic_year_id, code) DO NOTHING;

-- 4) Pastikan HANYA Ganjil 2026/2027 yang aktif
UPDATE semesters
SET is_active = false
WHERE code NOT IN ('2026/2027-1')
  AND is_active;

-- 5) Periode KRS utama utk Ganjil 2026/2027 (aktif sekarang s/d 15 Agu 2026)
INSERT INTO krs_periods (semester_id, name, start_date, end_date, is_revision, is_active)
VALUES
    ((SELECT id FROM semesters WHERE code='2026/2027-1'), 'KRS Utama Ganjil 2026/2027', '2026-07-15 00:00:00+07', '2026-08-15 23:59:59+07', false, true),
    ((SELECT id FROM semesters WHERE code='2026/2027-1'), 'KRS Revisi Ganjil 2026/2027', '2026-08-16 00:00:00+07', '2026-09-15 23:59:59+07', true, false)
ON CONFLICT (semester_id, name) DO NOTHING;
