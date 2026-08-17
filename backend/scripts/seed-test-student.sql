-- ============================================================
-- Seed: Mahasiswa aktif + beberapa semester IPS + pembayaran lunas
-- Untuk testing KRS di produksi
-- ============================================================

-- 0. Cari ID yang dibutuhkan
DO $$
DECLARE
  v_mhs_role_id  BIGINT;
  v_prodi_id     SMALLINT;
  v_acad_year_id SMALLINT;
  v_user_id      BIGINT;
  v_student_id   BIGINT;
  v_sem1_id      SMALLINT;  -- Ganjil 2024/2025
  v_sem2_id      SMALLINT;  -- Genap 2024/2025
  v_sem3_id      SMALLINT;  -- Ganjil 2025/2026
  v_sem4_id      SMALLINT;  -- Genap 2025/2026
  v_cur1_id      BIGINT;
  v_cur2_id      BIGINT;
  v_cur3_id      BIGINT;
  v_cur4_id      BIGINT;
  v_class1_id    BIGINT;
  v_class2_id    BIGINT;
  v_class3_id    BIGINT;
  v_class4_id    BIGINT;
  v_krs1_id      BIGINT;
  v_krs2_id      BIGINT;
  v_krs3_id      BIGINT;
  v_krs4_id      BIGINT;
  v_dosen_user   BIGINT;
