import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Check existing curricula for 2024/2025-1
  const cur = await pool.query(`
    SELECT c.id, c.prodi_id, c.semester_id, c.course_id, c.is_mandatory, c.semester_number,
           co.code as course_code, co.name as course_name, s.code as sem_code, p.code as prodi_code
    FROM curricula c
    JOIN courses co ON co.id = c.course_id
    JOIN semesters s ON s.id = c.semester_id
    JOIN prodis p ON p.id = c.prodi_id
    WHERE s.code = '2024/2025-1'
    ORDER BY c.id
  `);
  console.log('Curricula 2024/2025-1:', cur.rows.length);
  cur.rows.forEach((r) =>
    console.log(
      r.course_code,
      r.semester_number,
      r.is_mandatory,
      'prodi:',
      r.prodi_code,
      'sem:',
      r.sem_code,
    ),
  );

  // Check for 2026/2027-1
  const cur2 = await pool.query(`
    SELECT c.id, c.prodi_id, c.semester_id, c.course_id, c.is_mandatory, c.semester_number,
           co.code as course_code, co.name as course_name, s.code as sem_code, p.code as prodi_code
    FROM curricula c
    JOIN courses co ON co.id = c.course_id
    JOIN semesters s ON s.id = c.semester_id
    JOIN prodis p ON p.id = c.prodi_id
    WHERE s.code = '2026/2027-1'
    ORDER BY c.id
  `);
  console.log('\nCurricula 2026/2027-1:', cur2.rows.length);
  cur2.rows.forEach((r) =>
    console.log(
      r.course_code,
      r.semester_number,
      r.is_mandatory,
      'prodi:',
      r.prodi_code,
      'sem:',
      r.sem_code,
    ),
  );

  // Check lecturer_course_selections for 2024/2025-1
  const sel = await pool.query(`
    SELECT lcs.id, lcs.lecturer_id, lcs.semester_id, lcs.curriculum_id, lcs.status, lcs.priority,
           u.full_name as lecturer_name, co.code as course_code, s.code as sem_code
    FROM lecturer_course_selections lcs
    JOIN users u ON u.id = lcs.lecturer_id
    JOIN curricula c ON c.id = lcs.curriculum_id
    JOIN courses co ON co.id = c.course_id
    JOIN semesters s ON s.id = lcs.semester_id
    WHERE s.code = '2024/2025-1'
    ORDER BY lcs.id
  `);
  console.log('\nSelections 2024/2025-1:', sel.rows.length);
  sel.rows.forEach((r) =>
    console.log(r.lecturer_name, r.course_code, r.status, 'priority:', r.priority),
  );

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
