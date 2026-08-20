/**
 * Seed data untuk testing check-in mahasiswa NIM 20241681.
 * - Cari sesi absensi yang sudah ada
 * - Cek apakah NIM 20241681 terdaftar di kelas tersebut (via krs_items)
 * - Jika belum → daftarkan (krs_submissions + krs_items)
 * - Buka sesi (is_open=true) agar bisa check-in
 *
 * Usage: npx tsx scripts/seed-checkin-test.ts (butuh DATABASE_URL di env)
 */
import 'dotenv/config';
import { pgPool } from '../src/lib/pg';

const NIM = '20241681';

async function main() {
  // 1. Cari mahasiswa dengan NIM 20241681
  const mhsRes = await pgPool.query(
    `SELECT s.id, s.user_id, s.nim, u.full_name, u.email
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE s.nim = $1 LIMIT 1`,
    [NIM],
  );
  if (mhsRes.rows.length === 0) {
    console.error(`Mahasiswa NIM ${NIM} tidak ditemukan di database.`);
    console.log('Pastikan mahasiswa sudah dibuat di Admin Master.');
    await pgPool.end();
    process.exit(1);
  }
  const mhs = mhsRes.rows[0];
  console.log(`Ditemukan: ${mhs.full_name} (NIM ${mhs.nim}, student_id=${mhs.id})`);

  // 2. Cari sesi absensi yang sudah ada
  const sessRes = await pgPool.query(
    `SELECT s.id, s.schedule_id, s.session_date, s.topic, s.is_open,
            sch.class_id, cl.class_code, co.code as course_code
     FROM attendance_sessions s
     JOIN schedules sch ON sch.id = s.schedule_id
     JOIN classes cl ON cl.id = sch.class_id
     JOIN curricula cur ON cur.id = cl.curriculum_id
     JOIN courses co ON co.id = cur.course_id
     ORDER BY s.id DESC
     LIMIT 5`,
  );
  if (sessRes.rows.length === 0) {
    console.error('Tidak ada sesi absensi di database. Buat dulu dari halaman dosen.');
    await pgPool.end();
    process.exit(1);
  }
  console.log(`\nDitemukan ${sessRes.rows.length} sesi absensi:`);
  for (const sess of sessRes.rows) {
    console.log(
      `  - ID: ${sess.id} | ${sess.course_code} (${sess.class_code}) | ${sess.session_date} | open=${sess.is_open}`,
    );
  }

  // 3. Ambil sesi pertama untuk test
  const target = sessRes.rows[0];
  const classId = Number(target.class_id);
  console.log(`\nMenggunakan sesi ID ${target.id} (${target.course_code}, class_id=${classId})`);

  // 4. Cek apakah mahasiswa sudah terdaftar di kelas ini
  const enrollRes = await pgPool.query(
    `SELECT 1 FROM krs_items ki
     JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
     WHERE ks.student_id = $1 AND ki.class_id = $2
       AND ks.status IN ('submitted', 'approved')
     LIMIT 1`,
    [mhs.id, classId],
  );
  if (enrollRes.rows.length > 0) {
    console.log(`Mahasiswa NIM ${NIM} sudah terdaftar di kelas ${target.class_code}.`);
  } else {
    console.log(
      `Mahasiswa NIM ${NIM} BELUM terdaftar di kelas ${target.class_code}. Mendaftarkan...`,
    );

    // Cari periode KRS aktif
    const periodRes = await pgPool.query(
      `SELECT id FROM krs_periods WHERE is_active
       AND now() BETWEEN start_date AND end_date
       ORDER BY id DESC LIMIT 1`,
    );
    if (periodRes.rows.length === 0) {
      console.error('Tidak ada periode KRS aktif.');
      await pgPool.end();
      process.exit(1);
    }
    const periodId = Number(periodRes.rows[0].id);

    // Cari submission KRS yang sudah ada untuk periode ini
    const existSubRes = await pgPool.query(
      `SELECT id FROM krs_submissions
       WHERE student_id = $1 AND krs_period_id = $2
       ORDER BY id DESC LIMIT 1`,
      [mhs.id, periodId],
    );

    let subId: number;
    if (existSubRes.rows.length > 0) {
      subId = Number(existSubRes.rows[0].id);
      console.log(`Menggunakan KRS submission yang sudah ada (id=${subId})`);
    } else {
      const subRes = await pgPool.query(
        `INSERT INTO krs_submissions (student_id, krs_period_id, status, is_locked)
         VALUES ($1, $2, 'draft', false)
         RETURNING id`,
        [mhs.id, periodId],
      );
      subId = Number(subRes.rows[0].id);
      console.log(`Membuat KRS submission baru (id=${subId})`);
    }

    // Tambah krs_items untuk kelas ini
    await pgPool.query(
      `INSERT INTO krs_items (krs_submission_id, class_id, is_confirmed)
       VALUES ($1, $2, false)`,
      [subId, classId],
    );

    // Update current_enrolled
    await pgPool.query(`UPDATE classes SET current_enrolled = current_enrolled + 1 WHERE id = $1`, [
      classId,
    ]);

    console.log(
      `Berhasil mendaftarkan NIM ${NIM} ke kelas ${target.class_code} (krs_submission_id=${subId})`,
    );
  }

  // 5. Buka sesi jika belum terbuka
  if (!target.is_open) {
    console.log(`Membuka sesi ID ${target.id}...`);
    await pgPool.query(
      `UPDATE attendance_sessions SET is_open = true, opened_at = now() WHERE id = $1`,
      [target.id],
    );
    console.log('Sesi dibuka! Mahasiswa bisa check-in sekarang.');
  } else {
    console.log(`Sesi ID ${target.id} sudah terbuka.`);
  }

  // 6. Ringkasan
  console.log('\n========== RINGKASAN ==========');
  console.log(`Mahasiswa : ${mhs.full_name} (NIM ${NIM})`);
  console.log(`Kelas     : ${target.course_code} (${target.class_code})`);
  console.log(`Sesi ID   : ${target.id}`);
  console.log(`Status    : ${target.is_open ? 'Terbuka ✅' : 'Dibuka sekarang ✅'}`);
  console.log(
    `\nCara test: Login sebagai mahasiswa NIM ${NIM} → /absensi/check-in → masukkan ID ${target.id}`,
  );
  console.log('================================');
}

main()
  .catch((err) => {
    console.error('Seed gagal:', err);
    process.exit(1);
  })
  .finally(() => pgPool.end());
