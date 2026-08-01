-- V20260801_002__create_academic_tables.sql
-- Academic structure: courses, curricula, classes, schedules, students, lecturers

-- courses (mata kuliah)
CREATE TABLE courses (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    credits         SMALLINT NOT NULL CHECK (credits > 0 AND credits <= 6),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- curricula (kurikulum per prodi per semester)
CREATE TABLE curricula (
    id                  BIGSERIAL PRIMARY KEY,
    prodi_id            SMALLINT NOT NULL REFERENCES prodis(id),
    semester_id         SMALLINT NOT NULL REFERENCES semesters(id),
    course_id           SMALLINT NOT NULL REFERENCES courses(id),
    is_mandatory        BOOLEAN NOT NULL DEFAULT true,    -- wajib / pilihan
    semester_number     SMALLINT NOT NULL,                -- semester ke-1, 2, 3, ...
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prodi_id, semester_id, course_id)
);

-- classes (kelas per mata kuliah per semester)
CREATE TABLE classes (
    id                  BIGSERIAL PRIMARY KEY,
    curriculum_id       BIGINT NOT NULL REFERENCES curricula(id),
    class_code          VARCHAR(20) NOT NULL,             -- mis: 'A', 'B', 'C'
    lecturer_id         BIGINT REFERENCES users(id),      -- dosen pengampu
    capacity            SMALLINT NOT NULL DEFAULT 30,
    current_enrolled    SMALLINT NOT NULL DEFAULT 0,
    room                VARCHAR(50),
    day_of_week         SMALLINT,                         -- 1=Senin .. 7=Minggu
    start_time          TIME,                             -- HH:MM:SS
    end_time            TIME,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (curriculum_id, class_code)
);

-- students (mahasiswa) - profile tambahan dari users
CREATE TABLE students (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    nim                     VARCHAR(20) NOT NULL UNIQUE,          -- NIM existing dari sistem lain
    prodi_id                SMALLINT NOT NULL REFERENCES prodis(id),
    academic_year_id        SMALLINT NOT NULL REFERENCES academic_years(id), -- angkatan
    entry_type              VARCHAR(20) NOT NULL,                 -- 'SBMPTN', 'SNMPTN', 'Mandiri', 'Transfer'
    entry_test_score        NUMERIC(5,2),                         -- nilai tes masuk (untuk tagihan beda)
    is_active               BOOLEAN NOT NULL DEFAULT true,
    status                  VARCHAR(20) NOT NULL DEFAULT 'aktif', -- 'aktif', 'cuti', 'dropout', 'lulus'
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- lecturers (dosen) - profile tambahan dari users
CREATE TABLE lecturers (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    nidn            VARCHAR(20) UNIQUE,                            -- NIDN
    prodi_id        SMALLINT NOT NULL REFERENCES prodis(id),
    employment_type VARCHAR(20) NOT NULL DEFAULT 'tetap',          -- 'tetap', 'kontrak'
    bank_account    VARCHAR(50),                                   -- untuk payroll
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- schedules (jadwal mengajar - checklist dari admin per DL-08/Q15)
CREATE TABLE schedules (
    id              BIGSERIAL PRIMARY KEY,
    class_id        BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    meeting_number  SMALLINT NOT NULL,                             -- pertemuan ke-1, 2, ...
    scheduled_date  DATE NOT NULL,
    topic           VARCHAR(200),                                  -- materi pertemuan
    is_completed    BOOLEAN NOT NULL DEFAULT false,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, meeting_number)
);

-- indexes
CREATE INDEX idx_curricula_prodi_semester ON curricula(prodi_id, semester_id);
CREATE INDEX idx_classes_curriculum_id ON classes(curriculum_id);
CREATE INDEX idx_classes_lecturer_id ON classes(lecturer_id);
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_students_nim ON students(nim);
CREATE INDEX idx_students_prodi_id ON students(prodi_id);
CREATE INDEX idx_lecturers_user_id ON lecturers(user_id);
CREATE INDEX idx_lecturers_prodi_id ON lecturers(prodi_id);
CREATE INDEX idx_schedules_class_id ON schedules(class_id);
CREATE INDEX idx_schedules_scheduled_date ON schedules(scheduled_date);