-- ============================================================
-- Reset & Insert Grades untuk TEST25001
-- IP bervariasi per semester
-- ============================================================

-- 1. Hapus semua grades lama
DELETE FROM grades
WHERE krs_item_id IN (
  SELECT ki.id FROM krs_items ki
  JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
  WHERE ks.student_id = (SELECT id FROM students WHERE nim = 'TEST25001')
);

-- 2. Insert grades baru
DO $$
DECLARE
  v_student_id BIGINT;
  v_dosen_user BIGINT;
  v_item       RECORD;
  v_gp         NUMERIC(3,2);
  v_fs         NUMERIC(5,2);
  v_gl         TEXT;
  v_grade_num  INT := 0;
BEGIN
  SELECT id INTO v_student_id FROM students WHERE nim = 'TEST25001';
  SELECT u.id INTO v_dosen_user
  FROM users u JOIN lecturers l ON l.user_id = u.id
  WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen') LIMIT 1;

  FOR v_item IN
    SELECT ki.id, kp.semester_id,
           ROW_NUMBER() OVER (PARTITION BY kp.semester_id ORDER BY ki.id) as rn
    FROM krs_items ki
    JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
    JOIN krs_periods kp ON kp.id = ks.krs_period_id
    WHERE ks.student_id = v_student_id
    ORDER BY kp.semester_id, ki.id
  LOOP
    v_gp := CASE (v_item.semester_id * 10 + v_item.rn) % 15
      WHEN 0  THEN 3.80
      WHEN 1  THEN 4.00
      WHEN 2  THEN 3.70
      WHEN 3  THEN 3.70
      WHEN 4  THEN 3.30
      WHEN 5  THEN 3.50
      WHEN 6  THEN 3.70
      WHEN 7  THEN 3.30
      WHEN 8  THEN 3.50
      WHEN 9  THEN 4.00
      WHEN 10 THEN 3.80
      WHEN 11 THEN 3.90
      WHEN 12 THEN 3.70
      WHEN 13 THEN 3.40
      WHEN 14 THEN 3.60
    END;

    v_fs := v_gp * 25;
    v_gl := CASE
      WHEN v_gp >= 3.85 THEN 'A'
      WHEN v_gp >= 3.50 THEN 'A-'
      WHEN v_gp >= 3.15 THEN 'B+'
      WHEN v_gp >= 2.85 THEN 'B'
      WHEN v_gp >= 2.50 THEN 'B-'
      ELSE 'C+'
    END;

    INSERT INTO grades (krs_item_id, tugas_score, uts_score, uas_score,
                        final_score, grade_letter, grade_point, input_by)
    VALUES (v_item.id, v_fs*0.95, v_fs, v_fs*1.05, v_fs, v_gl, v_gp, v_dosen_user);
    v_grade_num := v_grade_num + 1;
  END LOOP;

  RAISE NOTICE '✅ Grades: %', v_grade_num;
END $$;

-- 3. Verifikasi
SELECT s.code as semester, s.name, COUNT(g.id) as mk,
       ROUND(AVG(g.grade_point), 2) as ips
FROM grades g
JOIN krs_items ki ON ki.id = g.krs_item_id
JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
JOIN krs_periods kp ON kp.id = ks.krs_period_id
JOIN semesters s ON s.id = kp.semester_id
WHERE ks.student_id = (SELECT id FROM students WHERE nim = 'TEST25001')
GROUP BY s.id, s.code, s.name ORDER BY s.code;