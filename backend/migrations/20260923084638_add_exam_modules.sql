-- Migration: Add Exam Modules (Periods, Schedules, Questions)
-- Accommodates Pessay integration: AI Grading + Academic Management

-- 1. Exam Periods (Admin Sistem)
CREATE TABLE exam_periods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- e.g., 'UTS Ganjil 2026/2027'
    semester_id VARCHAR(20) NOT NULL, -- link to academic_years/semester
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    can_input_questions BOOLEAN DEFAULT true, -- Dosen input window
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Exam Questions (Bank Soal - Dosen)
CREATE TABLE exam_questions (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL, -- link to courses
    lecturer_id INT NOT NULL, -- link to users (dosen)
    title VARCHAR(255) NOT NULL,
    description TEXT, -- context or instructions
    total_points INT DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Exam Items (Individual Essay Questions)
CREATE TABLE exam_question_items (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    rubric_reference TEXT, -- For AI Pessay to grade against
    max_score INT NOT NULL,
    sort_order INT DEFAULT 0
);

-- 4. Exam Schedules (Admin Akademik)
CREATE TABLE exam_schedules (
    id SERIAL PRIMARY KEY,
    exam_period_id INT NOT NULL REFERENCES exam_periods(id),
    class_id INT NOT NULL, -- link to classes
    question_id INT REFERENCES exam_questions(id), -- Assigned question bank
    room VARCHAR(50), -- Physical or 'Virtual'
    exam_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add permissions for RBAC
INSERT INTO permissions (code, name, description) VALUES
('exam.period.manage', 'Kelola Periode Ujian', 'Admin Sistem: Menentukan kapan UTS/UAS berlangsung'),
('exam.schedule.manage', 'Kelola Jadwal Ujian', 'Admin Akademik: Mengatur hari/jam/ruangan ujian'),
('exam.question.input', 'Input Soal Ujian', 'Dosen: Menginput soal dan rubrik jawaban');

-- Assign permissions to roles (ID assumption: 1=admin_sistem, 2=admin_akademik, 3=dosen)
INSERT INTO role_permissions (role_id, permission_id) 
SELECT 1, id FROM permissions WHERE code = 'exam.period.manage' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id) 
SELECT 2, id FROM permissions WHERE code = 'exam.schedule.manage' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id) 
SELECT 3, id FROM permissions WHERE code = 'exam.question.input' ON CONFLICT DO NOTHING;
