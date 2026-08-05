-- V20260805_016__lecturer_course_selections.sql
-- T3.1: Dosen Pilih MK (F-20) - lecturer course selections per semester

CREATE TABLE lecturer_course_selections (
    id                      BIGSERIAL PRIMARY KEY,
    lecturer_id             BIGINT NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
    semester_id             SMALLINT NOT NULL REFERENCES semesters(id),
    curriculum_id           BIGINT NOT NULL REFERENCES curricula(id),
    -- status: 'diajukan' (submitted), 'diterima' (approved), 'ditolak' (rejected)
    status                  VARCHAR(20) NOT NULL DEFAULT 'diajukan',
    priority                SMALLINT NOT NULL DEFAULT 1,        -- prioritas pilihan dosen
    notes                   TEXT,                                -- catatan dosen
    reviewed_by             BIGINT REFERENCES users(id),         -- admin yang review
    reviewed_at             TIMESTAMPTZ,
    review_notes            TEXT,                                -- catatan admin
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lecturer_id, curriculum_id)                         -- satu pilihan per MK per semester
);

CREATE INDEX idx_lecturer_selections_lecturer_semester ON lecturer_course_selections(lecturer_id, semester_id);
CREATE INDEX idx_lecturer_selections_curriculum ON lecturer_course_selections(curriculum_id);
CREATE INDEX idx_lecturer_selections_status ON lecturer_course_selections(status);

-- backfill: auto-create selections for existing class assignments (lecturer_id in classes)
-- dosen yang sudah jadi pengampu kelas dianggap sudah "diterima" untuk MK tersebut
INSERT INTO lecturer_course_selections (lecturer_id, semester_id, curriculum_id, status, priority, notes, created_at, updated_at)
SELECT DISTINCT ON (l.id, cur.id)
    l.id as lecturer_id,
    s.id as semester_id,
    cur.id as curriculum_id,
    'diterima' as status,
    1 as priority,
    'Auto-generated from existing class assignment' as notes,
    now() as created_at,
    now() as updated_at
FROM classes cl
JOIN curricula cur ON cur.id = cl.curriculum_id
JOIN semesters s ON s.id = cur.semester_id
JOIN lecturers l ON l.id = cl.lecturer_id
WHERE cl.lecturer_id IS NOT NULL
  AND cl.is_active
  AND NOT EXISTS (
      SELECT 1 FROM lecturer_course_selections lcs 
      WHERE lcs.lecturer_id = l.id AND lcs.curriculum_id = cur.id
  )
ORDER BY l.id, cur.id, cl.id;