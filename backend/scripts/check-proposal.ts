import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  // Check users
  const users = await pool.query(
    `SELECT id, email, full_name, role_id FROM users WHERE email = $1 OR email ILIKE $2`,
    ['mhs.TI_20232024_1@siak.local', '%ti1%'],
  );
  console.log('Users:', users.rows);

  // Check students
  const students = await pool.query(
    `SELECT s.*, u.email FROM students s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
    ['mhs.TI_20232024_1@siak.local'],
  );
  console.log('Student:', students.rows);

  // Check proposals
  const proposals = await pool.query(`SELECT * FROM skripsi_proposals`);
  console.log('Proposals:', proposals.rows);

  // Check supervisors
  const supervisors = await pool.query(`SELECT * FROM skripsi_proposal_supervisors`);
  console.log('Supervisors:', supervisors.rows);

  // Check lecturers
  const lecturers = await pool.query(
    `SELECT l.*, u.email FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.email ILIKE $1`,
    ['%ti1%'],
  );
  console.log('Lecturers TI1:', lecturers.rows);

  await pool.end();
}

check();