BEGIN
  -- Role & Prodi
  SELECT id INTO v_mhs_role_id FROM roles WHERE code = 'mahasiswa';
  SELECT id INTO v_prodi_id FROM prodis WHERE name ILIKE '%informatika%' LIMIT 1;
  IF v_prodi_id IS NULL THEN
    SELECT id INTO v_prodi_id FROM prodis ORDER BY id LIMIT 1;
  END IF;

  -- Academic year aktif
  SELECT id INTO v_acad_year_id FROM academic_years WHERE is_active = true ORDER BY id DESC LIMIT 1;

  -- Semesters
  SELECT id INTO v_sem1_id FROM semesters WHERE code = '2024/2025-1';
  SELECT id INTO v_sem2_id FROM semesters WHERE code = '2024/2025-2';
  SELECT id INTO v_sem3_id FROM semesters WHERE code = '2025/2026-1';
  SELECT id INTO v_sem4_id FROM semesters WHERE code = '2025/2026-2';

  -- Jika semester tidak ada, fallback ke yang tersedia
  IF v_sem1_id IS NULL THEN
    SELECT id INTO v_sem1_id FROM semesters ORDER BY id LIMIT 1;
  END IF;
  IF v_sem2_id IS NULL THEN
    SELECT id INTO v_sem2_id FROM semesters ORDER BY id OFFSET 1 LIMIT 1;
  END IF;
  IF v_sem3_id IS NULL THEN
    SELECT id INTO v_sem3_id FROM semesters ORDER BY id OFFSET 2 LIMIT 1;
  END IF;
  IF v_sem4_id IS NULL THEN
    SELECT id INTO v_sem4_id FROM semesters ORDER BY id DESC LIMIT 1;
  END IF;

  -- Cari dosen yang sudah ada untuk assign kelas
  SELECT u.id INTO v_dosen_user
  FROM users u JOIN lecturers l ON l.user_id = u.id
  WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
  LIMIT 1;

  -- ================================================================
  -- 1. Buat User + Student
  -- ================================================================
  INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
  VALUES ('test.mahasiswa@siak.local',
          '$2b$10$mpELgMjn7dImJmu9YL402OPH.Q/b5IliUecrzLuz0RN0fvML1Lnje',
          'Rina Wulandari', v_mhs_role_id, true, false)
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM users WHERE email = 'test.mahasiswa@siak.local';
  END IF;

  INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
  VALUES (v_user_id, 'TEST25001', v_prodi_id, v_acad_year_id, 'SNMPTN', true, 'aktif')
  ON CONFLICT (nim) DO NOTHING
  RETURNING id INTO v_student_id;

  IF v_student_id IS NULL THEN
    SELECT id INTO v_student_id FROM students WHERE nim = 'TEST25001';
  END IF;

  RAISE NOTICE 'Student ID: %, User ID: %', v_student_id, v_user_id;

  -- ================================================================
  -- 2. Pembayaran LUNAS untuk semua semester
  -- ================================================================
  INSERT INTO payments (student_id, semester_id, total_amount, paid_amount, status, due_date)
  VALUES
    (v_student_id, v_sem1_id, 5000000, 5000000, 'lunas', CURRENT_DATE - 180),
    (v_student_id, v_sem2_id, 5000000, 5000000, 'lunas', CURRENT_DATE - 90),
    (v_student_id, v_sem3_id, 5000000, 5000000, 'lunas', CURRENT_DATE - 10),
    (v_student_id, v_sem4_id, 5000000, 5000000, 'lunas', CURRENT_DATE + 30)
  ON CONFLICT DO NOTHING;

  -- ================================================================
  -- 3. Buat kurikulum + kelas + KRS + nilai per semester
  -- ================================================================

  -- SEMESTER 1: Ganjil 2024/2025 — 3 MK (A, B+, B) → IPS 3.43
  -- Cari 3 course yang punya SKS
  FOR v_cur1_id IN
    SELECT cur.id FROM curricula cur
    WHERE cur.prodi_id = v_prodi_id AND cur.semester_id = v_sem1_id
    ORDER BY cur.id LIMIT 3
  LOOP
    -- Buat kelas per kurikulum
    INSERT INTO classes (curriculum_id, class_code, capacity, current_enrolled, lecturer_id, is_active)
    VALUES (v_cur1_id, 'TI-A1', 40, 1, v_dosen_user, true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_class1_id;

    IF v_class1_id IS NULL THEN
      SELECT id INTO v_class1_id FROM classes WHERE curriculum_id = v_cur1_id LIMIT 1;
    END IF;

    -- KRS submission
    INSERT INTO krs_submissions (student_id, krs_period_id, status, submitted_at)
    SELECT v_student_id, kp.id, 'approved', now() - interval '6 months'
    FROM krs_periods kp WHERE kp.semester_id = v_sem1_id
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_krs1_id;

    IF v_krs1_id IS NULL THEN
      SELECT id INTO v_krs1_id FROM krs_submissions
      WHERE student_id = v_student_id
        AND krs_period_id IN (SELECT id FROM krs_periods WHERE semester_id = v_sem1_id)
      LIMIT 1;
    END IF;

    -- KRS item
    IF v_class1_id IS NOT NULL AND v_krs1_id IS NOT NULL THEN
      INSERT INTO krs_items (krs_submission_id, class_id)
      VALUES (v_krs1_id, v_class1_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- SEMESTER 2: Genap 2024/2025 — 3 MK (A-, B+, B-) → IPS 3.20
  FOR v_cur2_id IN
    SELECT cur.id FROM curricula cur
    WHERE cur.prodi_id = v_prodi_id AND cur.semester_id = v_sem2_id
    ORDER BY cur.id LIMIT 3
  LOOP
    INSERT INTO classes (curriculum_id, class_code, capacity, current_enrolled, lecturer_id, is_active)
    VALUES (v_cur2_id, 'TI-B1', 40, 1, v_dosen_user, true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_class2_id;

    IF v_class2_id IS NULL THEN
      SELECT id INTO v_class2_id FROM classes WHERE curriculum_id = v_cur2_id LIMIT 1;
    END IF;

    INSERT INTO krs_submissions (student_id, krs_period_id, status, submitted_at)
    SELECT v_student_id, kp.id, 'approved', now() - interval '3 months'
    FROM krs_periods kp WHERE kp.semester_id = v_sem2_id
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_krs2_id;

    IF v_krs2_id IS NULL THEN
      SELECT id INTO v_krs2_id FROM krs_submissions
      WHERE student_id = v_student_id
        AND krs_period_id IN (SELECT id FROM krs_periods WHERE semester_id = v_sem2_id)
      LIMIT 1;
    END IF;

    IF v_class2_id IS NOT NULL AND v_krs2_id IS NOT NULL THEN
      INSERT INTO krs_items (krs_submission_id, class_id)
      VALUES (v_krs2_id, v_class2_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- SEMESTER 3: Ganjil 2025/2026 — 3 MK (A, A-, B+) → IPS 3.67
  FOR v_cur3_id IN
    SELECT cur.id FROM curricula cur
    WHERE cur.prodi_id = v_prodi_id AND cur.semester_id = v_sem3_id
    ORDER BY cur.id LIMIT 3
  LOOP
    INSERT INTO classes (curriculum_id, class_code, capacity, current_enrolled, lecturer_id, is_active)
    VALUES (v_cur3_id, 'TI-C1', 40, 1, v_dosen_user, true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_class3_id;

    IF v_class3_id IS NULL THEN
      SELECT id INTO v_class3_id FROM classes WHERE curriculum_id = v_cur3_id LIMIT 1;
    END IF;

    INSERT INTO krs_submissions (student_id, krs_period_id, status, submitted_at)
    SELECT v_student_id, kp.id, 'approved', now() - interval '15 days'
    FROM krs_periods kp WHERE kp.semester_id = v_sem3_id
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_krs3_id;

    IF v_krs3_id IS NULL THEN
      SELECT id INTO v_krs3_id FROM krs_submissions
      WHERE student_id = v_student_id
        AND krs_period_id IN (SELECT id FROM krs_periods WHERE semester_id = v_sem3_id)
      LIMIT 1;
    END IF;

    IF v_class3_id IS NOT NULL AND v_krs3_id IS NOT NULL THEN
      INSERT INTO krs_items (krs_submission_id, class_id)
      VALUES (v_krs3_id, v_class3_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- SEMESTER 4: Genap 2025/2026 — kosong (belum ambil KRS, semester depan)
  -- (biar bisa test KRS submission)

  RAISE NOTICE 'Seed selesai. Login: test.mahasiswa@siak.local / password123';
END $$;
