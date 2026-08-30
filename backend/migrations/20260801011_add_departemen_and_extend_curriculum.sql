-- V20260801_011__add_departemen_and_extend_curriculum.sql
-- T1.7: Tambah departemen (child of prodi), extend kurikulum & MK per kurikulum

-- departemen (jurusan di dalam prodi)
CREATE TABLE departemens (
    id              SMALLSERIAL PRIMARY KEY,
    prodi_id        SMALLINT NOT NULL REFERENCES prodis(id),
    code            VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kurikulum: tambah kolom version & effective_date (sudah ada semester_id, prodi_id)
-- Tambah kolom is_active jika belum (sudah ada di curricula? cek V002)
-- V002 curricula sudah: prodi_id, semester_id, course_id, is_mandatory, semester_number
-- Butuh: departemen_id (opsional, untuk kurikulum per jurusan), is_open_for_krs (flag buka/tutup MK)
ALTER TABLE curricula
    ADD COLUMN IF NOT EXISTS departemen_id SMALLINT REFERENCES departemens(id),
    ADD COLUMN IF NOT EXISTS is_open_for_krs BOOLEAN NOT NULL DEFAULT true;

-- courses: relasi ke kurikulum sudah via curricula (many-to-many)
-- Tambah kolom untuk "buka/tutup MK" per kurikulum sudah di curricula.is_open_for_krs
-- Jadi courses tetap global, kurikulum yang tentukan buka/tutup per prodi/semester

-- Seed departemen default per prodi existing (V005 sudah seed prodis)
-- Prodi: TI (Teknik Informatika), SI (Sistem Informasi), MNJ (Manajemen), AKT (Akuntansi), HKM (Hukum), KN (Keperawatan)
-- Tiap prodi minimal 1 departemen default
INSERT INTO departemens (prodi_id, code, name)
SELECT p.id, p.code || '_DEFAULT', p.name || ' (Default)'
FROM prodis p
WHERE NOT EXISTS (SELECT 1 FROM departemens d WHERE d.prodi_id = p.id)
ON CONFLICT (code) DO NOTHING;

-- Index
CREATE INDEX idx_departemens_prodi_id ON departemens(prodi_id);
CREATE INDEX idx_curricula_departemen_id ON curricula(departemen_id) WHERE departemen_id IS NOT NULL;