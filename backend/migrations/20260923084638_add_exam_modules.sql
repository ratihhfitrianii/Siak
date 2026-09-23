1|-- Migration: Add Exam Modules (Periods, Schedules, Questions)
2|-- Accommodates Pessay integration: AI Grading + Academic Management
3|
4|-- 1. Exam Periods (Admin Sistem)
5|CREATE TABLE exam_periods (
6|    id SERIAL PRIMARY KEY,
7|    name VARCHAR(100) NOT NULL, -- e.g., 'UTS Ganjil 2026/2027'
8|    semester_id VARCHAR(20) NOT NULL, -- link to academic_years/semester
9|    start_date DATE NOT NULL,
10|    end_date DATE NOT NULL,
11|    is_active BOOLEAN DEFAULT true,
12|    can_input_questions BOOLEAN DEFAULT true, -- Dosen input window
13|    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
14|    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
15|);
16|
17|-- 2. Exam Questions (Bank Soal - Dosen)
18|CREATE TABLE exam_questions (
19|    id SERIAL PRIMARY KEY,
20|    course_id INT NOT NULL, -- link to courses
21|    lecturer_id INT NOT NULL, -- link to users (dosen)
22|    title VARCHAR(255) NOT NULL,
23|    description TEXT, -- context or instructions
24|    total_points INT DEFAULT 100,
25|    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
26|    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
27|);
28|
29|-- 3. Exam Items (Individual Essay Questions)
30|CREATE TABLE exam_question_items (
31|    id SERIAL PRIMARY KEY,
32|    question_id INT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
33|    question_text TEXT NOT NULL,
34|    rubric_reference TEXT, -- For AI Pessay to grade against
35|    max_score INT NOT NULL,
36|    sort_order INT DEFAULT 0
37|);
38|
39|-- 4. Exam Schedules (Admin Akademik)
40|CREATE TABLE exam_schedules (
41|    id SERIAL PRIMARY KEY,
42|    exam_period_id INT NOT NULL REFERENCES exam_periods(id),
43|    class_id INT NOT NULL, -- link to classes
44|    question_id INT REFERENCES exam_questions(id), -- Assigned question bank
45|    room VARCHAR(50), -- Physical or 'Virtual'
46|    exam_date DATE NOT NULL,
47|    start_time TIME NOT NULL,
48|    end_time TIME NOT NULL,
49|    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
50|    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
51|);
52|
53|-- Add permissions for RBAC
55|('exam.period.manage', 'Kelola Periode Ujian', 'Admin Sistem: Menentukan kapan UTS/UAS berlangsung'),
56|('exam.schedule.manage', 'Kelola Jadwal Ujian', 'Admin Akademik: Mengatur hari/jam/ruangan ujian'),
57|('exam.question.input', 'Input Soal Ujian', 'Dosen: Menginput soal dan rubrik jawaban');
58|
59|-- Assign permissions to roles (ID assumption: 1=admin_sistem, 2=admin_akademik, 3=dosen)
60|INSERT INTO role_permissions (role_id, permission_id) 
62|INSERT INTO role_permissions (role_id, permission_id) 
64|INSERT INTO role_permissions (role_id, permission_id) 