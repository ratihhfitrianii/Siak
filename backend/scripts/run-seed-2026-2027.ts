/**
 * Terapkan migration seed tahun akademik 2026/2027 ke DATABASE_URL (prod Neon).
 * Pemakaian: npx tsx scripts/run-seed-2026-2027.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const file = 'migrations/V20260822_001__seed_academic_year_2026_2027.sql';
  const sql = readFileSync(resolve(__dirname, '../', file), 'utf-8');
  try {
    await pool.query(sql);
    console.log(`OK: ${file} applied`);

    // Verifikasi hasil
    const ay = await pool.query(`SELECT code, is_active FROM academic_years ORDER BY code`);
    console.log(
      'academic_years:',
      ay.rows.map((r) => `${r.code}${r.is_active ? '*' : ''}`).join(', '),
    );

    const sem = await pool.query(
      `SELECT code, name, is_active FROM semesters WHERE code LIKE '2026%' OR is_active ORDER BY code`,
    );
    console.log('semesters:', sem.rows.map((r) => `${r.name}${r.is_active ? '*' : ''}`).join(', '));
  } catch (e) {
    console.error('FAIL:', (e as Error).message);
    process.exitCode = 1;
  }
  await pool.end();
}

main();
