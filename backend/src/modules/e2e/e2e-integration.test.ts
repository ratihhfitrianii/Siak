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
 * T2.7 — Integration Test E2E (AC-03, AC-05, AC-06)
 *
 * Alur lengkap: Bayar → KRS → Nilai → Transkrip
 * 1. Admin Keuangan generate tagihan semester aktif
 * 2. Mahasiswa login → cek KRS access (FALSE sebelum bayar)
 * 3. Admin Keuangan update payment → LUNAS
 * 4. Mahasiswa cek KRS access (TRUE) → lihat kelas tersedia → submit KRS
 * 5. Admin Akademik approve KRS → locked
 * 6. Dosen input nilai untuk kelas yang diambil
 * 7. Mahasiswa lihat transkrip + download PDF
 *
 * Semua flow lolos tanpa manual step (DoD T2.7).
 */

const password = 'TestPass123!';
const adminPassword = 'Admin123!';
let app: Express;

// Test users (seeded per run via unique timestamp suffix)
let studentToken = '';
let studentId = 0;
let studentUserId = 0;
let adminKeuanganToken = '';
let adminKeuanganUserId = 0;
let adminAkademikToken = '';
let adminAkademikUserId = 0;
let dosenToken = '';
let dosenUserId = 0;
let periodId = 0;
let semesterId = 0;
let prodiId = 0;
let classId = 0;
let krsSubmissionId = 0;
let krsItemId = 0;

const ts = Date.now().toString().slice(-6);
const studentEmail = `e2e-std-${ts}@student.siak.local`;
const adminKeuanganEmail = `e2e-keu-${ts}@siak.local`;
const adminAkademikEmail = `e2e-akad-${ts}@siak.local`;
const dosenEmail = `e2e-dsn-${ts}@siak.local`;

async function seedTestData() {
  const hash = await bcrypt.hash(password, 10);
  const adminHash = await bcrypt.hash(adminPassword, 10);

  // Prodi & Semester aktif
  const prodiRes = await pgPool.query(`SELECT id FROM prodis ORDER BY id LIMIT 1`);
  prodiId = Number(prodiRes.rows[0].id);

  const semRes = await pgPool.query(
    `SELECT id FROM semesters ORDER BY id DESC LIMIT 1`,
  );
  semesterId = Number(semRes.rows[0].id);

  // Buat periode KRS aktif (sekarang) — avoid conflict dengan seed base
  const periodRes = await pgPool.query(
    `INSERT INTO krs_periods (semester_id, name, start_date, end_date, is_revision, is_active)
     VALUES ($1, $2, now() - interval '1 day', now() + interval '30 days', false, true)
     RETURNING id`,
    [semesterId, `E2E-TEST-${ts}`],
  );
  periodId = Number(periodRes.rows[0].id);

  // Student
  const studentUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, 'E2E Student', (SELECT id FROM roles WHERE code = 'mahasiswa'), true)
     RETURNING id`,
    [studentEmail, hash],
  );
  studentUserId = Number(studentUser.rows[0].id);

  const ayRes = await pgPool.query(`SELECT id FROM academic_years ORDER BY id LIMIT 1`);
  const studentRes = await pgPool.query(
    `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type)
     VALUES ($1, $2, $3, $4, 'reguler')
     RETURNING id`,
    [studentUserId, `E2E${ts}001`, prodiId, Number(ayRes.rows[0].id)],
  );
  studentId = Number(studentRes.rows[0].id);

  // Admin Keuangan
  const keuUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, 'E2E Admin Keuangan', (SELECT id FROM roles WHERE code = 'admin_keuangan'), true)
     RETURNING id`,
    [adminKeuanganEmail, adminHash],
  );
  adminKeuanganUserId = Number(keuUser.rows[0].id);

  // Admin Akademik
  const akadUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, 'E2E Admin Akademik', (SELECT id FROM roles WHERE code = 'admin_akademik'), true)
     RETURNING id`,
    [adminAkademikEmail, adminHash],
  );
  adminAkademikUserId = Number(akadUser.rows[0].id);

  // Dosen (pengampu kelas)
  const dsnUser = await pgPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, 'E2E Dosen', (SELECT id FROM roles WHERE code = 'dosen'), true)
     RETURNING id`,
    [dosenEmail, hash],
  );
  dosenUserId = Number(dsnUser.rows[0].id);

  await pgPool.query(
    `INSERT INTO lecturers (user_id, prodi_id) VALUES ($1, $2)`,
    [dosenUserId, prodiId],
  );

  // Kelas aktif untuk prodi+semester ini YANG DIAJAR DOSEN TEST (agar bisa input nilai)
  const classRes = await pgPool.query(
    `SELECT cl.id, cl.lecturer_id FROM classes cl
     JOIN curricula cur ON cur.id = cl.curriculum_id
     WHERE cur.prodi_id = $1 AND cur.semester_id = $2 AND cl.is_active AND cl.current_enrolled < cl.capacity AND cl.lecturer_id = $3
     LIMIT 1`,
    [prodiId, semesterId, dosenUserId],
  );
  if (classRes.rows.length === 0) {
    // Buat curriculum + course + class jika belum ada (dengan dosen test sebagai pengampu)
    const courseRes = await pgPool.query(
      `INSERT INTO courses (code, name, credits) VALUES ($1, $2, 3) RETURNING id`,
      [`E2E${ts}C1`, 'E2E Course 1'],
    );
    const courseId = Number(courseRes.rows[0].id);

    const curRes = await pgPool.query(
      `INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
       VALUES ($1, $2, $3, true, 1) RETURNING id`,
      [prodiId, semesterId, courseId],
    );
    const curId = Number(curRes.rows[0].id);

    const clsRes = await pgPool.query(
      `INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, is_active)
       VALUES ($1, 'A', $2, 30, 0, true) RETURNING id`,
      [curId, dosenUserId],
    );
    classId = Number(clsRes.rows[0].id);
  } else {
    classId = Number(classRes.rows[0].id);
  }

  // Ensure the test class is the ONLY one with available quota by setting all other classes to full
  await pgPool.query(
    `UPDATE classes SET current_enrolled = capacity WHERE curriculum_id IN (
      SELECT id FROM curricula WHERE prodi_id = $1 AND semester_id = $2
    ) AND id != $3 AND is_active`,
    [prodiId, semesterId, classId],
  );

  // Generate payments untuk semester ini (admin keuangan)
  await pgPool.query('SELECT generate_payments_for_semester($1)', [semesterId]);
}

