import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = readFileSync(
    resolve(__dirname, '../migrations/V20260820_001__create_skripsi_tables.sql'),
    'utf-8',
  );
  await pool.query(sql);
  console.log('Migration V20260820_001 applied successfully');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
