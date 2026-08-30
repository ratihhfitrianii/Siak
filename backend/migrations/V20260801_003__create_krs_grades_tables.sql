-- V20260801_003__create_krs_grades_tables.sql
-- KRS, grades, payments, attendance, guidance, substitute, payroll, audit, notifications

-- krs_periods (periode KRS per semester)
CREATE TABLE krs_periods (
    id                  BIGSERIAL PRIMARY KEY,
    semester_id         SMALLINT NOT NULL REFERENCES semesters(id),
    name                VARCHAR(100) NOT NULL,               -- 'KRS Utama', 'KRS Revisi'
    start_date          TIMESTAMPTZ NOT NULL,
    end_date            TIMESTAMPTZ NOT NULL,
    is_revision         BOOLEAN NOT NULL DEFAULT false,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (semester_id, name)
);

-- krs_submissions (pengajuan KRS mahasiswa)
CREATE TABLE krs_submissions (
    id                      BIGSERIAL PRIMARY KEY,
    student_id              BIGINT NOT NULL REFERENCES students(id),
    krs_period_id           BIGINT NOT NULL REFERENCES krs_periods(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft', 'submitted', 'approved', 'rejected'
    submitted_at            TIMESTAMPTZ,
    approved_by             BIGINT REFERENCES users(id),          -- Admin Akademik
    approved_at             TIMESTAMPTZ,
    rejection_reason        TEXT,
    is_locked               BOOLEAN NOT NULL DEFAULT false,       -- locked setelah approve (AC-07)
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, krs_period_id)
);

-- krs_items (detail mata kuliah yang diambil)
CREATE TABLE krs_items (
    id                      BIGSERIAL PRIMARY KEY,
    krs_submission_id       BIGINT NOT NULL REFERENCES krs_submissions(id) ON DELETE CASCADE,
    class_id                BIGINT NOT NULL REFERENCES classes(id),
    is_confirmed            BOOLEAN NOT NULL DEFAULT false,       -- konfirmasi Admin Akademik
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (krs_submission_id, class_id)
);

-- UNIQUE constraint untuk kuota KRS (AC-02): prevent double enroll & enforce capacity
-- Enforced at application level via SELECT FOR UPDATE in transaction (DL-07, A-5)
-- Partial unique index alternative: prevent duplicate active submission per student per semester
CREATE UNIQUE INDEX uq_krs_one_active_per_student_semester
    ON krs_submissions (student_id)
    WHERE status IN ('submitted', 'approved');

-- grades (nilai)
CREATE TABLE grades (
    id                      BIGSERIAL PRIMARY KEY,
    krs_item_id             BIGINT NOT NULL REFERENCES krs_items(id) ON DELETE CASCADE,
    -- komponen nilai (bobot: tugas 20%, UTS 30%, UAS 50% per DL-12)
    tugas_score             NUMERIC(5,2),
    uts_score               NUMERIC(5,2),
    uas_score               NUMERIC(5,2),
    -- nilai akhir dihitung: (tugas*0.2 + uts*0.3 + uas*0.5)
    final_score             NUMERIC(5,2),
    grade_letter            VARCHAR(2),                          -- A, A-, B+, B, B-, C+, C, D, E
    grade_point             NUMERIC(3,2),                        -- 4.00, 3.70, 3.30, 3.00, 2.70, 2.30, 2.00, 1.00, 0.00
    is_remedial             BOOLEAN NOT NULL DEFAULT false,
    remedial_score          NUMERIC(5,2),                        -- nilai remedial (diambil yang tertinggi per DL-12)
    input_by                BIGINT NOT NULL REFERENCES users(id), -- dosen yang input
    input_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by              BIGINT REFERENCES users(id),          -- admin yang edit (atribusi)
    updated_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payments (tagihan per semester per angkatan per DL-13/Q13)
CREATE TABLE payments (
    id                      BIGSERIAL PRIMARY KEY,
    student_id              BIGINT NOT NULL REFERENCES students(id),
    semester_id             SMALLINT NOT NULL REFERENCES semesters(id),
    total_amount            NUMERIC(14,2) NOT NULL,              -- total tagihan (SPP + lainnya)
    paid_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
    status                  VARCHAR(20) NOT NULL DEFAULT 'belum_lunas', -- 'belum_lunas', 'partial', 'lunas'
    due_date                DATE NOT NULL,                       -- batas bayar (1 minggu sebelum KRS per DL-13)
    is_waived               BOOLEAN NOT NULL DEFAULT false,      -- beasiswa/bebas biaya
    waived_reason           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, semester_id)
);

