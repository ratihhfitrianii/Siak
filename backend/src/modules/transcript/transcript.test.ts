// Env test SEBELUM import app (port 5433 = DB test; lihat infra/docker-compose.yml)
process.env.NODE_ENV = 'test';
// ??= (bukan =) agar env CI (port 5432) dihormati — di lokal default 5433.
// Pakai DATABASE_URL eksplisit (lib/pg butuh credential nyata; REDACTED di sini).
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';

// Import app AFTER env is set
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

/**
 * T2.4 — Transkrip (F-12, F-15, AC-03, AC-08)
 * - GET /transcript/my — mahasiswa lihat transkrip sendiri
 * - GET /transcript/student/:studentId — dosen wali
 * - GET /transcript/my/download — PDF
 * - Matkul diulang: hanya nilai terbaik masuk IPK
 */

const password = 'TestPass123!';
let app: Express;
let studentToken: string;
let studentId: number;
let studentUserId: number;
let waliToken: string;
let waliUserId: number;
let adminToken: string;

const ts = Date.now().toString().slice(-5);
const studentEmail = `tr-std-${ts}@student.siak.local`;
const waliEmail = `tr-wali-${ts}@siak.local`;
const adminEmail = 'admin@siak.local';
const adminPassword = 'Admin123!';

// Seed test users via bg
async function seed() {
  const hash = await bcrypt.hash(password, 10);

  // Student
  const studentUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, 'Transkrip Std', (SELECT id FROM roles WHERE code = 'mahasiswa'), true)
     RETURNING id`,
    [studentEmail, hash],
  );
  studentUserId = Number(studentUser.rows[0].id);

  const prodiRes = await pgPool.query(`SELECT id FROM prodis ORDER BY id LIMIT 1`);
  const ayRes = await pgPool.query(`SELECT id FROM academic_years ORDER BY id LIMIT 1`);
  const studentRes = await pgPool.query(
    `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type)
     VALUES ($1, $2, $3, $4, 'reguler')
     RETURNING id`,
    [studentUserId, `TR${ts}001`, Number(prodiRes.rows[0].id), Number(ayRes.rows[0].id)],
  );
  studentId = Number(studentRes.rows[0].id);

  // Wali (dosen, is_wali=true) di prodi yang sama
  const waliUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active, is_wali)
     VALUES ($1, $2, 'Transkrip Wali', (SELECT id FROM roles WHERE code = 'dosen'), true, true)
     RETURNING id`,
    [waliEmail, hash],
  );
  waliUserId = Number(waliUser.rows[0].id);
  await pgPool.query(
    `INSERT INTO lecturers (user_id, prodi_id) VALUES ($1, $2)`,
    [waliUserId, Number(prodiRes.rows[0].id)],
  );

  // Seed grades: 2 courses di semester pertama
  const periodRes = await pgPool.query(`SELECT kp.id, kp.semester_id FROM krs_periods kp ORDER BY kp.id LIMIT 1`);
  const periodId = Number(periodRes.rows[0].id);

  const krsRes = await pgPool.query(
    `INSERT INTO krs_submissions (student_id, krs_period_id, status)
     VALUES ($1, $2, 'disetujui') RETURNING id`,
    [studentId, periodId],
  );
  const krsSubmissionId = Number(krsRes.rows[0].id);

  // Course 1 (A) & Course 2 (C) — 2 kelas dari course BERBEDA (DISTINCT ON course_code)
  const classes = await pgPool.query(
    `SELECT DISTINCT ON (cl.code) c.id, cl.code, cl.credits
     FROM classes c JOIN curricula cur ON cur.id = c.curriculum_id JOIN courses cl ON cl.id = cur.course_id
     ORDER BY cl.code LIMIT 2`,
  );
  const item1 = await pgPool.query(
    `INSERT INTO krs_items (krs_submission_id, class_id) VALUES ($1, $2) RETURNING id`,
    [krsSubmissionId, Number(classes.rows[0].id)],
  );
  await pgPool.query(
    `INSERT INTO grades (krs_item_id, final_score, grade_letter, grade_point, input_by)
     VALUES ($1, 90, 'A', 4.0, $2)`,
    [Number(item1.rows[0].id), waliUserId],
  );

  // Course 2 (C, 2 SKS)
  const item2 = await pgPool.query(
    `INSERT INTO krs_items (krs_submission_id, class_id) VALUES ($1, $2) RETURNING id`,
    [krsSubmissionId, Number(classes.rows[1].id)],
  );
  await pgPool.query(
    `INSERT INTO grades (krs_item_id, final_score, grade_letter, grade_point, input_by)
     VALUES ($1, 60, 'C', 2.0, $2)`,
    [Number(item2.rows[0].id), waliUserId],
  );
}

beforeAll(async () => {
  app = createApp();
  await seed();

  const login = async (email: string, pw: string) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: pw }).expect(200);
    return res.body.data.accessToken as string;
  };

  studentToken = await login(studentEmail, password);
  waliToken = await login(waliEmail, password);
  adminToken = await login(adminEmail, adminPassword);
});

