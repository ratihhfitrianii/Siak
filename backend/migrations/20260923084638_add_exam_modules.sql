-- Migration: Add Exam Modules (Periods, Schedules, Questions)
-- Accommodates Pessay integration: AI Grading + Academic Management

-- 1. Exam Periods (Admin Sistem)
CREATE TABLE exam_periods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    semester_id VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    can_input_questions BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Exam Questions (Bank Soal - Dosen)
CREATE TABLE exam_questions (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL,
    lecturer_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    total_points INT DEFAULT 100,
    created_id TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Exam Items (Individual Essay Questions)
CREATE TABLE exam_question_items (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    rubric_reference TEXT,
    max_score INT NOT NULL,
    sort_order INT DEFAULT 0
);

-- 4. Exam Schedules (Admin Akademik)
CREATE TABLE exam_schedules (
    id SERIAL PRIMARY KEY,
    exam_period_id INT NOT NULL REFERENCES exam_periods(id),
    class_id INT NOT NULL,
    question_id INT REFERENCES exam_questions(id),
    room VARCHAR(50),
    exam_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
