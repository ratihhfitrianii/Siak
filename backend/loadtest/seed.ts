/**
 * Seed data load test (T1.14) — akun mahasiswa lt-* + kelas LT-* + pool JSON untuk k6.
 *
 * Usage (dari backend/):
 *   DATABASE_URL="postgres://siak:siak_dev_password@localhost:5433/siak" \
 *     npx tsx loadtest/seed.ts [--users 5500] [--classes-per-prodi 300]
 *
 * Idempotent: menghapus data lt-%/LT-% yang ada sebelumnya, lalu insert ulang.
 * Output: backend/loadtest/classes.json (pool classId per prodi + meta) untuk k6.
 */
import { Pool } from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const USERS = Number(process.argv.find((a) => a.startsWith('--users='))?.split('=')[1] ?? 5500);
const CLASSES_PER_PRODI = Number(
  process.argv.find((a) => a.startsWith('--classes-per-prodi='))?.split('=')[1] ?? 300,
);
// Hash bcrypt untuk 'Mhs123!' — dari V20260801_009__fix_seed_passwords.sql (password dev, bukan secret).
const MHS_HASH = '$2b$12$YeUWmg0YaKQcUXlspGqbB.Iucw6CIR8i79cktdIRsQoSOod6QRepm';
const PRODI_IDS = [1, 2, 3, 4, 5, 6]; // TI, SI, MNJ, AKT, HKM, KN
const OUT = join(import.meta.dirname, 'classes.json');

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://siak:siak_dev_password@localhost:5433/siak',
  });

  const begin = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Cleanup idempotent (data load test saja) ──────────────────────────────
    // Urutan penting: krs_submissions (FK NO ACTION → students) harus dihapus
    // DULU sebelum users — VU yang sama bisa submit di run k6 sebelumnya.
    const delSubs = await client.query(
      `DELETE FROM krs_submissions
       WHERE student_id IN (
         SELECT s.id FROM students s JOIN users u ON u.id = s.user_id
         WHERE u.email LIKE 'lt-%@siak.local')`,
    );
    const delUsers = await client.query(`DELETE FROM users WHERE email LIKE 'lt-%@siak.local'`);
    const delClasses = await client.query(`DELETE FROM classes WHERE class_code LIKE 'LT-%'`);
    console.log(
      `cleanup: ${delSubs.rowCount} submission, ${delUsers.rowCount} user lt-*, ${delClasses.rowCount} kelas LT-*`,
    );

    // ── Users + students (mahasiswa load test) ────────────────────────────────
    const ROLE_MAHASISWA = 1;
    const rows: unknown[][] = [];
    const batch = 500;
    for (let i = 1; i <= USERS; i++) {
      const email = `lt-${String(i).padStart(6, '0')}@siak.local`;
      rows.push([email, MHS_HASH, `Load Test ${String(i).padStart(6, '0')}`, ROLE_MAHASISWA, false]);
      if (rows.length === batch) {
        await insertUsers(client, rows);
        rows.length = 0;
      }
    }
    if (rows.length) await insertUsers(client, rows);
    console.log(`users+students: ${USERS} dibuat`);

    // ── Kelas LT-* (kuota 30; 300/prodi → 54.000 slot) ────────────────────────
    const cur = await client.query(
      `SELECT id, prodi_id FROM curricula WHERE semester_id = 3 ORDER BY prodi_id, id`,
    );
    const curriculumByProdi = new Map<number, number[]>();
    for (const r of cur.rows) {
      const list = curriculumByProdi.get(Number(r.prodi_id)) ?? [];
      list.push(Number(r.id));
      curriculumByProdi.set(Number(r.prodi_id), list);
    }
    const lecturer = await client.query(`SELECT id FROM lecturers ORDER BY id LIMIT 1`);
    const lecturerId = Number(lecturer.rows[0].id);

    const classRows: unknown[][] = [];
    let seq = 0;
    for (const prodiId of PRODI_IDS) {
      const curricula = curriculumByProdi.get(prodiId) ?? [];
      if (curricula.length === 0) throw new Error(`tidak ada curriculum semester 3 untuk prodi ${prodiId}`);
      for (let k = 1; k <= CLASSES_PER_PRODI; k++) {
        seq += 1;
        const classCode = `LT-${prodiId}-${String(k).padStart(4, '0')}`;
        classRows.push([
          curricula[seq % curricula.length],
          classCode,
          lecturerId,
          30,
          0,
          'LT',
          1,
          '08:00',
          '09:40',
          true,
        ]);
      }
    }
    await insertClasses(client, classRows);
    // Ambil id nyata kelas LT-* per prodi untuk pool JSON
    const classIds = await client.query(
      `SELECT c.id, cur.prodi_id FROM classes c JOIN curricula cur ON cur.id = c.curriculum_id
       WHERE c.class_code LIKE 'LT-%' ORDER BY c.id`,
    );
    const finalPool = new Map<number, number[]>();
    for (const r of classIds.rows) {
      const list = finalPool.get(Number(r.prodi_id)) ?? [];
      list.push(Number(r.id));
      finalPool.set(Number(r.prodi_id), list);
    }
    console.log(`classes: ${classIds.rowCount} dibuat (${CLASSES_PER_PRODI}/prodi × ${PRODI_IDS.length} prodi)`);

    await client.query('COMMIT');

    // ── Output JSON untuk k6 ───────────────────────────────────────────────────
    const payload = {
      totalUsers: USERS,
      password: 'Mhs123!',
      prodi: Object.fromEntries([...finalPool.entries()].map(([k, v]) => [k, v])),
      classesPerProdi: CLASSES_PER_PRODI,
      generatedAt: new Date().toISOString(),
    };
    mkdirSync(import.meta.dirname, { recursive: true });
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(`classes.json: ${OUT} (${finalPool.size} prodi, total ${classIds.rowCount} kelas)`);
    console.log(`selesai dalam ${((Date.now() - begin) / 1000).toFixed(1)}s`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertUsers(client: { query: (q: string, p: unknown[]) => Promise<unknown> }, rows: unknown[][]): Promise<void> {
  const values: unknown[] = [];
  const placeholders = rows.map((_, i) => {
    const base = i * 5;
    values.push(rows[i][0], rows[i][1], rows[i][2], rows[i][3], rows[i][4]);
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`;
  });
  await client.query(
    `WITH new_users AS (
       INSERT INTO users (email, password_hash, full_name, role_id, must_change_password)
       VALUES ${placeholders.join(',')}
       RETURNING id, email
     )
     INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, status, is_active)
     SELECT u.id,
            'LT' || substr(u.email, 4, 6),
            (CAST(substr(u.email, 4, 6) AS int) - 1) % 6 + 1,
            3::smallint, 'SBMPTN', 'aktif', true
     FROM new_users u`,
    values,
  );
}

async function insertClasses(client: { query: (q: string, p: unknown[]) => Promise<unknown> }, rows: unknown[][]): Promise<void> {
  const values: unknown[] = [];
  const placeholders = rows.map((_, i) => {
    const base = i * 10;
    values.push(...rows[i]);
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
  });
  await client.query(
    `INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, room, day_of_week, start_time, end_time, is_active)
     VALUES ${placeholders.join(',')}`,
    values,
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
