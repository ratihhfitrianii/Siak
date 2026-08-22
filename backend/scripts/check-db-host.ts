import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return 'invalid-url';
    }
  })();
  console.log('host:', host);
  const pool = new Pool({ connectionString: url });
  const r = await pool.query(`SELECT count(*)::int AS n FROM semesters WHERE is_active`);
  console.log('active_semesters:', r.rows[0].n);
  await pool.end();
}
main();
