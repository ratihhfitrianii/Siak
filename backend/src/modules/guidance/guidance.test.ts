// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-secret-key-min-16-chars';
process.env.BCRYPT_ROUNDS ??= '4';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

describe('T3.4 Bimbingan — Guidance Sessions (F-24)', () => {
  let app: ReturnType<typeof createApp>;
  let waliToken: string;
  let waliUserId: number;
  let waliLecturerId: number;
  let adminToken: string;
  let mahasiswaBinaanToken: string;
  let mahasiswaBinaanStudentId: number;
  let mahasiswaLainToken: string;
  let mahasiswaLainStudentId: number;
  let dosenBiasaToken: string;
  let today: string;
  const createdSessionIds: number[] = [];

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    app = createApp({}, { waitingRoom: null });

    // Tanggal lokal DB (deterministik, hindari beda zona UTC/WIB)
    const todayRes = await pgPool.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`);
    today = todayRes.rows[0].d as string;

    // Dosen wali: pilih dosen AKT (prodi 4), set is_wali=true (seed asli semua false)
    const waliRes = await pgPool.query(
      `SELECT u.id AS user_id, l.id AS lecturer_id, u.email
       FROM users u
       JOIN lecturers l ON l.user_id = u.id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active AND l.prodi_id = 4
       ORDER BY u.id LIMIT 1`,
    );
    if (waliRes.rows.length === 0) throw new Error('No AKT dosen available');
    waliUserId = Number(waliRes.rows[0].user_id);
    waliLecturerId = Number(waliRes.rows[0].lecturer_id);
    await pgPool.query(`UPDATE users SET is_wali = true WHERE id = $1`, [waliUserId]);
    waliToken = await login(waliRes.rows[0].email, 'Dosen123!');

    // Dosen biasa (bukan wali) — dosen kedua prodi 4
    const dosenBiasaRes = await pgPool.query(
      `SELECT u.email FROM users u
       JOIN lecturers l ON l.user_id = u.id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active AND u.id != $1
       ORDER BY u.id LIMIT 1`,
      [waliUserId],
    );
    dosenBiasaToken = await login(dosenBiasaRes.rows[0].email, 'Dosen123!');

    // Admin akademik
    const adminRes = await pgPool.query(
      `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'admin_akademik' AND u.is_active LIMIT 1`,
    );
    adminToken = await login(adminRes.rows[0].email, 'Admin123!');

    // Mahasiswa binaan (prodi 4 = AKT, sama dengan wali)
    const binaanRes = await pgPool.query(
      `SELECT s.id AS student_id, u.email FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE s.prodi_id = 4 AND s.is_active AND u.is_active
       ORDER BY s.id LIMIT 1`,
    );
    mahasiswaBinaanStudentId = Number(binaanRes.rows[0].student_id);
    mahasiswaBinaanToken = await login(binaanRes.rows[0].email, 'Mhs123!');

    // Mahasiswa lain (prodi 1 = TI, BUKAN binaan wali)
    const lainRes = await pgPool.query(
      `SELECT s.id AS student_id, u.email FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE s.prodi_id != 4 AND s.is_active AND u.is_active
       ORDER BY s.id LIMIT 1`,
    );
    mahasiswaLainStudentId = Number(lainRes.rows[0].student_id);
    mahasiswaLainToken = await login(lainRes.rows[0].email, 'Mhs123!');
  }, 30_000);

  afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await pgPool.query(`DELETE FROM guidance_sessions WHERE id = ANY($1)`, [createdSessionIds]);
    }
    // Reset atribut wali (seed asli false)
    await pgPool.query(`UPDATE users SET is_wali = false WHERE id = $1`, [waliUserId]);
  }, 30_000);

  // ============================================================
  // WALI: CRUD Sesi Bimbingan
  // ============================================================

  it('POST /guidance/sessions — wali catat pertemuan binaan → 201', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${waliToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: today,
        notes: 'Membahas rencana studi semester depan',
        progress: 'berjalan',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Track id SEBELUM assertion data (jika expect throw, id tetap ter-cleanup)
    const newId = Number(res.body.data.id);
    if (newId) createdSessionIds.push(newId);
    expect(Number(res.body.data.student_id)).toBe(mahasiswaBinaanStudentId);
    expect(res.body.data.progress).toBe('berjalan');
    expect(Number(res.body.data.lecturer_id)).toBe(waliLecturerId);
    expect(res.body.data.student_name).toBeTruthy();
  });

  it('POST /guidance/sessions — progress tidak valid → 400', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${waliToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: today,
        progress: 'mager',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /guidance/sessions — tanggal masa depan → 400', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${waliToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: '2099-01-01',
        progress: 'berjalan',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /guidance/sessions — format tanggal salah → 400', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${waliToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: '06-08-2026',
        progress: 'berjalan',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /guidance/sessions — mahasiswa tidak ditemukan → 404', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${waliToken}`)
      .send({
        studentId: 999999999,
        sessionDate: today,
        progress: 'berjalan',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /guidance/sessions — mahasiswa bukan binaan (prodi beda) → 403', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${waliToken}`)
      .send({
        studentId: mahasiswaLainStudentId,
        sessionDate: today,
        progress: 'berjalan',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /guidance/sessions — dosen NON-wali → 403', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${dosenBiasaToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: today,
        progress: 'berjalan',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /guidance/sessions — mahasiswa (role mhs) → 403', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: today,
        progress: 'berjalan',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /guidance/sessions — admin tanpa lecturerId → 400', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: today,
        progress: 'berjalan',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /guidance/sessions — admin dengan lecturerId wali valid → 201', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: today,
        notes: 'Dibuat admin',
        progress: 'selesai',
        lecturerId: waliLecturerId,
      });

    expect(res.status).toBe(201);
    const newId = Number(res.body.data.id);
    if (newId) createdSessionIds.push(newId);
    expect(Number(res.body.data.lecturer_id)).toBe(waliLecturerId);
  });

  it('POST /guidance/sessions — admin dengan lecturerId bukan wali → 400', async () => {
    const res = await request(app)
      .post('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentId: mahasiswaBinaanStudentId,
        sessionDate: today,
        progress: 'berjalan',
        lecturerId: 999999999,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ============================================================
  // LIST & DETAIL
  // ============================================================

  it('GET /guidance/sessions — wali lihat semua binaannya → 200', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    for (const s of res.body.data) {
      expect(Number(s.lecturer_id)).toBe(waliLecturerId);
      expect(s.student_name).toBeTruthy();
    }
  });

  it('GET /guidance/sessions?student_id= — filter binaan tertentu', async () => {
    const res = await request(app)
      .get(`/api/v1/guidance/sessions?student_id=${mahasiswaBinaanStudentId}`)
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    for (const s of res.body.data) {
      expect(Number(s.student_id)).toBe(mahasiswaBinaanStudentId);
    }
  });

  it('GET /guidance/sessions — admin lihat semua sesi → 200', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /guidance/sessions — mahasiswa → 403', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /guidance/sessions/:id — wali lihat detail miliknya → 200', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .get(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.id)).toBe(id);
    expect(res.body.data.notes).toBeTruthy();
  });

  it('GET /guidance/sessions/:id — mahasiswa lihat bimbingan sendiri (visible) → 200', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .get(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.student_id)).toBe(mahasiswaBinaanStudentId);
  });

  it('GET /guidance/sessions/:id — mahasiswa bimbingan invisible → 403', async () => {
    const ins = await pgPool.query(
      `INSERT INTO guidance_sessions (student_id, lecturer_id, session_date, notes, progress, is_visible_to_student)
       VALUES ($1, $2, CURRENT_DATE, 'private', 'berjalan', false) RETURNING id`,
      [mahasiswaBinaanStudentId, waliLecturerId],
    );
    const invisibleId = Number(ins.rows[0].id);
    createdSessionIds.push(invisibleId);

    const res = await request(app)
      .get(`/api/v1/guidance/sessions/${invisibleId}`)
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /guidance/sessions/:id — mahasiswa lihat bimbingan orang lain → 403', async () => {
    const otherStudentRes = await pgPool.query(
      `SELECT s.id FROM students s JOIN users u ON u.id = s.user_id
       WHERE s.prodi_id = 4 AND s.is_active AND u.is_active AND s.id != $1
       ORDER BY s.id LIMIT 1`,
      [mahasiswaBinaanStudentId],
    );
    const otherStudentId = Number(otherStudentRes.rows[0].id);
    const ins = await pgPool.query(
      `INSERT INTO guidance_sessions (student_id, lecturer_id, session_date, notes, progress)
       VALUES ($1, $2, CURRENT_DATE, 'milik mhs lain', 'berjalan') RETURNING id`,
      [otherStudentId, waliLecturerId],
    );
    const otherId = Number(ins.rows[0].id);
    createdSessionIds.push(otherId);

    const res = await request(app)
      .get(`/api/v1/guidance/sessions/${otherId}`)
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /guidance/sessions/:id — wali lihat sesi dosen lain → 403', async () => {
    const otherDosenRes = await pgPool.query(
      `SELECT l.id FROM lecturers l JOIN users u ON u.id = l.user_id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active AND l.id != $1
       ORDER BY l.id LIMIT 1`,
      [waliLecturerId],
    );
    const otherLecturerId = Number(otherDosenRes.rows[0].id);
    const ins = await pgPool.query(
      `INSERT INTO guidance_sessions (student_id, lecturer_id, session_date, notes, progress)
       VALUES ($1, $2, CURRENT_DATE, 'sesi wali lain', 'berjalan') RETURNING id`,
      [mahasiswaBinaanStudentId, otherLecturerId],
    );
    const otherId = Number(ins.rows[0].id);
    createdSessionIds.push(otherId);

    const res = await request(app)
      .get(`/api/v1/guidance/sessions/${otherId}`)
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /guidance/sessions/:id — tidak ditemukan → 404', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/sessions/999999999')
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /guidance/sessions/:id — id invalid → 400', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/sessions/abc')
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /guidance/sessions/:id — admin lihat sesi wali → 200', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .get(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.id)).toBe(id);
  });

  // ============================================================
  // UPDATE & DELETE
  // ============================================================

  it('PUT /guidance/sessions/:id — wali update progress & notes → 200', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .put(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${waliToken}`)
      .send({ progress: 'selesai', notes: 'Revisi rencana studi disetujui' });

    expect(res.status).toBe(200);
    expect(res.body.data.progress).toBe('selesai');
    expect(res.body.data.notes).toBe('Revisi rencana studi disetujui');
  });

  it('PUT /guidance/sessions/:id — progress invalid → 400', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .put(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${waliToken}`)
      .send({ progress: 'biasa' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /guidance/sessions/:id — body kosong → 400', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .put(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${waliToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /guidance/sessions/:id — wali bukan pemilik → 403', async () => {
    const otherDosenRes = await pgPool.query(
      `SELECT l.id FROM lecturers l JOIN users u ON u.id = l.user_id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active AND l.id != $1
       ORDER BY l.id LIMIT 1`,
      [waliLecturerId],
    );
    const otherLecturerId = Number(otherDosenRes.rows[0].id);
    const ins = await pgPool.query(
      `INSERT INTO guidance_sessions (student_id, lecturer_id, session_date, notes, progress)
       VALUES ($1, $2, CURRENT_DATE, 'punya wali lain', 'berjalan') RETURNING id`,
      [mahasiswaBinaanStudentId, otherLecturerId],
    );
    const otherId = Number(ins.rows[0].id);
    createdSessionIds.push(otherId);

    const res = await request(app)
      .put(`/api/v1/guidance/sessions/${otherId}`)
      .set('Authorization', `Bearer ${waliToken}`)
      .send({ progress: 'selesai' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PUT /guidance/sessions/:id — tidak ditemukan → 404', async () => {
    const res = await request(app)
      .put('/api/v1/guidance/sessions/999999999')
      .set('Authorization', `Bearer ${waliToken}`)
      .send({ progress: 'selesai' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PUT /guidance/sessions/:id — mahasiswa → 403', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .put(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`)
      .send({ progress: 'selesai' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PUT /guidance/sessions/:id — tanggal masa depan → 400', async () => {
    const id = createdSessionIds[0];
    const res = await request(app)
      .put(`/api/v1/guidance/sessions/${id}`)
      .set('Authorization', `Bearer ${waliToken}`)
      .send({ sessionDate: '2099-12-31' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /guidance/sessions/:id — wali hapus miliknya → 200', async () => {
    const ins = await pgPool.query(
      `INSERT INTO guidance_sessions (student_id, lecturer_id, session_date, notes, progress)
       VALUES ($1, $2, CURRENT_DATE, 'untuk dihapus', 'berjalan') RETURNING id`,
      [mahasiswaBinaanStudentId, waliLecturerId],
    );
    const delId = Number(ins.rows[0].id);

    const res = await request(app)
      .delete(`/api/v1/guidance/sessions/${delId}`)
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const check = await pgPool.query(`SELECT 1 FROM guidance_sessions WHERE id = $1`, [delId]);
    expect(check.rows.length).toBe(0);
  });

  it('DELETE /guidance/sessions/:id — wali bukan pemilik → 403', async () => {
    const otherDosenRes = await pgPool.query(
      `SELECT l.id FROM lecturers l JOIN users u ON u.id = l.user_id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active AND l.id != $1
       ORDER BY l.id LIMIT 1`,
      [waliLecturerId],
    );
    const otherLecturerId = Number(otherDosenRes.rows[0].id);
    const ins = await pgPool.query(
      `INSERT INTO guidance_sessions (student_id, lecturer_id, session_date, notes, progress)
       VALUES ($1, $2, CURRENT_DATE, 'punya wali lain', 'berjalan') RETURNING id`,
      [mahasiswaBinaanStudentId, otherLecturerId],
    );
    const otherId = Number(ins.rows[0].id);
    createdSessionIds.push(otherId);

    const res = await request(app)
      .delete(`/api/v1/guidance/sessions/${otherId}`)
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('DELETE /guidance/sessions/:id — tidak ditemukan → 404', async () => {
    const res = await request(app)
      .delete('/api/v1/guidance/sessions/999999999')
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // MENTEES & MY
  // ============================================================

  it('GET /guidance/mentees — wali lihat daftar binaan → 200', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/mentees')
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    for (const m of res.body.data) {
      expect(m.prodi_code).toBe('AKT');
      expect(m.student_name).toBeTruthy();
      expect(m.nim).toBeTruthy();
    }
  });

  it('GET /guidance/mentees — admin lihat semua mahasiswa → 200', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/mentees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /guidance/mentees — dosen biasa → 403', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/mentees')
      .set('Authorization', `Bearer ${dosenBiasaToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /guidance/mentees — mahasiswa → 403', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/mentees')
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /guidance/my — mahasiswa lihat bimbingan sendiri (visible) → 200', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/my')
      .set('Authorization', `Bearer ${mahasiswaBinaanToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    for (const s of res.body.data) {
      expect(Number(s.student_id)).toBe(mahasiswaBinaanStudentId);
      expect(s.is_visible_to_student).toBe(true);
    }
  });

  it('GET /guidance/my — dosen (tanpa studentId) → 403', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/my')
      .set('Authorization', `Bearer ${waliToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /guidance/my — mahasiswa lain hanya melihat punya sendiri → 200', async () => {
    const res = await request(app)
      .get('/api/v1/guidance/my')
      .set('Authorization', `Bearer ${mahasiswaLainToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('GET /guidance/sessions — admin keuangan → 403', async () => {
    const keuanganRes = await pgPool.query(
      `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'admin_keuangan' AND u.is_active LIMIT 1`,
    );
    const keuanganToken = await login(keuanganRes.rows[0].email, 'Admin123!');

    const res = await request(app)
      .get('/api/v1/guidance/sessions')
      .set('Authorization', `Bearer ${keuanganToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
