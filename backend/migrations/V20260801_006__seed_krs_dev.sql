-- Seed development KRS (T1.5): periode aktif relatif ke "sekarang" + kelas untuk kurikulum.
-- NOTE: seed dev-only. Periode seed asli (2024) sudah lewat; ini menyesuaikan agar KRS bisa diuji.

-- 1) Periode KRS utama: buka sejak 7 hari lalu, tutup 30 hari lagi (dev)
UPDATE krs_periods
SET start_date = now() - interval '7 days',
    end_date   = now() + interval '30 days',
    is_active  = true,
    updated_at = now()
WHERE semester_id = (SELECT id FROM semesters WHERE code = '2024/2025-1')
  AND name LIKE 'KRS Utama%';

UPDATE krs_periods
SET is_active = false,
    updated_at = now()
WHERE name LIKE 'KRS Revisi%';

-- 2) Kelas untuk setiap kurikulum semester 2024/2025-1 (2 kelas per MK: A, B)
--    kuota 30; current_enrolled bervariasi 12–24 agar ada kelas hampir penuh utk test AC-02
INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, room, day_of_week, start_time, end_time, is_active)
SELECT c.id, 'A',
       (SELECT l.user_id FROM lecturers l JOIN users u ON u.id = l.user_id WHERE l.prodi_id = c.prodi_id AND l.is_active AND u.is_active ORDER BY u.id LIMIT 1),
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
       (SELECT l.user_id FROM lecturers l JOIN users u ON u.id = l.user_id WHERE l.prodi_id = c.prodi_id AND l.is_active AND u.is_active ORDER BY u.id DESC LIMIT 1),
       30, 10 + (c.id % 11),
       'R.' || (200 + (c.id % 20)), 1 + ((c.id + 2) % 5),
       ('08:00'::time + ((c.id + 3) % 8) * interval '90 minutes'), ('08:00'::time + ((c.id + 3) % 8) * interval '90 minutes') + interval '90 minutes',
       true
FROM curricula c
WHERE c.semester_id = (SELECT id FROM semesters WHERE code = '2024/2025-1')
  AND NOT EXISTS (SELECT 1 FROM classes x WHERE x.curriculum_id = c.id AND x.class_code = 'B')
ON CONFLICT (curriculum_id, class_code) DO NOTHING;

-- 3) Update semester KRS window agar konsisten dengan periode
UPDATE semesters
SET krs_start_date = (now() - interval '7 days')::date,
    krs_end_date   = (now() + interval '30 days')::date,
    updated_at = now()
WHERE code = '2024/2025-1';
