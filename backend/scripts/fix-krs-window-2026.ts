import 'dotenv/config';
import { Pool } from 'pg';

/** Perpanjang jendela KRS Utama Ganjil 2026/2027 agar terbuka sekarang (Agustus 2026). */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    `UPDATE krs_periods
     SET start_date = '2026-07-15 00:00:00+07',
         end_date   = '2026-09-15 23:59:59+07'
     WHERE name = 'KRS Utama Ganjil 2026/2027' AND is_active
     RETURNING name, start_date, end_date`,
  );
  console.log('updated:', JSON.stringify(r.rows));
  const c = await pool.query(
    `SELECT (now() BETWEEN start_date AND end_date) AS open_now
     FROM krs_periods WHERE name='KRS Utama Ganjil 2026/2027'`,
  );
  console.log('open_now:', c.rows[0]?.open_now);
  await pool.end();
}
main();
