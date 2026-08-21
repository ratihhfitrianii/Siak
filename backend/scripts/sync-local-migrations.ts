// Apply missing migrations to local dev DB (idempotent-ish: skip if relation exists)
import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function tableExists(name: string): Promise<boolean> {
  const r = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${name}`]);
  return r.rows[0].ok;
}

async function columnExists(table: string, col: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, col],
  );
  return r.rows.length > 0;
}

async function main() {
  const files = readdirSync(join(__dirname, '../migrations'))
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();

  for (const f of files) {
    try {
      // Heuristik skip berdasar isi file
      if (f.includes('create_announcements') && (await tableExists('announcements'))) {
        console.log(`${f}: SKIP (tabel announcements sudah ada)`);
        continue;
      }
      if (f.includes('add_student_profile_fields')) {
        const has = await columnExists('students', 'photo_url');
        if (has) {
          console.log(`${f}: SKIP (kolom photo_url sudah ada)`);
          continue;
        }
      }
      if (f.includes('add_payment_proof_url') && (await columnExists('payments', 'proof_url'))) {
        console.log(`${f}: SKIP (kolom proof_url sudah ada)`);
        continue;
      }
      if (
        f.includes('add_domicile_address') &&
        (await columnExists('students', 'domicile_address'))
      ) {
        console.log(`${f}: SKIP (kolom domicile_address sudah ada)`);
        continue;
      }
      if (f.includes('create_skripsi_tables') && (await tableExists('skripsi_proposals'))) {
        console.log(`${f}: SKIP (skripsi_proposals sudah ada)`);
        continue;
      }
      if (
        f.includes('add_multiple_supervisors') &&
        (await tableExists('skripsi_proposal_supervisors'))
      ) {
        console.log(`${f}: SKIP (junction sudah ada)`);
        continue;
      }

      const sql = readFileSync(join(__dirname, '../migrations', f), 'utf8');
      await pool.query(sql);
      console.log(`${f}: APPLIED`);
    } catch (err) {
      console.error(`${f}: ERROR ${(err as Error).message}`);
    }
  }
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