-- payment_items (detail tagihan: SPP, gedung, tes, dll.)
CREATE TABLE payment_items (
    id                      BIGSERIAL PRIMARY KEY,
    payment_id              BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    type                    VARCHAR(30) NOT NULL,                -- 'SPP', 'Gedung', 'Tes', 'Lainnya'
    description             TEXT,
    amount                  NUMERIC(14,2) NOT NULL,
    is_mandatory            BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- attendance_sessions (sesi absensi per pertemuan)
CREATE TABLE attendance_sessions (
    id                      BIGSERIAL PRIMARY KEY,
    schedule_id             BIGINT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    session_date            DATE NOT NULL,
    topic                   VARCHAR(200) NOT NULL,               -- materi wajib diisi dulu (DL-13/Q15)
    qr_code                 VARCHAR(100),                       -- untuk absensi mahasiswa
    is_open                 BOOLEAN NOT NULL DEFAULT false,
    opened_at               TIMESTAMPTZ,
    closed_at               TIMESTAMPTZ,
    created_by              BIGINT NOT NULL REFERENCES users(id), -- dosen
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- attendance_records (record absensi mahasiswa)
CREATE TABLE attendance_records (
    id                      BIGSERIAL PRIMARY KEY,
    session_id              BIGINT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id              BIGINT NOT NULL REFERENCES students(id),
    status                  VARCHAR(20) NOT NULL,                -- 'hadir', 'tidak_hadir', 'izin', 'sakit'
    marked_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    marked_by               BIGINT REFERENCES users(id),         -- mahasiswa (self) / dosen
    UNIQUE (session_id, student_id)
);

-- guidance_sessions (bimbingan akademik per DL-13/Q16)
CREATE TABLE guidance_sessions (
    id                      BIGSERIAL PRIMARY KEY,
    student_id              BIGINT NOT NULL REFERENCES students(id),
    lecturer_id             BIGINT NOT NULL REFERENCES lecturers(id), -- dosen wali
    session_date            DATE NOT NULL,
    notes                   TEXT,                                 -- catatan pertemuan
    progress                VARCHAR(50),                          -- progress status
    is_visible_to_student   BOOLEAN NOT NULL DEFAULT true,        -- mahasiswa lihat sendiri
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- substitute_teaching (pengganti mengajar per DL-13/Q17)
CREATE TABLE substitute_teaching (
    id                      BIGSERIAL PRIMARY KEY,
    original_lecturer_id    BIGINT NOT NULL REFERENCES lecturers(id),
    substitute_lecturer_id  BIGINT NOT NULL REFERENCES lecturers(id),
    class_id                BIGINT NOT NULL REFERENCES classes(id),
    schedule_id             BIGINT NOT NULL REFERENCES schedules(id),
    reason                  TEXT,
    status                  VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'cancelled'
    requested_by            BIGINT NOT NULL REFERENCES users(id),  -- dosen/admin yang ajukan
    approved_by             BIGINT REFERENCES users(id),           -- tidak perlu approval hari H (DL-13/Q17)
    approved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payrolls (payroll dosen per DL-13/Q14 - minimal dulu)
CREATE TABLE payrolls (
    id                      BIGSERIAL PRIMARY KEY,
    lecturer_id             BIGINT NOT NULL REFERENCES lecturers(id),
    period_start            DATE NOT NULL,
    period_end              DATE NOT NULL,
    base_salary             NUMERIC(14,2) NOT NULL DEFAULT 0,     -- dosen tetap per bulan
    honor_per_meeting       NUMERIC(14,2) NOT NULL DEFAULT 0,     -- dosen kontrak per pertemuan
    total_meetings          SMALLINT NOT NULL DEFAULT 0,
    total_honor             NUMERIC(14,2) NOT NULL DEFAULT 0,
    deductions              NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft', 'approved', 'paid'
    input_by                BIGINT NOT NULL REFERENCES users(id),  -- Admin Keuangan
    approved_by             BIGINT REFERENCES users(id),
    approved_at             TIMESTAMPTZ,
    paid_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lecturer_id, period_start, period_end)
);

-- audit_logs (audit trail + atribusi per S-06, S-07, DL-10)
CREATE TABLE audit_logs (
    id                      BIGSERIAL PRIMARY KEY,
    table_name              VARCHAR(50) NOT NULL,
    record_id               BIGINT NOT NULL,
    action                  VARCHAR(20) NOT NULL,                -- 'INSERT', 'UPDATE', 'DELETE'
    old_values              JSONB,                               -- nilai lama (null untuk INSERT)
    new_values              JSONB,                               -- nilai baru (null untuk DELETE)
    changed_by              BIGINT NOT NULL REFERENCES users(id), -- user yang melakukan perubahan
    changed_by_label        VARCHAR(100) NOT NULL,               -- "diinput oleh [nama] ([role])" per S-07
    ip_address              INET,
    user_agent              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- notifications (notifikasi real-time + email per F-17, K-09)
CREATE TABLE notifications (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title                   VARCHAR(200) NOT NULL,
    message                 TEXT NOT NULL,
    type                    VARCHAR(30) NOT NULL,                -- 'krs_approved', 'krs_rejected', 'payment_due', 'grade_posted', 'schedule_change', 'substitute', 'system'
    related_entity_type     VARCHAR(50),                         -- 'krs_submission', 'payment', 'grade', 'class', etc.
    related_entity_id       BIGINT,
    is_read                 BOOLEAN NOT NULL DEFAULT false,
    read_at                 TIMESTAMPTZ,
    sent_via                VARCHAR(20)[] DEFAULT ARRAY['in_app'], -- 'in_app', 'email', 'push'
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- indexes for performance (AC-01, NF-06: 5k simultan)
CREATE INDEX idx_krs_submissions_student_period ON krs_submissions(student_id, krs_period_id);
CREATE INDEX idx_krs_submissions_status ON krs_submissions(status);
CREATE INDEX idx_krs_items_submission ON krs_items(krs_submission_id);
CREATE INDEX idx_grades_krs_item ON grades(krs_item_id);
CREATE INDEX idx_payments_student_semester ON payments(student_id, semester_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_attendance_sessions_schedule ON attendance_sessions(schedule_id);
CREATE INDEX idx_attendance_records_session ON attendance_records(session_id);
CREATE INDEX idx_attendance_records_student ON attendance_records(student_id);
CREATE INDEX idx_guidance_student_lecturer ON guidance_sessions(student_id, lecturer_id);
CREATE INDEX idx_substitute_class_schedule ON substitute_teaching(class_id, schedule_id);
CREATE INDEX idx_payrolls_lecturer_period ON payrolls(lecturer_id, period_start, period_end);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);