afterAll(async () => {
  // Cleanup (FK order)
  await pgPool.query(
    `DELETE FROM grades WHERE krs_item_id IN (SELECT ki.id FROM krs_items ki JOIN krs_submissions ks ON ks.id = ki.krs_submission_id WHERE ks.student_id = $1)`,
    [studentId],
  );
  await pgPool.query(
    `DELETE FROM krs_items WHERE krs_submission_id IN (SELECT ks.id FROM krs_submissions ks WHERE ks.student_id = $1)`,
    [studentId],
  );
  await pgPool.query(`DELETE FROM krs_submissions WHERE student_id = $1`, [studentId]);
  await pgPool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pgPool.query(`DELETE FROM users WHERE id = $1`, [studentUserId]);
  await pgPool.query(`DELETE FROM lecturers WHERE user_id = $1`, [waliUserId]);
  await pgPool.query(`DELETE FROM users WHERE id = $1`, [waliUserId]);
});

describe('T2.4 Transcript', () => {
  it('GET /transcript/my — mahasiswa dapat melihat transkrip sendiri', async () => {
    const res = await request(app).get('/api/v1/transcript/my').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student.nim).toBe(`TR${ts}001`);
    expect(Array.isArray(res.body.data.semesters)).toBe(true);
    expect(res.body.data.semesters.length).toBeGreaterThan(0);
    expect(typeof res.body.data.ipk).toBe('number');
  });

  it('GET /transcript/my — tanpa token → 401', async () => {
    const res = await request(app).get('/api/v1/transcript/my');
    expect(res.status).toBe(401);
  });

  it('GET /transcript/my/download — PDF download', async () => {
    const res = await request(app)
      .get('/api/v1/transcript/my/download')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('GET /transcript/student/:id — dosen wali bisa melihat binaan', async () => {
    const res = await request(app)
      .get(`/api/v1/transcript/student/${studentId}`)
      .set('Authorization', `Bearer ${waliToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.student.nim).toBe(`TR${ts}001`);
  });

  it('GET /transcript/student/:id — admin akademik bisa lihat', async () => {
    const res = await request(app)
      .get(`/api/v1/transcript/student/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.student.nim).toBe(`TR${ts}001`);
  });

  it('GET /transcript/student/:id — mahasiswa tidak bisa lihat orang lain', async () => {
    const res = await request(app)
      .get(`/api/v1/transcript/student/${studentId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    // student lacks transcript.view_mentee → 403
    expect([403, 404]).toContain(res.status);
  });

  it('Matkul diulang — hanya nilai terbaik IPK', async () => {
    // Tambah attempt kedua (lebih rendah) untuk course yang sama, di periode 2
    // (krs_submissions UNIQUE (student_id, krs_period_id) → periode beda)
    const periodRes = await pgPool.query(`SELECT kp.id FROM krs_periods kp ORDER BY kp.id LIMIT 1 OFFSET 1`);
    const periodId = Number(periodRes.rows[0].id);
    const krsRes = await pgPool.query(
      `INSERT INTO krs_submissions (student_id, krs_period_id, status) VALUES ($1, $2, 'disetujui') RETURNING id`,
      [studentId, periodId],
    );
    const subId = Number(krsRes.rows[0].id);
    const classRes = await pgPool.query(
      `SELECT c.id FROM classes c JOIN curricula cur ON cur.id = c.curriculum_id JOIN courses cl ON cl.id = cur.course_id ORDER BY cl.code LIMIT 1`,
    );
    const itemRes = await pgPool.query(
      `INSERT INTO krs_items (krs_submission_id, class_id) VALUES ($1, $2) RETURNING id`,
      [subId, Number(classRes.rows[0].id)],
    );
    const itemId = Number(itemRes.rows[0].id);
    await pgPool.query(
      `INSERT INTO grades (krs_item_id, final_score, grade_letter, grade_point, input_by) VALUES ($1, 55, 'C', 2.0, $2)`,
      [itemId, waliUserId],
    );

    const res = await request(app).get('/api/v1/transcript/my').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);

    const allCourses = res.body.data.semesters.flatMap((s: { courses: unknown[] }) => s.courses);
    const repeats = allCourses.filter(
      (c: { isRepeated: boolean }) => c.isRepeated,
    );
    expect(repeats.length).toBe(1);

    // course1 = 3 SKS A (4.0), course2 = 3 SKS C (2.0) → IPK = (12 + 6)/6 = 3.0
    // (attempt C diulang tidak dihitung)
    expect(res.body.data.ipk).toBeCloseTo(3.0, 1);

    await pgPool.query(`DELETE FROM grades WHERE krs_item_id = $1`, [itemId]);
    await pgPool.query(`DELETE FROM krs_items WHERE id = $1`, [itemId]);
    await pgPool.query(`DELETE FROM krs_submissions WHERE id = $1`, [subId]);
  });
});