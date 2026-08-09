// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
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
 * Kembalikan kuota kelas yang dipakai submission test (submit menaikkan
 * current_enrolled; tanpa restore, run berulang menguras kuota → CLASS_FULL).
 * Dipanggil SEBELUM krs_submissions dihapus (krs_items CASCADE).
 */
async function restoreClassQuota(studentId: number): Promise<void> {
  const items = await pgPool.query(
    `SELECT DISTINCT ki.class_id FROM krs_items ki
     JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
     WHERE ks.student_id = $1`,
    [studentId],
  );
  for (const r of items.rows) {
    await pgPool.query(
      `UPDATE classes SET current_enrolled = GREATEST(current_enrolled - 1, 0)
       WHERE id = $1`,
      [r.class_id],
    );
  }
}

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
    // T1.10: purge sisa data test dari run yang terputus (mis. grades T1.8-TEST-*).
    // findActivePeriod (produksi) memilih periode aktif TERBARU — sisa periode test
    // (is_active, id lebih tinggi dari seed) akan dipilih dan menggagalkan suite ini.
    // Urutan hapus sesuai FK: submissions (cascade krs_items+grades) → classes → periods.
    // Aman dihapus di sini: test:coverage berjalan --runInBand (sekuensial), jadi tidak
    // ada suite lain yang sedang memakai data test saat describe ini berjalan.
    await pgPool.query(
      `DELETE FROM krs_submissions WHERE krs_period_id IN (SELECT id FROM krs_periods WHERE name LIKE 'T1.%-TEST%')`,
    );
    await pgPool.query(
      `DELETE FROM classes WHERE class_code LIKE 'T18-%' OR class_code LIKE 'T19-%'`,
    );
    await pgPool.query(`DELETE FROM krs_periods WHERE name LIKE 'T1.%-TEST%'`);
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
      `SELECT kp.id, kp.semester_id FROM krs_periods kp
       WHERE kp.is_active AND now() BETWEEN kp.start_date AND kp.end_date
         AND kp.name NOT LIKE 'T1.%-TEST%'
       ORDER BY kp.id DESC LIMIT 1`,
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
      .send({ identifier: testEmail, password: testPassword })
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
    await restoreClassQuota(studentId);
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

  it('GET /krs/my/download → PDF (keluhan lama: KRS approved bisa di-download PDF)', async () => {
    const res = await request(app)
      .get('/api/v1/krs/my/download')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('filename="krs-');
    // Buffer PDF: header %PDF
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(1000);
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
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
      `SELECT kp.id, kp.semester_id FROM krs_periods kp
       WHERE kp.is_active AND now() BETWEEN kp.start_date AND kp.end_date
         AND kp.name NOT LIKE 'T1.%-TEST%'
       ORDER BY kp.id DESC LIMIT 1`,
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
      .send({ identifier: edgeEmail, password: edgePassword })
      .expect(200);
    edgeToken = login.body.data.accessToken;

    // Admin sistem (tidak punya studentId)
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@siak.local', password: 'Admin123!' })
      .expect(200);
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await restoreClassQuota(edgeStudentId);
    await pgPool.query('DELETE FROM krs_submissions WHERE student_id = $1', [edgeStudentId]);
    await pgPool.query('DELETE FROM students WHERE id = $1', [edgeStudentId]);
    await pgPool.query('DELETE FROM users WHERE email = $1', [edgeEmail]);
    // NOTE: pgPool.end() dipindah ke describe terakhir (T1.6) — pitfall pool tertutup dini.
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

describe('KRS Validasi Admin (T1.6)', () => {
  // mhsA → alur approve; mhsB → alur reject + revisi (AC-04c); mhsC → target reminder (AC-04d)
  const emails = ['krs-admin-a@siak.local', 'krs-admin-b@siak.local', 'krs-admin-c@siak.local'];
  const password = 'TestPass123!';
  const tokens: Record<string, string> = {};
  let prodiId: number;
  let semesterId: number;
  let adminAkademikToken: string;
  let adminKeuanganToken: string;
  let classes: { id: number }[];
  let submissionAId: number;
  let submissionBId: number;
  let notifAId: number;
  let mhsCUserId: number;

  const cleanup = async () => {
    for (const email of emails) {
      const sid = Number(
        (
          await pgPool.query(
            `SELECT s.id FROM students s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
            [email],
          )
        ).rows[0]?.id,
      );
      if (Number.isFinite(sid)) {
        await restoreClassQuota(sid);
      }
      await pgPool.query(
        `DELETE FROM krs_submissions WHERE student_id IN (SELECT id FROM students WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
        [email],
      );
      await pgPool.query(
        `DELETE FROM students WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
        [email],
      );
      // notifications.user_id → CASCADE saat user dihapus
      await pgPool.query('DELETE FROM users WHERE email = $1', [email]);
    }
    // T1.12 fix: recalculate current_enrolled for ALL classes to handle stale counts
    // from force-killed test runs (forceExit skips afterAll cleanup)
    await pgPool.query(`
      UPDATE classes SET current_enrolled = COALESCE(sub.count, 0)
      FROM (
        SELECT ki.class_id, COUNT(*) AS count
        FROM krs_items ki
        JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
        WHERE ks.status IN ('submitted', 'approved')
        GROUP BY ki.class_id
      ) sub
      WHERE classes.id = sub.class_id
    `);
    // Reset classes that have no active submissions to 0
    await pgPool.query(`
      UPDATE classes SET current_enrolled = 0
      WHERE current_enrolled > 0
        AND id NOT IN (
          SELECT DISTINCT ki.class_id FROM krs_items ki
          JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
          WHERE ks.status IN ('submitted', 'approved')
        )
    `);
  };

  // Timeout diperpanjang (30s): bcrypt cost 12 + cleanup + inserts bisa > 5s saat DB sibuk
  // (kegagalan hook timeout 5s default pernah terjadi saat full-suite paralel).
  beforeAll(async () => {
    await cleanup();
    const hash = await bcrypt.hash(password, 12);

    const prodiRes = await pgPool.query(
      'SELECT p.id FROM prodis p WHERE p.is_active ORDER BY p.id LIMIT 1',
    );
    prodiId = Number(prodiRes.rows[0].id);

    const periodRes = await pgPool.query(
      `SELECT kp.id, kp.semester_id FROM krs_periods kp
       WHERE kp.is_active AND now() BETWEEN kp.start_date AND kp.end_date
         AND kp.name NOT LIKE 'T1.%-TEST%'
       ORDER BY kp.id DESC LIMIT 1`,
    );
    semesterId = Number(periodRes.rows[0].semester_id);

    // 3 mahasiswa test
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i]!;
      const userRes = await pgPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
         VALUES ($1, $2, 'Mhs Admin ' || $3::text, (SELECT id FROM roles WHERE code='mahasiswa'), true)
         RETURNING id`,
        [email, hash, i],
      );
      const userId = Number(userRes.rows[0].id);
      if (i === 2) mhsCUserId = userId;
      await pgPool.query(
        `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
         VALUES ($1, $2, $3, (SELECT id FROM academic_years WHERE is_active LIMIT 1), 'Mandiri', true, 'aktif')`,
        [userId, `26991${i + 1}00`, prodiId],
      );

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: password })
        .expect(200);
      tokens[email] = login.body.data.accessToken;
    }

    // Admin seed (hash sudah benar via V009)
    const akadLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'akademik@siak.local', password: 'Admin123!' })
      .expect(200);
    adminAkademikToken = akadLogin.body.data.accessToken;
    const keuLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'keuangan@siak.local', password: 'Admin123!' })
      .expect(200);
    adminKeuanganToken = keuLogin.body.data.accessToken;

    const classesRes = await pgPool.query(
      `SELECT cl.id FROM classes cl
       JOIN curricula cur ON cur.id = cl.curriculum_id
       WHERE cur.prodi_id = $1 AND cur.semester_id = $2 AND cl.is_active
         AND cl.current_enrolled < cl.capacity
       ORDER BY cl.id LIMIT 4`,
      [prodiId, semesterId],
    );
    classes = classesRes.rows.map((r) => ({ id: Number(r.id) }));
  }, 30_000);

  afterAll(async () => {
    await cleanup();
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
  });

  it('GET /krs/admin/pending → 403 utk mahasiswa & admin_keuangan (RBAC krs.approve)', async () => {
    await request(app)
      .get('/api/v1/krs/admin/pending')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(403);
    await request(app)
      .get('/api/v1/krs/admin/pending')
      .set('Authorization', `Bearer ${adminKeuanganToken}`)
      .expect(403);
  });

  it('POST /krs/admin/:id/approve → 403 utk mahasiswa & admin_keuangan', async () => {
    await request(app)
      .post('/api/v1/krs/admin/1/approve')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(403);
    await request(app)
      .post('/api/v1/krs/admin/1/approve')
      .set('Authorization', `Bearer ${adminKeuanganToken}`)
      .expect(403);
  });

  it('mhsA submit → muncul di pending list Admin Akademik (AC-04)', async () => {
    const res = await request(app)
      .post('/api/v1/krs/submit')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .send({ classIds: classes.slice(0, 2).map((c) => c.id) })
      .expect(200);
    submissionAId = res.body.data.submissionId;

    const pending = await request(app)
      .get('/api/v1/krs/admin/pending')
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .expect(200);
    const mine = pending.body.data.items.find((it: { id: number }) => it.id === submissionAId);
    expect(mine).toBeDefined();
    expect(mine.nim).toBe('26991100');
    expect(mine.itemCount).toBe(2);
    expect(mine.totalCredits).toBeGreaterThan(0);
  });

  it('approve id tidak valid → 400; ghost id → 404', async () => {
    await request(app)
      .post('/api/v1/krs/admin/abc/approve')
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .expect(400);
    await request(app)
      .post('/api/v1/krs/admin/99999999/approve')
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .expect(404);
  });

  it('POST approve → approved + approved_by tercatat + notif krs_approved (AC-04)', async () => {
    const res = await request(app)
      .post(`/api/v1/krs/admin/${submissionAId}/approve`)
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .expect(200);
    expect(res.body.data.status).toBe('approved');

    const db = await pgPool.query(
      'SELECT status, approved_by, approved_at FROM krs_submissions WHERE id = $1',
      [submissionAId],
    );
    expect(db.rows[0].status).toBe('approved');
    expect(db.rows[0].approved_by).not.toBeNull();
    expect(db.rows[0].approved_at).not.toBeNull();

    const my = await request(app)
      .get('/api/v1/krs/my')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(200);
    expect(my.body.data.status).toBe('approved');
    expect(my.body.data.isLocked).toBe(true);

    const notifs = await request(app)
      .get('/api/v1/notifications/my')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(200);
    const approved = notifs.body.data.items.find(
      (n: { type: string }) => n.type === 'krs_approved',
    );
    expect(approved).toBeDefined();
    expect(approved.title).toBe('KRS Disetujui');
    notifAId = approved.id;
  });

  it('approve KRS yang sudah approved → 409 KRS_NOT_PENDING', async () => {
    const res = await request(app)
      .post(`/api/v1/krs/admin/${submissionAId}/approve`)
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .expect(409);
    expect(res.body.error.code).toBe('KRS_NOT_PENDING');
  });

  it('reject tanpa alasan / alasan pendek → 400', async () => {
    const submitB = await request(app)
      .post('/api/v1/krs/submit')
      .set('Authorization', `Bearer ${tokens[emails[1]!]}`)
      .send({ classIds: classes.slice(0, 2).map((c) => c.id) })
      .expect(200);
    submissionBId = submitB.body.data.submissionId;

    await request(app)
      .post(`/api/v1/krs/admin/${submissionBId}/reject`)
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .send({})
      .expect(400);
    await request(app)
      .post(`/api/v1/krs/admin/${submissionBId}/reject`)
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .send({ reason: 'x' })
      .expect(400);
  });

  it('POST reject + alasan → rejected, is_locked=false, notif krs_rejected (AC-04c)', async () => {
    const res = await request(app)
      .post(`/api/v1/krs/admin/${submissionBId}/reject`)
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .send({ reason: 'Mata kuliah tidak sesuai kurikulum angkatan' })
      .expect(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.rejectionReason).toContain('kurikulum');

    const db = await pgPool.query(
      'SELECT status, is_locked, rejection_reason FROM krs_submissions WHERE id = $1',
      [submissionBId],
    );
    expect(db.rows[0].status).toBe('rejected');
    expect(db.rows[0].is_locked).toBe(false);
    expect(db.rows[0].rejection_reason).toContain('kurikulum');

    const my = await request(app)
      .get('/api/v1/krs/my')
      .set('Authorization', `Bearer ${tokens[emails[1]!]}`)
      .expect(200);
    expect(my.body.data.status).toBe('rejected');
    expect(my.body.data.isLocked).toBe(false);
    expect(my.body.data.rejectionReason).toContain('kurikulum');

    const notifs = await request(app)
      .get('/api/v1/notifications/my')
      .set('Authorization', `Bearer ${tokens[emails[1]!]}`)
      .expect(200);
    const rejected = notifs.body.data.items.find(
      (n: { type: string }) => n.type === 'krs_rejected',
    );
    expect(rejected).toBeDefined();
    expect(rejected.message).toContain('kurikulum');
  });

  it('revisi setelah reject → draft + submit ulang berhasil, rejection di-reset (AC-04c)', async () => {
    // Re-query kelas yang masih ada kuota (bisa berubah karena submit sebelumnya)
    const freshClasses = await pgPool.query(
      `SELECT cl.id FROM classes cl
       JOIN curricula cur ON cur.id = cl.curriculum_id
       WHERE cur.prodi_id = $1 AND cur.semester_id = $2 AND cl.is_active
         AND cl.current_enrolled < cl.capacity
       ORDER BY cl.id LIMIT 3`,
      [prodiId, semesterId],
    );
    const classIds = freshClasses.rows.map((r) => Number(r.id));
    expect(classIds.length).toBeGreaterThanOrEqual(3);

    const draft = await request(app)
      .post('/api/v1/krs/draft')
      .set('Authorization', `Bearer ${tokens[emails[1]!]}`)
      .send({ classIds })
      .expect(200);
    expect(draft.body.data.status).toBe('draft');

    const submit = await request(app)
      .post('/api/v1/krs/submit')
      .set('Authorization', `Bearer ${tokens[emails[1]!]}`)
      .send({ classIds })
      .expect(200);
    expect(submit.body.data.status).toBe('submitted');
    expect(submit.body.data.locked).toBe(true);

    const db = await pgPool.query(
      'SELECT status, is_locked, rejection_reason, approved_by FROM krs_submissions WHERE id = $1',
      [submissionBId],
    );
    expect(db.rows[0].status).toBe('submitted');
    expect(db.rows[0].is_locked).toBe(true);
    expect(db.rows[0].rejection_reason).toBeNull();
    expect(db.rows[0].approved_by).toBeNull();
  });

  it('notifikasi: baca notif sendiri → is_read; notif orang lain → 404; id invalid → 400', async () => {
    const read = await request(app)
      .put(`/api/v1/notifications/${notifAId}/read`)
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(200);
    expect(read.body.data.isRead).toBe(true);

    // mhsB tidak boleh membaca notif milik mhsA (AC-10)
    await request(app)
      .put(`/api/v1/notifications/${notifAId}/read`)
      .set('Authorization', `Bearer ${tokens[emails[1]!]}`)
      .expect(404);

    await request(app)
      .put('/api/v1/notifications/abc/read')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(400);

    const my = await request(app)
      .get('/api/v1/notifications/my')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(200);
    expect(my.body.data.items.find((n: { id: number }) => n.id === notifAId).isRead).toBe(true);
  });

  it('remind-unfilled: 403 utk mahasiswa; admin trigger → mhsC mendapat notif; idempotent (AC-04d)', async () => {
    await request(app)
      .post('/api/v1/krs/admin/remind-unfilled')
      .set('Authorization', `Bearer ${tokens[emails[0]!]}`)
      .expect(403);

    // Sebelum trigger: mhsC belum punya krs_reminder
    const before = await pgPool.query(
      `SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'krs_reminder'`,
      [mhsCUserId],
    );
    expect(Number(before.rows[0].count)).toBe(0);

    const first = await request(app)
      .post('/api/v1/krs/admin/remind-unfilled')
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .expect(200);
    expect(first.body.data.notified).toBeGreaterThanOrEqual(1);

    const afterFirst = await pgPool.query(
      `SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'krs_reminder'`,
      [mhsCUserId],
    );
    expect(Number(afterFirst.rows[0].count)).toBe(1);

    // Idempotent: panggilan kedua tidak menambah notif baru
    const second = await request(app)
      .post('/api/v1/krs/admin/remind-unfilled')
      .set('Authorization', `Bearer ${adminAkademikToken}`)
      .expect(200);
    expect(second.body.data.notified).toBe(0);

    const afterSecond = await pgPool.query(
      `SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'krs_reminder'`,
      [mhsCUserId],
    );
    expect(Number(afterSecond.rows[0].count)).toBe(1);
  });
});
