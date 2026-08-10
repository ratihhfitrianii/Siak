/**
 * Seed data untuk E2E Playwright (T5.7) — skenario lengkap critical path:
 *   login, bayar (MyPayment), KRS (submitted + PDF), nilai (dosen), absensi (dosen), transkrip.
 *
 * User uji (password sama):
 *   e2e.mahasiswa@siak.local — prodi TI; payment LUNAS; KRS submitted (2 kelas); grades 2 matkul
 *   e2e.dosen@siak.local     — lecturer prodi TI; 1 kelas diampu (untuk absensi/nilai)
 *
 * Idempotent: DELETE data E2E lama lalu INSERT ulang — aman dijalankan berkali-kali.
 * Usage: npx tsx scripts/seed-e2e.ts   (butuh DATABASE_URL di env/.env)
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pgPool } from '../src/lib/pg';

const PASSWORD = 'E2ePass123!';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ---- Cari referensi: prodi TI, periode KRS aktif, semester periode ----
  const prodiRes = await pgPool.query(
    `SELECT id FROM prodis WHERE code = 'TI' AND is_active LIMIT 1`,
  );
  if (prodiRes.rows.length === 0) {
    console.error('Prodi TI tidak ditemukan — jalankan migrasi dulu.');
    process.exit(1);
  }
  const prodiId = Number(prodiRes.rows[0].id);

  const periodRes = await pgPool.query(
    `SELECT kp.id AS period_id, kp.semester_id
     FROM krs_periods kp
     WHERE kp.is_active AND now() BETWEEN kp.start_date AND kp.end_date
       AND kp.name NOT LIKE 'T1.%-TEST%'
     ORDER BY kp.id DESC LIMIT 1`,
  );
  if (periodRes.rows.length === 0) {
    console.error('Periode KRS aktif tidak ditemukan — jalankan migrasi dulu.');
    process.exit(1);
  }
  const periodId = Number(periodRes.rows[0].period_id);
  const semesterId = Number(periodRes.rows[0].semester_id);

  const ayRes = await pgPool.query(
    `SELECT id FROM academic_years WHERE code = '2023/2024' LIMIT 1`,
  );
  const academicYearId = ayRes.rows.length > 0 ? Number(ayRes.rows[0].id) : 1;

  // ---- Bersihkan data E2E lama (urutan FK) ----
  await pgPool.query(
    `DELETE FROM grades WHERE krs_item_id IN (
       SELECT ki.id FROM krs_items ki
       JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
       JOIN students st ON st.id = ks.student_id
       JOIN users u ON u.id = st.user_id
       WHERE u.email IN ('e2e.mahasiswa@siak.local', 'e2e.dosen@siak.local'))`,
  );
  await pgPool.query(
    `DELETE FROM krs_submissions WHERE student_id IN (
       SELECT st.id FROM students st JOIN users u ON u.id = st.user_id
       WHERE u.email IN ('e2e.mahasiswa@siak.local', 'e2e.dosen@siak.local'))`,
  ); // cascade krs_items
  await pgPool.query(
    `DELETE FROM payments WHERE student_id IN (
       SELECT st.id FROM students st JOIN users u ON u.id = st.user_id
       WHERE u.email = 'e2e.mahasiswa@siak.local')`,
  );
  await pgPool.query(
    `DELETE FROM classes WHERE lecturer_id IN (
       SELECT u.id FROM users u WHERE u.email = 'e2e.dosen@siak.local')`,
  );
  await pgPool.query(
    `DELETE FROM students WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e.mahasiswa@siak.local', 'e2e.dosen@siak.local'))`,
  );
  await pgPool.query(
    `DELETE FROM lecturers WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e.mahasiswa@siak.local', 'e2e.dosen@siak.local'))`,
  );
  await pgPool.query(
    `DELETE FROM users WHERE email IN ('e2e.mahasiswa@siak.local', 'e2e.dosen@siak.local')`,
  );

  // ---- User + profil ----
  const mhsUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
     VALUES ('e2e.mahasiswa@siak.local', $1, 'E2E Mahasiswa',
             (SELECT id FROM roles WHERE code='mahasiswa'), true, false)
     RETURNING id`,
    [passwordHash],
  );
  const mhsUserId = Number(mhsUser.rows[0].id);

  const dosenUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
     VALUES ('e2e.dosen@siak.local', $1, 'E2E Dosen',
             (SELECT id FROM roles WHERE code='dosen'), true, false)
     RETURNING id`,
    [passwordHash],
  );
  const dosenUserId = Number(dosenUser.rows[0].id);

  const mhs = await pgPool.query(
    `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
     VALUES ($1, 'E2E0001', $2, $3, 'Mandiri', true, 'aktif')
     RETURNING id`,
    [mhsUserId, prodiId, academicYearId],
  );
  const studentId = Number(mhs.rows[0].id);

  await pgPool.query(
    `INSERT INTO lecturers (user_id, nidn, nik, prodi_id, employment_type, is_active)
     VALUES ($1, 'E2E9001', 'E2EDS001', $2, 'tetap', true)`,
    [dosenUserId, prodiId],
  );

  // ---- Payment LUNAS (halaman MyPayment menampilkan status lunas) ----
  await pgPool.query(
    `INSERT INTO payments (student_id, semester_id, total_amount, paid_amount, status, due_date)
     VALUES ($1, $2, 970000, 970000, 'lunas', (now() - interval '1 day')::date)`,
    [studentId, semesterId],
  );

  // ---- Kelas: 2 kelas prodi TI utk KRS; 1 kelas di-assign ke dosen E2E ----
  const classesRes = await pgPool.query(
    `SELECT cl.id FROM classes cl
     JOIN curricula cur ON cur.id = cl.curriculum_id
     WHERE cur.prodi_id = $1 AND cur.semester_id = $2 AND cl.is_active
       AND cl.current_enrolled < cl.capacity
     ORDER BY cl.id
     LIMIT 2`,
    [prodiId, semesterId],
  );
  if (classesRes.rows.length < 2) {
    console.error('Kurang dari 2 kelas tersedia untuk prodi TI — seed KRS tidak bisa dibuat.');
    process.exit(1);
  }
  const classAId = Number(classesRes.rows[0].id);
  const classBId = Number(classesRes.rows[1].id);

  await pgPool.query(`UPDATE classes SET lecturer_id = $1 WHERE id = $2`, [dosenUserId, classAId]);

  // ---- KRS submitted + items + grades ----
  const submission = await pgPool.query(
    `INSERT INTO krs_submissions (student_id, krs_period_id, status, is_locked, submitted_at)
     VALUES ($1, $2, 'submitted', true, now())
     RETURNING id`,
    [studentId, periodId],
  );
  const submissionId = Number(submission.rows[0].id);

  const itemA = await pgPool.query(
    `INSERT INTO krs_items (krs_submission_id, class_id, is_confirmed)
     VALUES ($1, $2, false) RETURNING id`,
    [submissionId, classAId],
  );
  const itemB = await pgPool.query(
    `INSERT INTO krs_items (krs_submission_id, class_id, is_confirmed)
     VALUES ($1, $2, false) RETURNING id`,
    [submissionId, classBId],
  );

  for (const itemId of [Number(itemA.rows[0].id), Number(itemB.rows[0].id)]) {
    await pgPool.query(
      `INSERT INTO grades (krs_item_id, tugas_score, uts_score, uas_score, final_score, grade_letter, grade_point, input_by)
       VALUES ($1, 90, 85, 92, 89.5, 'A', 4.0, $2)`,
      [itemId, dosenUserId],
    );
  }

  console.log(
    `seed OK: e2e.mahasiswa@siak.local (payment lunas, KRS submitted ${classAId}/${classBId}, 2 grades)`,
  );
  console.log(`seed OK: e2e.dosen@siak.local (lecturer TI, kelas ${classAId} diampu)`);
  console.log('Seed E2E selesai. Password: E2ePass123!');
}

main()
  .catch((err) => {
    console.error('Seed E2E gagal:', err);
    process.exit(1);
  })
  .finally(() => pgPool.end());