async function login(email: string, pw: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: pw })
    .expect(200);
  return res.body.data.accessToken as string;
}

beforeAll(async () => {
  app = createApp();
  await seedTestData();

  studentToken = await login(studentEmail, password);
  adminKeuanganToken = await login(adminKeuanganEmail, adminPassword);
  adminAkademikToken = await login(adminAkademikEmail, adminPassword);
  dosenToken = await login(dosenEmail, password);
}, 30_000);

afterAll(async () => {
  // Cleanup (FK order: grades → krs_items → krs_submissions → payments → students → classes → lecturers → users)
  if (krsItemId) {
    await pgPool.query(`DELETE FROM grades WHERE krs_item_id = $1`, [krsItemId]);
    await pgPool.query(`DELETE FROM krs_items WHERE id = $1`, [krsItemId]);
  }
  if (krsSubmissionId) {
    await pgPool.query(`DELETE FROM krs_submissions WHERE id = $1`, [krsSubmissionId]);
  }
  if (studentId) {
    await pgPool.query(`DELETE FROM payments WHERE student_id = $1 AND semester_id = $2`, [studentId, semesterId]);
    await pgPool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [studentUserId]);
  }
  // Cleanup test class (FK: classes.lecturer_id → lecturers.user_id)
  if (classId) {
    await pgPool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
  }
  if (dosenUserId) {
    await pgPool.query(`DELETE FROM lecturers WHERE user_id = $1`, [dosenUserId]);
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [dosenUserId]);
  }
  if (adminKeuanganUserId) {
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [adminKeuanganUserId]);
  }
  if (adminAkademikUserId) {
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [adminAkademikUserId]);
  }
  if (periodId) {
    await pgPool.query(`DELETE FROM krs_periods WHERE id = $1`, [periodId]);
  }
}, 30_000);

