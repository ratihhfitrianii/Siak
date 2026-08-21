// Cleanup: hapus record uji yang saya buat (student 1703, session 2)
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query(
    `DELETE FROM attendance_records WHERE session_id = 2 AND student_id = 1703 RETURNING id`,
  );
  console.log('Deleted records:', res.rows.map((r) => r.id));
  await pool.end();
}

main();
