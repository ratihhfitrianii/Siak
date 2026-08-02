-- Seed development (T1.5): kurikulum + kelas untuk prodi selain TI/SI.
-- V006 hanya membuat kelas untuk prodi yang sudah punya kurikulum (TI, SI);
-- mahasiswa MNJ/AKT/HKM/KN mendapat daftar kelas kosong saat KRS.
-- 1) Kurikulum semester 2024/2025-1 (semester_number 3) untuk prodi non-TI/SI,
--    pakai mata kuliah tingkat 3 (kode X301) mengikuti pola X101/X201/X301.
-- 2) Kelas A/B untuk setiap kurikulum semester tsb yang belum punya kelas.

INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
SELECT p.id, s.id, c.id, true, 3
FROM prodis p
JOIN semesters s ON s.code = '2024/2025-1'
JOIN courses c ON c.code = p.code || '301'
WHERE p.code IN ('MNJ', 'AKT', 'HKM', 'KN')
  AND NOT EXISTS (
    SELECT 1 FROM curricula x
    WHERE x.prodi_id = p.id AND x.semester_id = s.id AND x.course_id = c.id
  )
ON CONFLICT DO NOTHING;

INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, room, day_of_week, start_time, end_time, is_active)
SELECT c.id, 'A',
       (SELECT l.user_id FROM lecturers l WHERE l.prodi_id = c.prodi_id AND l.is_active ORDER BY l.id LIMIT 1),
       30, 12 + (c.id % 13),
       'R.' || (100 + (c.id % 20)), 1 + (c.id % 5),
       ('07:30'::time + ((c.id % 8) * interval '90 minutes')), ('07:30'::time + ((c.id % 8) * interval '90 minutes') + interval '90 minutes'),
       true
FROM curricula c
WHERE c.semester_id = (SELECT id FROM semesters WHERE code = '2024/2025-1')
  AND NOT EXISTS (SELECT 1 FROM classes x WHERE x.curriculum_id = c.id AND x.class_code = 'A')
ON CONFLICT (curriculum_id, class_code) DO NOTHING;

INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, room, day_of_week, start_time, end_time, is_active)
SELECT c.id, 'B',
       (SELECT l.user_id FROM lecturers l WHERE l.prodi_id = c.prodi_id AND l.is_active ORDER BY l.id DESC LIMIT 1),
       30, 10 + (c.id % 11),
       'R.' || (200 + (c.id % 20)), 1 + ((c.id + 2) % 5),
       ('08:00'::time + ((c.id + 3) % 8) * interval '90 minutes'), ('08:00'::time + ((c.id + 3) % 8) * interval '90 minutes') + interval '90 minutes',
       true
FROM curricula c
WHERE c.semester_id = (SELECT id FROM semesters WHERE code = '2024/2025-1')
  AND NOT EXISTS (SELECT 1 FROM classes x WHERE x.curriculum_id = c.id AND x.class_code = 'B')
ON CONFLICT (curriculum_id, class_code) DO NOTHING;
