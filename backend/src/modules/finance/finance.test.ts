// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-secret-key-min-16-chars';
process.env.BCRYPT_ROUNDS ??= '4';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

describe('T2.6 Finance — Payments & KRS Gate', () => {
  let app: ReturnType<typeof createApp>;
  let keuanganToken: string;
  let sistemToken: string;
  let mhsToken: string;
  let mhsToken2: string;
  let dosenToken: string;
  let ghostMhsToken: string;
  let ghostMhsUserId: number;
  let studentId: number;
  let createdStudentUserId: number;
  let semesterId: number;
  let semesterId2: number;
  let generateSemesterId: number | null = null;
  let paymentId1: number; // studentId × semesterId (500.000)
  let paymentId2: number; // studentId × semesterId2 (300.000)
  const createdPaymentIds: number[] = [];

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: password });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    app = createApp({}, { waitingRoom: null });

    // Admin keuangan & admin sistem
    keuanganToken = await login('keuangan@siak.local', 'Admin123!');
    sistemToken = await login('admin@siak.local', 'Admin123!');

    // Dosen (untuk deny 403 — tidak punya payment.* / krs.fill)
    const dosenRes = await pgPool.query(
      `SELECT u.email FROM users u
       JOIN lecturers l ON l.user_id = u.id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active
       ORDER BY u.id LIMIT 1`,
    );
    dosenToken = await login(dosenRes.rows[0].email, 'Dosen123!');

    // Dua mahasiswa: #1 dari seed, #2 buatan sendiri (dijamin 0 tagihan di DB mana pun)
    const mhsRes = await pgPool.query(
      `SELECT s.id, u.email FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE s.is_active AND u.is_active AND u.role_id = (SELECT id FROM roles WHERE code = 'mahasiswa')
       ORDER BY s.id LIMIT 1`,
    );
    if (mhsRes.rows.length < 1) throw new Error('Perlu minimal 1 mahasiswa aktif');
    studentId = Number(mhsRes.rows[0].id);
    mhsToken = await login(mhsRes.rows[0].email, 'Mhs123!');
    const mhs2Email = `fin-test-${Date.now()}@test.local`;
    const mhs2Hash = await bcrypt.hash('Mhs123!', 4);
    const mhs2UserRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Mhs Finance Test', (SELECT id FROM roles WHERE code='mahasiswa'), true)
       RETURNING id`,
      [mhs2Email, mhs2Hash],
    );
    createdStudentUserId = Number(mhs2UserRes.rows[0].id);
    const nim = `FIN${Date.now()}`.slice(0, 20);
    await pgPool.query(
      `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active)
       VALUES ($1, $2, (SELECT id FROM prodis LIMIT 1), (SELECT id FROM academic_years LIMIT 1), 'Mandiri', true)`,
      [createdStudentUserId, nim],
    );
    mhsToken2 = await login(mhs2Email, 'Mhs123!');

    // Ghost mahasiswa (user tanpa row students) — untuk branch requireStudent → 403
    const ghostEmail = `ghost-finance-${Date.now()}@test.local`;
    const ghostHash = await bcrypt.hash('Mhs123!', 4);
    const ghostRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Ghost Mhs Finance', (SELECT id FROM roles WHERE code='mahasiswa'), true)
       RETURNING id`,
      [ghostEmail, ghostHash],
    );
    ghostMhsUserId = Number(ghostRes.rows[0].id);
    ghostMhsToken = await login(ghostEmail, 'Mhs123!');

    // Semester aktif + non-aktif
    const semRes = await pgPool.query(`SELECT id FROM semesters WHERE is_active LIMIT 1`);
    semesterId = Number(semRes.rows[0].id);
    const semRes2 = await pgPool.query(
      `SELECT id FROM semesters WHERE NOT is_active ORDER BY id LIMIT 1`,
    );
    semesterId2 = Number(semRes2.rows[0].id);

    // Payment buatan sendiri (self-sufficient — CI DB fresh, seed tidak membuat payments)
    const p1 = await pgPool.query(
      `INSERT INTO payments (student_id, semester_id, total_amount, paid_amount, status, due_date)
       VALUES ($1, $2, 500000, 0, 'belum_lunas', CURRENT_DATE + 30) RETURNING id`,
      [studentId, semesterId],
    );
    paymentId1 = Number(p1.rows[0].id);
    createdPaymentIds.push(paymentId1);
    await pgPool.query(
      `INSERT INTO payment_items (payment_id, type, description, amount, is_mandatory)
       VALUES ($1, 'SPP', 'SPP Test Semester', 500000, true)`,
      [paymentId1],
    );

    const p2 = await pgPool.query(
      `INSERT INTO payments (student_id, semester_id, total_amount, paid_amount, status, due_date)
       VALUES ($1, $2, 300000, 0, 'belum_lunas', CURRENT_DATE + 30) RETURNING id`,
      [studentId, semesterId2],
    );
    paymentId2 = Number(p2.rows[0].id);
    createdPaymentIds.push(paymentId2);

    // Semester tanpa payment — untuk test POST /generate (cleanup aman, tidak menyentuh data lain)
    const genRes = await pgPool.query(
      `SELECT s.id FROM semesters s
       WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.semester_id = s.id)
       LIMIT 1`,
    );
    if (genRes.rows.length > 0) generateSemesterId = Number(genRes.rows[0].id);
  }, 30_000);

  afterAll(async () => {
    if (createdPaymentIds.length > 0) {
      await pgPool.query(`DELETE FROM payments WHERE id = ANY($1)`, [createdPaymentIds]);
    }
    if (generateSemesterId) {
      await pgPool.query(`DELETE FROM payments WHERE semester_id = $1`, [generateSemesterId]);
    }
    if (ghostMhsUserId) await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostMhsUserId]);
    if (createdStudentUserId) {
      await pgPool.query(`DELETE FROM users WHERE id = $1`, [createdStudentUserId]); // cascade students
    }
  }, 30_000);

  // ============================================================
  // GET /payments — list (admin keuangan/sistem)
  // ============================================================

  it('GET /payments — admin keuangan lihat list → 200 + pagination', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payments')
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    const found = res.body.data.find((r: { id: number }) => Number(r.id) === paymentId1);
    expect(found).toBeTruthy();
    expect(found.total_amount).toBe(500000);
    expect(Array.isArray(found.items)).toBe(true);
  });

  it('GET /payments — admin sistem juga bisa → 200', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payments')
      .set('Authorization', `Bearer ${sistemToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /payments — filter semester_id, status, student_id, prodi_id → 200', async () => {
    const res = await request(app)
      .get(
        `/api/v1/finance/payments?semester_id=${semesterId}&status=belum_lunas&student_id=${studentId}&prodi_id=${1}`,
      )
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(200);
    // prodi_id=1 mungkin tidak cocok dengan student — hasil boleh kosong; yang penting tidak error
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /payments — filter tidak cocok → 200 kosong', async () => {
    // student_id 999999 dipastikan tidak ada → filter kombinasi selalu kosong
    const res = await request(app)
      .get(`/api/v1/finance/payments?status=lunas&student_id=999999`)
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('GET /payments — pagination page=2 & limit besar di-clamp → 200', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payments?page=2&limit=999')
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(100);
  });

  it('GET /payments — mahasiswa → 403', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payments')
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /payments — dosen → 403', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payments')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // ============================================================
  // GET /payments/:id — detail
  // ============================================================

  it('GET /payments/:id — detail valid → 200 + items', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/payments/${paymentId1}`)
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.id)).toBe(paymentId1);
    expect(res.body.data.total_amount).toBe(500000);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].type).toBe('SPP');
  });

  it('GET /payments/:id — id invalid → 400', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payments/abc')
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /payments/:id — tidak ditemukan → 404', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payments/999999999')
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // POST /payments/:id/update — update status bayar
  // ============================================================

  it('POST /payments/:id/update — bayar parsial → 200 partial', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/payments/${paymentId1}/update`)
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ paid_amount: 200000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('partial');
    expect(res.body.data.paid_amount).toBe(200000);
  });

  it('POST /payments/:id/update — bayar lunas → 200 lunas', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/payments/${paymentId1}/update`)
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ paid_amount: 500000 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('lunas');
    expect(res.body.data.paid_amount).toBe(500000);
  });

  it('POST /payments/:id/update — paid_amount kosong → 400', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/payments/${paymentId1}/update`)
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /payments/:id/update — paid_amount NaN → 400', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/payments/${paymentId1}/update`)
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ paid_amount: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /payments/:id/update — paid_amount negatif → 400', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/payments/${paymentId1}/update`)
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ paid_amount: -100 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /payments/:id/update — paid_amount > total → 400 (DB Invalid paid amount)', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/payments/${paymentId2}/update`)
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ paid_amount: 999999 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /payments/:id/update — payment tidak ada → 404 (DB Payment not found)', async () => {
    const res = await request(app)
      .post('/api/v1/finance/payments/999999999/update')
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ paid_amount: 100 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /payments/:id/update — id invalid → 400', async () => {
    const res = await request(app)
      .post('/api/v1/finance/payments/abc/update')
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ paid_amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /payments/:id/update — mahasiswa → 403', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/payments/${paymentId1}/update`)
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({ paid_amount: 100 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // ============================================================
  // GET /my-payment — mahasiswa lihat tagihan sendiri
  // ============================================================

  it('GET /my-payment — mahasiswa lihat tagihan sendiri → 200 (min. 2 semester, ada payment buatan)', async () => {
    const res = await request(app)
      .get('/api/v1/finance/my-payment')
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    const ids = res.body.data.map((r: { id: number }) => Number(r.id));
    expect(ids).toContain(paymentId1);
    expect(ids).toContain(paymentId2);
    for (const r of res.body.data) {
      expect(Number(r.student_id)).toBe(studentId);
      expect(Array.isArray(r.items)).toBe(true);
    }
  });

  it('GET /my-payment — filter semester_id → 200 subset', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/my-payment?semester_id=${semesterId2}`)
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(Number(res.body.data[0].semester_id)).toBe(semesterId2);
  });

  it('GET /my-payment — mahasiswa tanpa tagihan → 200 kosong', async () => {
    const res = await request(app)
      .get('/api/v1/finance/my-payment')
      .set('Authorization', `Bearer ${mhsToken2}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('GET /my-payment — user tanpa row students (ghost) → 403', async () => {
    const res = await request(app)
      .get('/api/v1/finance/my-payment')
      .set('Authorization', `Bearer ${ghostMhsToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /my-payment — dosen → 403', async () => {
    const res = await request(app)
      .get('/api/v1/finance/my-payment')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // ============================================================
  // GET /krs-access — gate KRS (T2.3)
  // ============================================================

  it('GET /krs-access — lunas → can_access true + payment object', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/krs-access?semester_id=${semesterId}`)
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.can_access).toBe(true);
    expect(res.body.data.payment).toMatchObject({ status: 'lunas' });
    expect(res.body.data.payment.total_amount).toBe(500000);
  });

  it('GET /krs-access — belum lunas → can_access false', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/krs-access?semester_id=${semesterId2}`)
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.can_access).toBe(false);
    expect(res.body.data.payment.status).toBe('belum_lunas');
  });

  it('GET /krs-access — tanpa tagihan → can_access false + payment null', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/krs-access?semester_id=${semesterId}`)
      .set('Authorization', `Bearer ${mhsToken2}`);

    expect(res.status).toBe(200);
    expect(res.body.data.can_access).toBe(false);
    expect(res.body.data.payment).toBeNull();
  });

  it('GET /krs-access — semester_id wajib → 400', async () => {
    const res = await request(app)
      .get('/api/v1/finance/krs-access')
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /krs-access — semester_id invalid → 400', async () => {
    const res = await request(app)
      .get('/api/v1/finance/krs-access?semester_id=abc')
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /krs-access — dosen → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/krs-access?semester_id=${semesterId}`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // ============================================================
  // POST /generate — generate tagihan (dijalankan terakhir agar cleanup aman)
  // ============================================================

  it('POST /generate — semester_id wajib → 400', async () => {
    const res = await request(app)
      .post('/api/v1/finance/generate')
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /generate — semester_id invalid → 400', async () => {
    const res = await request(app)
      .post('/api/v1/finance/generate')
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ semester_id: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /generate — semester tidak ada → 404 (DB Semester not found)', async () => {
    const res = await request(app)
      .post('/api/v1/finance/generate')
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ semester_id: 9999 }); // valid SMALLINT tapi tidak ada di DB

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /generate — valid → 200, tagihan dibuat untuk semua mahasiswa aktif', async () => {
    if (!generateSemesterId) return; // tidak ada semester bebas payment di DB lokal kotor

    const res = await request(app)
      .post('/api/v1/finance/generate')
      .set('Authorization', `Bearer ${keuanganToken}`)
      .send({ semester_id: generateSemesterId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const countRes = await pgPool.query(`SELECT COUNT(*) FROM payments WHERE semester_id = $1`, [
      generateSemesterId,
    ]);
    const total = parseInt(countRes.rows[0].count, 10);
    expect(total).toBeGreaterThanOrEqual(1);
    // Setiap payment hasil generate punya minimal 1 item (SPP)
    const itemRes = await pgPool.query(
      `SELECT COUNT(*) FROM payment_items pi JOIN payments p ON p.id = pi.payment_id
       WHERE p.semester_id = $1`,
      [generateSemesterId],
    );
    expect(parseInt(itemRes.rows[0].count, 10)).toBeGreaterThanOrEqual(total);
  });

  it('POST /generate — mahasiswa → 403', async () => {
    const res = await request(app)
      .post('/api/v1/finance/generate')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({ semester_id: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