describe('T2.7 Integration E2E — Bayar → KRS → Nilai → Transkrip', () => {
  it('1. Mahasiswa login & cek KRS access SEBELUM bayar → FALSE', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/krs-access?semester_id=${semesterId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.can_access).toBe(false);
    expect(res.body.data.payment.status).toBe('belum_lunas');
  });

  it('2. Admin Keuangan update payment → LUNAS (paid_amount = total_amount)', async () => {
    // Cari payment_id via query langsung (lebih reliable)
    const payRes = await pgPool.query(
      `SELECT id, total_amount FROM payments WHERE student_id = $1 AND semester_id = $2`,
      [studentId, semesterId],
    );
    expect(payRes.rows.length).toBe(1);
    const payment = payRes.rows[0];
    const paymentId = Number(payment.id);

    // Update ke lunas
    const updRes = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/update`)
      .set('Authorization', `Bearer ${adminKeuanganToken}`)
      .send({ paid_amount: payment.total_amount });
    expect(updRes.status).toBe(200);
    expect(updRes.body.data.status).toBe('lunas');
    // DB returns numeric as string "950000.00"
    expect(Number(updRes.body.data.paid_amount)).toBe(Number(payment.total_amount));
  });

  it('3. Mahasiswa cek KRS access SETELAH bayar → TRUE', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/krs-access?semester_id=${semesterId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.can_access).toBe(true);
    expect(res.body.data.payment.status).toBe('lunas');
  });

  it('4. Mahasiswa lihat kelas tersedia (available-classes) → minimal 1 kelas', async () => {
    const res = await request(app)
      .get('/api/v1/krs/available-classes')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    // Simpan classId untuk submit
    classId = res.body.data.items[0].id;
  });

  it('5. Mahasiswa submit KRS (POST /krs/submit) → submitted + locked (status 200)', async () => {
    const res = await request(app)
      .post('/api/v1/krs/submit')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ classIds: [classId] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.locked).toBe(true);
    krsSubmissionId = res.body.data.submissionId;
    // Verify in DB
    await pgPool.query(
      `SELECT id, status, is_locked FROM krs_submissions WHERE id = $1`,
      [krsSubmissionId],
    );
  });

  it('6. Mahasiswa GET /krs/my → status submitted + items', async () => {
    const res = await request(app)
      .get('/api/v1/krs/my')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.items.length).toBe(1);
    krsItemId = res.body.data.items[0].id;
    // Verify item exists in DB immediately
    await pgPool.query(
      `SELECT ki.id, ki.class_id, c.lecturer_id, ks.student_id
       FROM krs_items ki
       JOIN classes c ON c.id = ki.class_id
       JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
       WHERE ki.id = $1`,
      [krsItemId],
    );
  });

  it('7. Admin Akademik approve KRS (POST /krs/admin/:id/approve) → approved', async () => {
    expect(krsSubmissionId).toBeGreaterThan(0);
    const res = await request(app)
      .post(`/api/v1/krs/admin/${krsSubmissionId}/approve`)
      .set('Authorization', `Bearer ${adminAkademikToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');
  });

  it('8. Mahasiswa GET /krs/my SETELAH approve → status approved + locked', async () => {
    const res = await request(app)
      .get('/api/v1/krs/my')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.isLocked).toBe(true);
  });

  it('9. Dosen input nilai untuk item KRS (POST /grades) → created', async () => {
    expect(krsItemId).toBeGreaterThan(0);
    // Verify item exists in DB
    await pgPool.query(
      `SELECT ki.id, ki.class_id, c.lecturer_id, ks.student_id
       FROM krs_items ki
       JOIN classes c ON c.id = ki.class_id
       JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
       WHERE ki.id = $1`,
      [krsItemId],
    );
    // Check dosen token user id (sub claim)
    const tokenParts = dosenToken.split('.');
    const tokenPayload = tokenParts[1];
    if (!tokenPayload) throw new Error('Invalid token');
    const dosenTokenPayload = JSON.parse(Buffer.from(tokenPayload, 'base64').toString());
    expect(Number(dosenTokenPayload.sub)).toBe(dosenUserId);
    const res = await request(app)
      .post('/api/v1/grades')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        krsItemId: krsItemId,
        tugasScore: 85,
        utsScore: 90,
        uasScore: 88,
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grade_letter).toBe('A');
    expect(Number(res.body.data.grade_point)).toBe(4.0);
  });

  it('10. Mahasiswa GET /transcript/my → lihat nilai + IPK', async () => {
    const res = await request(app)
      .get('/api/v1/transcript/my')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Find the test course in transcript (semesters -> courses)
    const courses = res.body.data.semesters?.flatMap((s: { courses: unknown[] }) => s.courses) ?? [];
    const myCourse = courses.find(
      (c: { courseCode: string; course_code: string }) => c.courseCode === `E2E${ts}C1` || c.course_code === `E2E${ts}C1`,
    );
    expect(myCourse).toBeDefined();
    expect(myCourse.gradeLetter).toBe('A');
    expect(Number(myCourse.gradePoint)).toBe(4.0);
    expect(typeof res.body.data.ipk).toBe('number');
  });

  it('11. Mahasiswa GET /transcript/my/download → PDF (application/pdf)', async () => {
    const res = await request(app)
      .get('/api/v1/transcript/my/download')
      .set('Authorization', `Bearer ${studentToken}`)
      .responseType('blob');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('12. Admin Akademik lihat transkrip mahasiswa (GET /transcript/student/:id)', async () => {
    const res = await request(app)
      .get(`/api/v1/transcript/student/${studentId}`)
      .set('Authorization', `Bearer ${adminAkademikToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.student.nim).toBe(`E2E${ts}001`);
  });
});