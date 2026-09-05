-- Fitur Persetujuan Jadwal Kaprodi (2026-09-05)
-- 1) users: atribut kaprodi/wakil kaprodi pada dosen (pattern is_wali)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_kaprodi         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_wakil_kaprodi   BOOLEAN NOT NULL DEFAULT false;

-- 2) Pengajuan jadwal dosen per semester → disetujui/ditolak kaprodi
CREATE TABLE IF NOT EXISTS schedule_submissions (
    id            BIGSERIAL PRIMARY KEY,
    lecturer_id   BIGINT NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
    semester_id   SMALLINT NOT NULL REFERENCES semesters(id),
    status        VARCHAR(20) NOT NULL DEFAULT 'awaiting', -- awaiting | approved | rejected
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by   BIGINT REFERENCES users(id),
    reviewed_at   TIMESTAMPTZ,
    review_note   VARCHAR(500),
    UNIQUE (lecturer_id, semester_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_submissions_lecturer ON schedule_submissions(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_schedule_submissions_semester ON schedule_submissions(semester_id);