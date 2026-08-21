// Seed 5 mahasiswa ke kelas 47 (TI103-A) via KRS chain — untuk uji absensi session 2.
// Mahasiswa sudah ada (1692,1703,1714,1725,1736); tinggal buat krs_submissions (period 1)
// + krs_items (class 47). Student 1692 sudah terdaftar → dilewati.
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const STUDENTS = [1703, 1714, 1725, 1736]; // 1692 sudah terdaftar di kelas 47
const CLASS_ID = 47;
const PERIOD_ID = 1; // KRS Utama Ganjil 2024/2025 (is_active)

async function main() {
  // Validasi kelas & period ada
  const cls = await pool.query(
    `SELECT c.id, c.class_code, co.code AS course_code FROM classes c
     JOIN curricula cur ON cur.id = c.curriculum_id
     JOIN courses co ON co.id = cur.course_id WHERE c.id = $1`,
    [CLASS_ID],
  );
  console.log('Kelas:', cls.rows[0]);

  for (const sid of STUDENTS) {
    const stu = await pool.query(
      `SELECT s.nim, u.full_name FROM students s JOIN users u ON u.id=s.user_id WHERE s.id=$1`,
      [sid],
    );
    if (stu.rows.length === 0) {
      console.log(`SKIP student ${sid}: tidak ditemukan`);
      continue;
    }

    // Cek partial unique index: satu submission submitted/approved per student.
    // Period 1 aktif → pakai status 'approved' hanya jika belum ada yang approved.
    const existingActive = await pool.query(
      `SELECT id, status FROM krs_submissions WHERE student_id=$1 AND status IN ('submitted','approved')`,
      [sid],
    );
    let submissionId: number;
    if (existingActive.rows.length > 0) {
      submissionId = existingActive.rows[0].id;
      console.log(
        `${stu.rows[0].nim} ${stu.rows[0].full_name}: pakai submission ${submissionId} (${existingActive.rows[0].status})`,
      );
    } else {
      const sub = await pool.query(
        `INSERT INTO krs_submissions (student_id, krs_period_id, status, is_locked)
         VALUES ($1, $2, 'approved', true)
         RETURNING id`,
        [sid, PERIOD_ID],
      );
      submissionId = sub.rows[0].id;
      console.log(
        `${stu.rows[0].nim} ${stu.rows[0].full_name}: submission BARU ${submissionId} (approved)`,
      );
    }

    // Item kelas 47 (unique krs_submission_id+class_id)
    const item = await pool.query(
      `INSERT INTO krs_items (krs_submission_id, class_id, is_confirmed)
       VALUES ($1, $2, true)
       ON CONFLICT (krs_submission_id, class_id) DO NOTHING
       RETURNING id`,
      [submissionId, CLASS_ID],
    );
    console.log(`  → krs_item class ${CLASS_ID}: ${item.rows.length ? 'BARU' : 'sudah ada'}`);
  }

  // Verifikasi akhir: siapa saja yang akan muncul di records session 2
  const final = await pool.query(
    `SELECT s.nim, u.full_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN krs_items ki ON ki.class_id = $1
     JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
     WHERE ks.student_id = s.id AND ks.status IN ('submitted','approved')
     ORDER BY u.full_name`,
    [CLASS_ID],
  );
  console.log('\nTERDAFTAR di kelas 47 (akan tampil di absensi):', JSON.stringify(final.rows));

  await pool.end();
}

main();
