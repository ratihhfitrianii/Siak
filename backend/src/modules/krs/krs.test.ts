// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';

// Import app AFTER env is set
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';
import bcrypt from 'bcrypt';
import request from 'supertest';

const app = createApp();

/**
 * T1.5 KRS Core tests.
 * Setup: buat mahasiswa + kelas test di DB, login, jalankan alur draft → submit.
 * Memakai periode KRS aktif dari seed (V20260801_006) — DB dev docker :5433.
 */
describe('KRS Core (T1.5)', () => {
  const testEmail = 'krs-test-mhs@siak.local';
  const testPassword = 'TestPass123!';
  let accessToken: string;
  let studentId: number;
  let prodiId: number;
  let availableClasses: { id: number; courseCode: string }[] = [];
  let semesterId: number;

  beforeAll(async () => {
    // Defensive cleanup: hapus sisa submission/student/user dari run test sebelumnya
    await pgPool.query(
      `DELETE FROM krs_submissions WHERE student_id IN (SELECT id FROM students WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
      [testEmail],
    );
    await pgPool.query(
      `DELETE FROM students WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
      [testEmail],
    );
    await pgPool.query('DELETE FROM users WHERE email = $1', [testEmail]);

    const hash = await bcrypt.hash(testPassword, 12);

    // Ambil prodi + periode aktif dari seed
    const prodiRes = await pgPool.query(
      `SELECT p.id FROM prodis p WHERE p.is_active ORDER BY p.id LIMIT 1`,
    );
    prodiId = Number(prodiRes.rows[0].id);

    const periodRes = await pgPool.query(
      `SELECT kp.id, kp.semester_id FROM krs_periods kp WHERE kp.is_active AND now() BETWEEN kp.start_date AND kp.end_date ORDER BY kp.id DESC LIMIT 1`,
    );
    semesterId = Number(periodRes.rows[0].semester_id);

    // Buat user mahasiswa + students
    const userRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Mhs KRS Test', (SELECT id FROM roles WHERE code='mahasiswa'), true)
       RETURNING id`,
      [testEmail, hash],
    );
    const userId = Number(userRes.rows[0].id);

    const studentRes = await pgPool.query(
      `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
       VALUES ($1, '26990001', $2, (SELECT id FROM academic_years WHERE is_active LIMIT 1), 'Mandiri', true, 'aktif')
       RETURNING id`,
      [userId, prodiId],
    );
    studentId = Number(studentRes.rows[0].id);

    // Login
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    accessToken = login.body.data.accessToken;

    // Ambil kelas tersedia utk prodi ini (dari seed classes)
    const classesRes = await pgPool.query(
      `SELECT cl.id, c.code AS course_code
       FROM classes cl
       JOIN curricula cur ON cur.id = cl.curriculum_id
       JOIN courses c ON c.id = cur.course_id
       WHERE cur.prodi_id = $1 AND cur.semester_id = $2 AND cl.is_active
       ORDER BY c.code, cl.class_code`,
      [prodiId, semesterId],
    );
    availableClasses = classesRes.rows.map((r) => ({
      id: Number(r.id),
      courseCode: r.course_code,
    }));
  });

  afterAll(async () => {
    await pgPool.query('DELETE FROM krs_submissions WHERE student_id = $1', [studentId]);
    await pgPool.query('DELETE FROM students WHERE id = $1', [studentId]);
    await pgPool.query('DELETE FROM users WHERE email = $1', [testEmail]);
  });

  it('GET /krs/period → open dengan periode seed', async () => {
    const res = await request(app)
      .get('/api/v1/krs/period')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.status).toBe('open');
    expect(res.body.data.semesterCode).toBeTruthy();
  });

  it('GET /krs/available-classes → hanya kelas prodi mhs', async () => {
    const res = await request(app)
      .get('/api/v1/krs/available-classes')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    for (const item of res.body.data.items) {
      expect(item.quotaLeft).toBeGreaterThan(0);
    }
  });

  it('GET /krs/my → not_filled sebelum draft', async () => {
    const res = await request(app)
      .get('/api/v1/krs/my')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.status).toBe('not_filled');
  });

  it('POST /krs/draft → simpan draft', async () => {
    const classIds = availableClasses.slice(0, 2).map((c) => c.id);
    const res = await request(app)
      .post('/api/v1/krs/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classIds });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('draft');

    const my = await request(app)
      .get('/api/v1/krs/my')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(my.body.data.status).toBe('draft');
    expect(my.body.data.items.length).toBe(2);
    expect(my.body.data.totalCredits).toBeGreaterThan(0);
  });

  it('draft dengan classIds kosong → 400', async () => {
    await request(app)
      .post('/api/v1/krs/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classIds: [] })
      .expect(400);
  });

  it('draft dengan kelas prodi lain → 409 CLASS_NOT_AVAILABLE', async () => {
    const otherProdiClass = await pgPool.query(
      `SELECT cl.id FROM classes cl
       JOIN curricula cur ON cur.id = cl.curriculum_id
       WHERE cur.prodi_id <> $1 AND cl.is_active LIMIT 1`,
      [prodiId],
    );
    if (otherProdiClass.rows.length === 0) {
      return; // skip jika hanya ada 1 prodi dengan kelas
    }
    await request(app)
      .post('/api/v1/krs/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classIds: [Number(otherProdiClass.rows[0].id)] })
      .expect(409);
  });

  it('POST /krs/submit → submitted + locked (AC-07)', async () => {
    const classIds = availableClasses.slice(0, 2).map((c) => c.id);
    const res = await request(app)
      .post('/api/v1/krs/submit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classIds })
      .expect(200);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.locked).toBe(true);

    // Kuota naik di DB
    for (const c of classIds) {
      const q = await pgPool.query('SELECT current_enrolled FROM classes WHERE id = $1', [c]);
      expect(Number(q.rows[0].current_enrolled)).toBeGreaterThan(0);
    }
  });

  it('setelah submit → edit ditolak 409 KRS_LOCKED (AC-07)', async () => {
    await request(app)
      .post('/api/v1/krs/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classIds: [availableClasses[0]!.id] })
      .expect(409);
    await request(app)
      .post('/api/v1/krs/submit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classIds: [availableClasses[0]!.id] })
      .expect(409);
  });

  it('GET /krs/my → status submitted + locked', async () => {
    const res = await request(app)
      .get('/api/v1/krs/my')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.isLocked).toBe(true);
    expect(res.body.data.submittedAt).toBeTruthy();
  });

  it('tanpa token → 401', async () => {
    await request(app).get('/api/v1/krs/period').expect(401);
    await request(app).get('/api/v1/krs/available-classes').expect(401);
  });
});

describe('KRS Core edge cases (coverage branches)', () => {
  const edgeEmail = 'krs-edge-mhs@siak.local';
  const edgePassword = 'TestPass123!';
  let edgeToken: string;
  let edgeStudentId: number;
  let edgeProdiId: number;
  let edgePeriodId: number;
  let adminToken: string;

  beforeAll(async () => {
    // User mahasiswa kedua (belum pernah submit KRS)
    await pgPool.query(
      `DELETE FROM krs_submissions WHERE student_id IN (SELECT id FROM students WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
      [edgeEmail],
    );
    await pgPool.query(
      `DELETE FROM students WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
      [edgeEmail],
    );
    await pgPool.query('DELETE FROM users WHERE email = $1', [edgeEmail]);

    const hash = await bcrypt.hash(edgePassword, 12);
    const prodiRes = await pgPool.query(
      'SELECT p.id FROM prodis p WHERE p.is_active ORDER BY p.id LIMIT 1',
    );
    edgeProdiId = Number(prodiRes.rows[0].id);

    const periodRes = await pgPool.query(
      `SELECT kp.id, kp.semester_id FROM krs_periods kp WHERE kp.is_active AND now() BETWEEN kp.start_date AND kp.end_date ORDER BY kp.id DESC LIMIT 1`,
    );
    edgePeriodId = Number(periodRes.rows[0].id);

    const userRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Mhs KRS Edge', (SELECT id FROM roles WHERE code='mahasiswa'), true)
       RETURNING id`,
      [edgeEmail, hash],
    );
    const userId = Number(userRes.rows[0].id);

    const studentRes = await pgPool.query(
      `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
       VALUES ($1, '26990002', $2, (SELECT id FROM academic_years WHERE is_active LIMIT 1), 'Mandiri', true, 'aktif')
       RETURNING id`,
      [userId, edgeProdiId],
    );
    edgeStudentId = Number(studentRes.rows[0].id);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: edgeEmail, password: edgePassword })
      .expect(200);
    edgeToken = login.body.data.accessToken;

    // Admin sistem (tidak punya studentId)
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@siak.local', password: 'Admin123!' })
      .expect(200);
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await pgPool.query('DELETE FROM krs_submissions WHERE student_id = $1', [edgeStudentId]);
    await pgPool.query('DELETE FROM students WHERE id = $1', [edgeStudentId]);
    await pgPool.query('DELETE FROM users WHERE email = $1', [edgeEmail]);
    await pgPool.end();
  });

  it('admin_sistem tanpa studentId → available-classes 403 FORBIDDEN (requireStudent)', async () => {
    const res = await request(app)
      .get('/api/v1/krs/available-classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('submit dengan kelas prodi lain → 409 CLASS_NOT_AVAILABLE', async () => {
    const otherProdiClass = await pgPool.query(
      `SELECT cl.id FROM classes cl
       JOIN curricula cur ON cur.id = cl.curriculum_id
       WHERE cur.prodi_id <> $1 AND cl.is_active LIMIT 1`,
      [edgeProdiId],
    );
    if (otherProdiClass.rows.length === 0) return;
    const res = await request(app)
      .post('/api/v1/krs/submit')
      .set('Authorization', `Bearer ${edgeToken}`)
      .send({ classIds: [Number(otherProdiClass.rows[0].id)] })
      .expect(409);
    expect(res.body.error.code).toBe('CLASS_NOT_AVAILABLE');
  });

  it('submit dengan kelas penuh → 409 CLASS_FULL (AC-02, AC-04b)', async () => {
    const classRes = await pgPool.query(
      `SELECT cl.id FROM classes cl
       JOIN curricula cur ON cur.id = cl.curriculum_id
       WHERE cur.prodi_id = $1 AND cur.semester_id = (SELECT semester_id FROM krs_periods WHERE id = $2)
       ORDER BY cl.id LIMIT 1`,
      [edgeProdiId, edgePeriodId],
    );
    if (classRes.rows.length === 0) return;
    const classId = Number(classRes.rows[0].id);
    const orig = await pgPool.query(
      'SELECT capacity, current_enrolled FROM classes WHERE id = $1',
      [classId],
    );
    await pgPool.query('UPDATE classes SET capacity = 1, current_enrolled = 1 WHERE id = $1', [
      classId,
    ]);
    try {
      const res = await request(app)
        .post('/api/v1/krs/submit')
        .set('Authorization', `Bearer ${edgeToken}`)
        .send({ classIds: [classId] })
        .expect(409);
      expect(res.body.error.code).toBe('CLASS_FULL');
      expect(res.body.error.details).toBeDefined();
    } finally {
      await pgPool.query('UPDATE classes SET capacity = $2, current_enrolled = $3 WHERE id = $1', [
        classId,
        orig.rows[0].capacity,
        orig.rows[0].current_enrolled,
      ]);
    }
  });

  it('periode tutup → period closed, my no_period, semua mutasi 403 KRS_PERIOD_CLOSED', async () => {
    const periodRes = await pgPool.query(
      'SELECT is_active, start_date, end_date FROM krs_periods WHERE id = $1',
      [edgePeriodId],
    );
    const orig = periodRes.rows[0];
    await pgPool.query('UPDATE krs_periods SET is_active = false WHERE id = $1', [edgePeriodId]);
    try {
      const period = await request(app)
        .get('/api/v1/krs/period')
        .set('Authorization', `Bearer ${edgeToken}`)
        .expect(200);
      expect(period.body.data.status).toBe('closed');

      const my = await request(app)
        .get('/api/v1/krs/my')
        .set('Authorization', `Bearer ${edgeToken}`)
        .expect(200);
      expect(my.body.data.status).toBe('no_period');

      await request(app)
        .post('/api/v1/krs/draft')
        .set('Authorization', `Bearer ${edgeToken}`)
        .send({ classIds: [1] })
        .expect(403);

      await request(app)
        .post('/api/v1/krs/submit')
        .set('Authorization', `Bearer ${edgeToken}`)
        .send({ classIds: [1] })
        .expect(403);

      await request(app)
        .get('/api/v1/krs/available-classes')
        .set('Authorization', `Bearer ${edgeToken}`)
        .expect(403);
    } finally {
      await pgPool.query(
        'UPDATE krs_periods SET is_active = $2, start_date = $3, end_date = $4 WHERE id = $1',
        [edgePeriodId, orig.is_active, orig.start_date, orig.end_date],
      );
    }
  });
});
