import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrations = [
    'V20260820_001__create_skripsi_tables.sql',
    'V20260820_002__add_multiple_supervisors.sql',
  ];

  for (const file of migrations) {
    const sql = readFileSync(resolve(__dirname, '../migrations', file), 'utf-8');
    try {
      await pool.query(sql);
      console.log(`Migration ${file} applied successfully`);
    } catch (err) {
      console.error(`Migration ${file} failed:`, err);
      throw err;
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
