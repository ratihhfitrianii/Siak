-- V20260822_002__seed_courses_2026_2027.sql
-- Duplikasi curricula & classes dari 2024/2025-1 ke 2026/2027-1
-- agar dosen bisa memilih MK di semester Ganjil 2026/2027
--
-- Idempotent: menggunakan INSERT ... ON CONFLICT DO NOTHING dengan kurikulum unik
-- (prodi_id, semester_id, course_id)

-- 1) Curricula: copy dari 2024/2025-1 (semester_id lama) ke 2026/2027-1 (semester_id baru)
--    Semester baru id diambil dari kode '2026/2027-1'
INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
SELECT c.prodi_id,
       (SELECT id FROM semesters WHERE code = '2026/2027-1') as semester_id,
       c.course_id,
       c.is_mandatory,
       c.semester_number
FROM curricula c
JOIN semesters s ON s.id = c.semester_id
WHERE s.code = '2024/2025-1'
ON CONFLICT (prodi_id, semester_id, course_id) DO NOTHING;

-- 2) Classes: untuk setiap curricula baru, buat 2 kelas (A & B) seperti seed dev
--    Kelas A: dosen pertama per prodi, kapasitas 30, enrolled bervariasi
--    Kelas B: dosen terakhir per prodi, kapasitas 30, enrolled bervariasi
--    Hanya buat jika belum ada kelas untuk curricula tsb

-- Kelas A
INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, room, day_of_week, start_time, end_time, is_active)
SELECT cn.id, 'A',
       (SELECT l.user_id 
        FROM lecturers l 
        JOIN users u ON u.id = l.user_id 
        WHERE l.prodi_id = cn.prodi_id AND l.is_active AND u.is_active 
        ORDER BY u.id LIMIT 1),
       30, 12 + (cn.id % 13),
       'R.' || (100 + (cn.id % 20)), 1 + (cn.id % 5),
       ('07:30'::time + ((cn.id % 8) * interval '90 minutes')),
       ('07:30'::time + ((cn.id % 8) * interval '90 minutes') + interval '90 minutes'),
       true
FROM curricula cn
JOIN semesters s ON s.id = cn.semester_id
WHERE s.code = '2026/2027-1'
  AND NOT EXISTS (
    SELECT 1 FROM classes x 
    WHERE x.curriculum_id = cn.id AND x.class_code = 'A'
  )
ON CONFLICT (curriculum_id, class_code) DO NOTHING;

-- Kelas B
INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, room, day_of_week, start_time, end_time, is_active)
SELECT cn.id, 'B',
       (SELECT l.user_id 
        FROM lecturers l 
        JOIN users u ON u.id = l.user_id 
        WHERE l.prodi_id = cn.prodi_id AND l.is_active AND u.is_active 
        ORDER BY u.id DESC LIMIT 1),
       30, 10 + (cn.id % 11),
       'R.' || (200 + (cn.id % 20)), 1 + ((cn.id + 2) % 5),
       ('08:00'::time + ((cn.id + 3) % 8) * interval '90 minutes'),
       ('08:00'::time + ((cn.id + 3) % 8) * interval '90 minutes') + interval '90 minutes',
       true
FROM curricula cn
JOIN semesters s ON s.id = cn.semester_id
WHERE s.code = '2026/2027-1'
  AND NOT EXISTS (
    SELECT 1 FROM classes x 
    WHERE x.curriculum_id = cn.id AND x.class_code = 'B'
  )
ON CONFLICT (curriculum_id, class_code) DO NOTHING;

-- 3) Perbarui krs_start_date & krs_end_date di semester 2026/2027-1 agar konsisten
UPDATE semesters
SET krs_start_date = (now() - interval '7 days')::date,
    krs_end_date   = (now() + interval '30 days')::date,
    updated_at = now()
WHERE code = '2026/2027-1';