// Find session dated 2026-09-08 + KRS state of the 5 target students
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Which session is 2026-09-08?
  const sess = await pool.query(
    `SELECT s.id, s.session_date, s.topic, s.is_open, sc.class_id, c.class_code,
            co.code AS course_code, sc.meeting_number
     FROM attendance_sessions s
     JOIN schedules sc ON sc.id = s.schedule_id
     JOIN classes c ON c.id = sc.class_id
     JOIN curricula cur ON cur.id = c.curriculum_id
     JOIN courses co ON co.id = cur.course_id
     WHERE s.session_date >= '2026-09-01' AND s.session_date <= '2026-09-10'
     ORDER BY s.id`,
  );
  console.log('SESSIONS around 8 Sep:', JSON.stringify(sess.rows));

  // KRS state of the 5 students
  const krs = await pool.query(
    `SELECT ks.id AS submission_id, ks.student_id, ks.krs_period_id, ks.status,
            s.nim, u.full_name
     FROM krs_submissions ks
     JOIN students s ON s.id = ks.student_id
     JOIN users u ON u.id = s.user_id
     WHERE ks.student_id IN (1692,1703,1714,1725,1736)
     ORDER BY ks.student_id, ks.id`,
  );
  console.log('KRS SUBMISSIONS:', JSON.stringify(krs.rows));

  // Their existing krs_items
  const items = await pool.query(
    `SELECT ki.krs_submission_id, ki.class_id, c.class_code, co.code AS course_code
     FROM krs_items ki
     JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
     JOIN classes c ON c.id = ki.class_id
     JOIN curricula cur ON cur.id = c.curriculum_id
     JOIN courses co ON co.id = cur.course_id
     WHERE ks.student_id IN (1692,1703,1714,1725,1736)
     ORDER BY ki.krs_submission_id`,
  );
  console.log('KRS ITEMS:', JSON.stringify(items.rows));

  await pool.end();
}

main();
