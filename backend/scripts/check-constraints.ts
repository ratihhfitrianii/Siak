import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(`SELECT * FROM information_schema.table_constraints WHERE table_name='curricula' AND constraint_type='UNIQUE'`);
  console.table(r.rows);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });