import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = readFileSync(resolve(__dirname, '../migrations/V20260822_002__seed_courses_2026_2027.sql'), 'utf-8');
  await pool.query(sql);
  console.log('Migration applied');

  // Verify
  const cur = await pool.query(`
    SELECT c.id, c.prodi_id, c.semester_id, c.course_id, c.is_mandatory, c.semester_number,
           co.code as course_code, co.name as course_name, s.code as sem_code, p.code as prodi_code
    FROM curricula c
    JOIN courses co ON co.id = c.course_id
    JOIN semesters s ON s.id = c.semester_id
    JOIN prodis p ON p.id = c.prodi_id
    WHERE s.code = '2026/2027-1'
    ORDER BY c.id
  `);
  console.log('Curricula 2026/2027-1:', cur.rows.length);
  cur.rows.forEach(r => console.log(r.course_code, r.semester_number, r.is_mandatory, 'prodi:', r.prodi_code, 'sem:', r.sem_code));

  const cls = await pool.query(`
    SELECT cl.id, cl.class_code, cl.curriculum_id, cl.lecturer_id,
           co.code as course_code, s.code as sem_code, p.code as prodi_code
    FROM classes cl
    JOIN curricula cn ON cn.id = cl.curriculum_id
    JOIN courses co ON co.id = cn.course_id
    JOIN semesters s ON s.id = cn.semester_id
    JOIN prodis p ON p.id = cn.prodi_id
    WHERE s.code = '2026/2027-1'
    ORDER BY cl.id
  `);
  console.log('Classes 2026/2027-1:', cls.rows.length);
  cls.rows.forEach(r => console.log('  kelas', r.class_code, r.course_code, 'prodi:', r.prodi_code, 'sem:', r.sem_code));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });