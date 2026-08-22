import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    `SELECT kp.name, kp.start_date, kp.end_date, kp.is_active,
            (now() BETWEEN kp.start_date AND kp.end_date) AS open_now
     FROM krs_periods kp
     WHERE kp.is_active
     ORDER BY kp.id DESC LIMIT 5`,
  );
  console.table(r.rows.map((x) => ({ name: x.name, open_now: x.open_now })));
  await pool.end();
}
main();
