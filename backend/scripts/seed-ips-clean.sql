-- ============================================================
-- CLEAN REBUILD untuk TEST25001
-- Hanya bersihkan data milik student ini, tidak sentuh data lain
-- ============================================================

-- Step 1: Bersihkan data lama (hanya milik student ini)
DO $$
DECLARE
  v_student_id BIGINT;
  v_ids BIGINT[];
BEGIN
  SELECT id INTO v_student_id FROM students WHERE nim = 'TEST25001';

  -- Kumpulkan semua krs_submission_id milik student ini
  SELECT array_agg(id) INTO v_ids FROM krs_submissions WHERE student_id = v_student_id;

  -- Hapus grades → krs_items → krs_submissions (urutan benar)
  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    DELETE FROM grades WHERE krs_item_id IN (
      SELECT id FROM krs_items WHERE krs_submission_id = ANY(v_ids)
    );
    DELETE FROM krs_items WHERE krs_submission_id = ANY(v_ids);
    DELETE FROM krs_submissions WHERE id = ANY(v_ids);
  END IF;

  RAISE NOTICE '✅ Data lama dihapus';
END $$;

-- Step 2: Insert data baru
DO $$
DECLARE
  v_student_id     BIGINT;
  v_prodi_id       SMALLINT;
  v_dosen_user     BIGINT;
  v_sem_id         SMALLINT;
  v_sem_code       TEXT;
  v_course_id      SMALLINT;
  v_cur_id         BIGINT;
  v_class_id       BIGINT;
  v_krs_id         BIGINT;
  v_krs_period_id  BIGINT;
  v_gp             NUMERIC(3,2);
  v_fs             NUMERIC(5,2);
  v_gl             TEXT;
  v_sem_num        INT := 0;
  v_rn             INT;
  v_grade_num      INT := 0;
BEGIN
  SELECT id INTO v_student_id FROM students WHERE nim = 'TEST25001';
  SELECT id INTO v_prodi_id FROM prodis ORDER BY id LIMIT 1;
  SELECT u.id INTO v_dosen_user
  FROM users u JOIN lecturers l ON l.user_id = u.id
  WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen') LIMIT 1;

  FOR v_sem_id, v_sem_code IN
    SELECT id, code FROM semesters ORDER BY id LIMIT 5
  LOOP
    v_sem_num := v_sem_num + 1;

    -- 1. KRS Period (pakai yang sudah ada atau buat baru)
    SELECT id INTO v_krs_period_id FROM krs_periods WHERE semester_id = v_sem_id LIMIT 1;
    IF v_krs_period_id IS NULL THEN
      INSERT INTO krs_periods (semester_id, name, start_date, end_date, is_revision)
      VALUES (v_sem_code || ' Period', v_sem_code || ' Period',
              CURRENT_DATE - ((6 - v_sem_num) * 180)::int,
              CURRENT_DATE - ((5 - v_sem_num) * 180)::int, false)
      RETURNING id INTO v_krs_period_id;
    END IF;

    -- 2. KRS Submission (status='draft')
    INSERT INTO krs_submissions (student_id, krs_period_id, status, submitted_at)
    VALUES (v_student_id, v_krs_period_id, 'draft',
            now() - ((5 - v_sem_num) || ' months')::interval)
    RETURNING id INTO v_krs_id;

    -- 3. Kurikulum + Kelas + KRS Items (3 MK per semester)
    v_rn := 0;
    FOR v_course_id IN SELECT id FROM courses WHERE is_active = true ORDER BY id LIMIT 3 LOOP
      v_rn := v_rn + 1;

      -- Kurikulum
      SELECT id INTO v_cur_id FROM curricula
      WHERE prodi_id = v_prodi_id AND semester_id = v_sem_id AND course_id = v_course_id;
      IF v_cur_id IS NULL THEN
        INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
        VALUES (v_prodi_id, v_sem_id, v_course_id, true, v_sem_num)
        RETURNING id INTO v_cur_id;
      END IF;

      -- Kelas
      SELECT id INTO v_class_id FROM classes WHERE curriculum_id = v_cur_id LIMIT 1;
      IF v_class_id IS NULL THEN
        INSERT INTO classes (curriculum_id, class_code, capacity, current_enrolled, lecturer_id, is_active)
        VALUES (v_cur_id, 'A', 40, 1, v_dosen_user, true)
        RETURNING id INTO v_class_id;
      END IF;

      -- KRS Item
      INSERT INTO krs_items (krs_submission_id, class_id)
      VALUES (v_krs_id, v_class_id);
    END LOOP;

    -- 4. Grades (3 per semester, bervariasi)
    v_rn := 0;
    FOR v_course_id IN SELECT id FROM courses WHERE is_active = true ORDER BY id LIMIT 3 LOOP
      v_rn := v_rn + 1;

      SELECT id INTO v_class_id FROM classes WHERE curriculum_id = (
        SELECT id FROM curricula
        WHERE prodi_id = v_prodi_id AND semester_id = v_sem_id AND course_id = v_course_id
      ) LIMIT 1;

      SELECT ki.id INTO v_krs_id FROM krs_items ki
      JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
      WHERE ks.student_id = v_student_id AND ki.class_id = v_class_id;

      v_gp := CASE (v_sem_num * 10 + v_rn) % 15
        WHEN 0  THEN 3.80 WHEN 1  THEN 4.00 WHEN 2  THEN 3.70
        WHEN 3  THEN 3.70 WHEN 4  THEN 3.30 WHEN 5  THEN 3.50
        WHEN 6  THEN 3.70 WHEN 7  THEN 3.30 WHEN 8  THEN 3.50
        WHEN 9  THEN 4.00 WHEN 10 THEN 3.80 WHEN 11 THEN 3.90
        WHEN 12 THEN 3.70 WHEN 13 THEN 3.40 WHEN 14 THEN 3.60
      END;

      v_fs := v_gp * 25;
      v_gl := CASE
        WHEN v_gp >= 3.85 THEN 'A' WHEN v_gp >= 3.50 THEN 'A-'
        WHEN v_gp >= 3.15 THEN 'B+' WHEN v_gp >= 2.85 THEN 'B'
        WHEN v_gp >= 2.50 THEN 'B-' ELSE 'C+'
      END;

      INSERT INTO grades (krs_item_id, tugas_score, uts_score, uas_score,
                          final_score, grade_letter, grade_point, input_by)
      VALUES (v_krs_id, v_fs*0.95, v_fs, v_fs*1.05, v_fs, v_gl, v_gp, v_dosen_user);
      v_grade_num := v_grade_num + 1;
    END LOOP;

    RAISE NOTICE 'Semester %: OK', v_sem_code;
  END LOOP;

  RAISE NOTICE '✅ Selesai! Grades: %', v_grade_num;
END $$;

-- Verifikasi
SELECT s.code as semester, s.name, COUNT(g.id) as mk,
       ROUND(AVG(g.grade_point), 2) as ips
FROM grades g
JOIN krs_items ki ON ki.id = g.krs_item_id
JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
JOIN krs_periods kp ON kp.id = ks.krs_period_id
JOIN semesters s ON s.id = kp.semester_id
WHERE ks.student_id = (SELECT id FROM students WHERE nim = 'TEST25001')
GROUP BY s.id, s.code, s.name ORDER BY s.code;