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

describe('T3.3 Absensi — Attendance Sessions & Records', () => {
  let app: ReturnType<typeof createApp>;
  let dosenToken: string;
  let dosenLecturerId: number;
  let adminToken: string;
  let mahasiswaToken: string;
  let mahasiswaStudentId: number;
  let scheduleId: number;
  let sessionId: number;
  let createdSubmissionId: number;

  // Branch-coverage helpers: second dosen + not-enrolled mahasiswa + ghost users
  let otherDosenToken: string;
  let otherDosenUserId: number;
  let otherScheduleId: number;
  let otherSessionId: number;
  let notEnrolledToken: string;
  let ghostMhsToken: string;
  let ghostMhsUserId: number;
  let ghostDosenToken: string;
  let ghostDosenUserId: number;

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: password });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    app = createApp({}, { waitingRoom: null });

    // Get active semester
    const semRes = await pgPool.query(`SELECT id FROM semesters WHERE is_active LIMIT 1`);
    if (semRes.rows.length === 0) throw new Error('No active semester');

    // Get a dosen with active classes
    const dosenRes = await pgPool.query(
      `SELECT u.id as user_id, l.id as lecturer_id, u.email
       FROM users u
       JOIN lecturers l ON l.user_id = u.id
       JOIN classes cl ON cl.lecturer_id = u.id  -- classes.lecturer_id references users.id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active AND cl.is_active
       LIMIT 1`,
    );
    if (dosenRes.rows.length === 0) throw new Error('No seed dosen with active class available');
    dosenLecturerId = Number(dosenRes.rows[0].lecturer_id);
    dosenToken = await login(dosenRes.rows[0].email, 'Dosen123!');

    // Get a class for this dosen (create schedule if needed)
    const classRes = await pgPool.query(
      `SELECT cl.id FROM classes cl
       WHERE cl.lecturer_id = (SELECT user_id FROM lecturers WHERE id = $1)
         AND cl.is_active
       LIMIT 1`,
      [dosenLecturerId],
    );
    if (classRes.rows.length === 0) throw new Error('No class for dosen');
    const classId = Number(classRes.rows[0].id);

    // Clean up any leftover test data from previous runs
    await pgPool.query(
      `DELETE FROM attendance_records WHERE session_id IN (SELECT id FROM attendance_sessions WHERE schedule_id IN (SELECT id FROM schedules WHERE meeting_number = 999 AND class_id = $1))`,
      [classId],
    );
    await pgPool.query(
      `DELETE FROM attendance_sessions WHERE schedule_id IN (SELECT id FROM schedules WHERE meeting_number = 999 AND class_id = $1)`,
      [classId],
    );
    await pgPool.query(`DELETE FROM schedules WHERE meeting_number = 999 AND class_id = $1`, [
      classId,
    ]);

    // Create a unique schedule for this test (use a distinct meeting_number to avoid conflicts)
    const schedRes = await pgPool.query(
      `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic)
       VALUES ($1, 999, CURRENT_DATE + interval '30 days', 'Test Schedule for Attendance')
       RETURNING id`,
      [classId],
    );
    if (schedRes.rows.length === 0) throw new Error('Failed to create schedule');
    scheduleId = Number(schedRes.rows[0].id);

    // Get admin akademik
    const adminRes = await pgPool.query(
      `SELECT u.id, u.email FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'admin_akademik' AND u.is_active
       LIMIT 1`,
    );
    if (adminRes.rows.length === 0) throw new Error('No admin akademik');
    adminToken = await login(adminRes.rows[0].email, 'Admin123!');

    // Get a mahasiswa for this class — self-sufficient enrollment (CI DB fresh, seed
    // tidak menyediakan krs_submissions; jangan bergantung data leftover dari suite lain)
    const mhsRes = await pgPool.query(
      `SELECT s.id as student_id, u.email
       FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE s.is_active AND u.is_active
         AND NOT EXISTS (
           SELECT 1 FROM krs_submissions ks
           WHERE ks.student_id = s.id AND ks.status IN ('submitted', 'approved')
         )
       LIMIT 1`,
    );
    if (mhsRes.rows.length === 0) throw new Error('No eligible mahasiswa (tanpa submission aktif)');
    mahasiswaStudentId = Number(mhsRes.rows[0].student_id);
    mahasiswaToken = await login(mhsRes.rows[0].email, 'Mhs123!');

    // Buat enrollment approved sendiri (krs_period aktif dari seed)
    const periodRes = await pgPool.query(`SELECT id FROM krs_periods WHERE is_active LIMIT 1`);
    if (periodRes.rows.length === 0) throw new Error('No active krs_period');
    const periodId = Number(periodRes.rows[0].id);
    const subRes = await pgPool.query(
      `INSERT INTO krs_submissions (student_id, krs_period_id, status, submitted_at, approved_at, is_locked)
       VALUES ($1, $2, 'approved', now(), now(), true) RETURNING id`,
      [mahasiswaStudentId, periodId],
    );
    createdSubmissionId = Number(subRes.rows[0].id);
    await pgPool.query(
      `INSERT INTO krs_items (krs_submission_id, class_id, is_confirmed) VALUES ($1, $2, true)`,
      [createdSubmissionId, classId],
    );

    // --- Branch-coverage helpers ---

    // Second dosen (different class) for ownership/FORBIDDEN tests
    const otherDosenRes = await pgPool.query(
      `SELECT u.id as user_id, l.id as lecturer_id, u.email
       FROM users u
       JOIN lecturers l ON l.user_id = u.id
       JOIN classes cl ON cl.lecturer_id = u.id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active AND cl.is_active
         AND u.id != $1
       LIMIT 1`,
      [dosenRes.rows[0].user_id],
    );
    if (otherDosenRes.rows.length === 0) throw new Error('No second dosen available');
    otherDosenUserId = Number(otherDosenRes.rows[0].user_id);
    otherDosenToken = await login(otherDosenRes.rows[0].email, 'Dosen123!');

    const otherClassRes = await pgPool.query(
      `SELECT cl.id FROM classes cl WHERE cl.lecturer_id = $1 AND cl.is_active LIMIT 1`,
      [otherDosenUserId],
    );
    if (otherClassRes.rows.length === 0) throw new Error('No class for second dosen');
    const otherClassId = Number(otherClassRes.rows[0].id);
    const otherSchedRes = await pgPool.query(
      `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic)
       VALUES ($1, 998, CURRENT_DATE + interval '30 days', 'Test Schedule Other Dosen')
       RETURNING id`,
      [otherClassId],
    );
    otherScheduleId = Number(otherSchedRes.rows[0].id);

    // Mahasiswa NOT enrolled in the dosen's class (for check-in FORBIDDEN test)
    const notEnrolledRes = await pgPool.query(
      `SELECT s.id as student_id, u.email
       FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE u.is_active AND u.role_id = (SELECT id FROM roles WHERE code = 'mahasiswa')
         AND NOT EXISTS (
           SELECT 1 FROM krs_items ki
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           WHERE ks.student_id = s.id AND ki.class_id = $1
         )
       LIMIT 1`,
      [classId],
    );
    if (notEnrolledRes.rows.length === 0) throw new Error('No unenrolled mahasiswa available');
    notEnrolledToken = await login(notEnrolledRes.rows[0].email, 'Mhs123!');

    // Ghost users: role without students/lecturers rows (requireStudent/requireLecturer 403)
    const ghostPassword = 'Ghost123!';
    const ghostHash = await bcrypt.hash(ghostPassword, 4);
    const ghostMhsEmail = `att-ghost-mhs-${Date.now()}@siak.local`;
    const ghostMhsIns = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Ghost Mhs Att', (SELECT id FROM roles WHERE code = 'mahasiswa'), true)
       RETURNING id`,
      [ghostMhsEmail, ghostHash],
    );
    ghostMhsUserId = Number(ghostMhsIns.rows[0].id);
    ghostMhsToken = await login(ghostMhsEmail, ghostPassword);

    const ghostDosenEmail = `att-ghost-dosen-${Date.now()}@siak.local`;
    const ghostDosenIns = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Ghost Dosen Att', (SELECT id FROM roles WHERE code = 'dosen'), true)
       RETURNING id`,
      [ghostDosenEmail, ghostHash],
    );
    ghostDosenUserId = Number(ghostDosenIns.rows[0].id);
    ghostDosenToken = await login(ghostDosenEmail, ghostPassword);
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    if (scheduleId) {
      await pgPool.query(
        `DELETE FROM attendance_records WHERE session_id IN (SELECT id FROM attendance_sessions WHERE schedule_id = $1)`,
        [scheduleId],
      );
      await pgPool.query(`DELETE FROM attendance_sessions WHERE schedule_id = $1`, [scheduleId]);
    }
    await pgPool.query(`DELETE FROM schedules WHERE meeting_number = 999`);
    // Clean up enrollment buatan sendiri (krs_items cascade; submission dihapus eksplisit)
    if (createdSubmissionId) {
      await pgPool.query(`DELETE FROM krs_items WHERE krs_submission_id = $1`, [
        createdSubmissionId,
      ]);
      await pgPool.query(`DELETE FROM krs_submissions WHERE id = $1`, [createdSubmissionId]);
    }
    // Clean up branch-coverage helpers
    if (otherScheduleId) {
      await pgPool.query(
        `DELETE FROM attendance_records WHERE session_id IN (SELECT id FROM attendance_sessions WHERE schedule_id = $1)`,
        [otherScheduleId],
      );
      await pgPool.query(`DELETE FROM attendance_sessions WHERE schedule_id = $1`, [
        otherScheduleId,
      ]);
      await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [otherScheduleId]);
    }
    if (ghostMhsUserId) await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostMhsUserId]);
    if (ghostDosenUserId) await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostDosenUserId]);
  });

  // --- DOSEN: CRUD Sessions ---

  it('POST /attendance/sessions → dosen buat sesi absensi', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ scheduleId, topic: 'Pendahuluan Algoritma' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(Number(res.body.data.schedule_id)).toBe(scheduleId);
    expect(res.body.data.topic).toBe('Pendahuluan Algoritma');
    expect(res.body.data.is_open).toBe(false);
    sessionId = Number(res.body.data.id);
  });

  it('POST /attendance/sessions → duplicate session same schedule same date → 409', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ scheduleId, topic: 'Duplicate Test' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('GET /attendance/sessions → dosen lihat sesi sendiri', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const mySession = res.body.data.find(
      (s: Record<string, unknown>) => Number(s.id) === sessionId,
    );
    expect(mySession).toBeDefined();
    expect(mySession.topic).toBe('Pendahuluan Algoritma');
  });

  it('PUT /attendance/sessions/:id/open → dosen buka sesi', async () => {
    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${sessionId}/open`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_open).toBe(true);
    expect(res.body.data.opened_at).toBeDefined();
  });

  it('PUT /attendance/sessions/:id/open → double open → 409', async () => {
    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${sessionId}/open`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  // --- MAHASISWA: Self Check-in ---

  it('POST /attendance/check-in → mahasiswa absen mandiri via sessionId', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({ sessionId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(Number(res.body.data.session_id)).toBe(sessionId);
    expect(Number(res.body.data.student_id)).toBe(mahasiswaStudentId);
    expect(res.body.data.status).toBe('hadir');
  });

  it('POST /attendance/check-in → duplicate check-in → update to hadir', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({ sessionId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('hadir');
  });

  // --- DOSEN: View Records ---

  it('GET /attendance/sessions/:id/records → dosen lihat record sesi', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/sessions/${sessionId}/records`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('session');
    expect(res.body.data).toHaveProperty('records');
    expect(Array.isArray(res.body.data.records)).toBe(true);

    const myRecord = res.body.data.records.find(
      (r: Record<string, unknown>) => Number(r.student_id) === mahasiswaStudentId,
    );
    expect(myRecord).toBeDefined();
    expect(myRecord.status).toBe('hadir');
    expect(myRecord.recordId).toBeDefined();
  });

  // --- DOSEN/ADMIN: Update Record ---

  it('PUT /attendance/records/:id → dosen update record manual', async () => {
    // First get the record ID
    const recordsRes = await request(app)
      .get(`/api/v1/attendance/sessions/${sessionId}/records`)
      .set('Authorization', `Bearer ${dosenToken}`);
    const recordId = recordsRes.body.data.records.find(
      (r: Record<string, unknown>) => Number(r.student_id) === mahasiswaStudentId,
    )?.recordId;
    expect(recordId).toBeDefined();

    const res = await request(app)
      .put(`/api/v1/attendance/records/${recordId}`)
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ status: 'izin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('izin');
  });

  it('PUT /attendance/records/:id → admin update record', async () => {
    const recordsRes = await request(app)
      .get(`/api/v1/attendance/sessions/${sessionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);
    const recordId = recordsRes.body.data.records.find(
      (r: Record<string, unknown>) => Number(r.student_id) === mahasiswaStudentId,
    )?.recordId;
    expect(recordId).toBeDefined();

    const res = await request(app)
      .put(`/api/v1/attendance/records/${recordId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'sakit' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('sakit');
  });

  // --- DOSEN: Close Session ---

  it('PUT /attendance/sessions/:id/close → dosen tutup sesi', async () => {
    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_open).toBe(false);
    expect(res.body.data.closed_at).toBeDefined();
  });

  it('POST /attendance/check-in → after close → 403', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({ sessionId });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // --- QR Code ---

  it('PUT /attendance/sessions/:id/qr → dosen generate QR code', async () => {
    // Re-open first
    await request(app)
      .put(`/api/v1/attendance/sessions/${sessionId}/open`)
      .set('Authorization', `Bearer ${dosenToken}`);

    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${sessionId}/qr`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.qr_code).toBeDefined();
    expect(res.body.data.qr_code).toMatch(/^SAIK-\d+-\d+$/);
  });

  // --- ADMIN: View All Sessions ---

  it('GET /attendance/sessions → admin lihat semua sesi', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // --- RBAC Tests ---

  it('POST /attendance/sessions → mahasiswa tidak bisa buat sesi (403)', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({ scheduleId, topic: 'Test' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /attendance/sessions/:id/records → mahasiswa tidak bisa lihat record (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/sessions/${sessionId}/records`)
      .set('Authorization', `Bearer ${mahasiswaToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // --- BRANCH COVERAGE: Query Filters & Error Paths ---

  it('GET /attendance/sessions → filter schedule_id + date_from + date_to', async () => {
    const res = await request(app)
      .get(
        `/api/v1/attendance/sessions?schedule_id=${scheduleId}&date_from=2020-01-01&date_to=2030-12-31`,
      )
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.find((s: Record<string, unknown>) => Number(s.id) === sessionId);
    expect(found).toBeDefined();
  });

  it('POST /attendance/sessions → jadwal tidak ditemukan → 404', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ scheduleId: 999999999, topic: 'Test' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /attendance/sessions → jadwal milik dosen lain → 403', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ scheduleId: otherScheduleId, topic: 'Test' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /attendance/sessions → dosen lain buat sesi (untuk tes kepemilikan)', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${otherDosenToken}`)
      .send({ scheduleId: otherScheduleId, topic: 'Sesi Dosen Lain' });

    expect(res.status).toBe(201);
    otherSessionId = Number(res.body.data.id);
  });

  it('PUT /attendance/sessions/:id/open → sesi tidak ditemukan → 404', async () => {
    const res = await request(app)
      .put('/api/v1/attendance/sessions/999999999/open')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PUT /attendance/sessions/:id/open → sesi dosen lain → 403', async () => {
    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${otherSessionId}/open`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PUT /attendance/sessions/:id/close → sesi tidak ditemukan → 404', async () => {
    const res = await request(app)
      .put('/api/v1/attendance/sessions/999999999/close')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PUT /attendance/sessions/:id/close → sesi dosen lain → 403', async () => {
    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${otherSessionId}/close`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PUT /attendance/sessions/:id/close → sesi belum dibuka → 409', async () => {
    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${otherSessionId}/close`)
      .set('Authorization', `Bearer ${otherDosenToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('POST /attendance/check-in → mahasiswa absen via qrCode', async () => {
    const listRes = await request(app)
      .get('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${dosenToken}`);
    const mySession = listRes.body.data.find(
      (s: Record<string, unknown>) => Number(s.id) === sessionId,
    );
    expect(mySession.qr_code).toBeDefined();

    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({ qrCode: mySession.qr_code });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('hadir');
  });

  it('POST /attendance/check-in → tanpa sessionId & qrCode → 400', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /attendance/check-in → sesi tidak ditemukan → 404', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({ sessionId: 999999999 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /attendance/check-in → mahasiswa tidak terdaftar di kelas → 403', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${notEnrolledToken}`)
      .send({ sessionId });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /attendance/check-in → update record non-hadir menjadi hadir', async () => {
    // Dosen set status 'sakit' dulu
    const recordsRes = await request(app)
      .get(`/api/v1/attendance/sessions/${sessionId}/records`)
      .set('Authorization', `Bearer ${dosenToken}`);
    const myRec = recordsRes.body.data.records.find(
      (r: Record<string, unknown>) => Number(r.student_id) === mahasiswaStudentId,
    );
    expect(myRec).toBeDefined();
    expect(myRec.recordId).toBeDefined();

    const upd = await request(app)
      .put(`/api/v1/attendance/records/${myRec.recordId}`)
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ status: 'sakit' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.status).toBe('sakit');

    // Mahasiswa check-in lagi → status kembali 'hadir' (branch update existing)
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${mahasiswaToken}`)
      .send({ sessionId });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('hadir');
  });

  it('GET /attendance/sessions/:id/records → sesi tidak ditemukan → 404', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/sessions/999999999/records')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /attendance/sessions/:id/records → sesi dosen lain → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/sessions/${otherSessionId}/records`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PUT /attendance/records/:id → record tidak ditemukan → 404', async () => {
    const res = await request(app)
      .put('/api/v1/attendance/records/999999999')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ status: 'izin' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PUT /attendance/records/:id → record sesi dosen lain → 403', async () => {
    const ins = await pgPool.query(
      `INSERT INTO attendance_records (session_id, student_id, status, marked_by)
       VALUES ($1, $2, 'hadir', $3) RETURNING id`,
      [otherSessionId, mahasiswaStudentId, otherDosenUserId],
    );
    const otherRecId = Number(ins.rows[0].id);

    const res = await request(app)
      .put(`/api/v1/attendance/records/${otherRecId}`)
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ status: 'izin' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PUT /attendance/sessions/:id/qr → sesi tidak ditemukan → 404', async () => {
    const res = await request(app)
      .put('/api/v1/attendance/sessions/999999999/qr')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PUT /attendance/sessions/:id/qr → sesi dosen lain → 403', async () => {
    const res = await request(app)
      .put(`/api/v1/attendance/sessions/${otherSessionId}/qr`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /attendance/check-in → mahasiswa tanpa data students → 403', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${ghostMhsToken}`)
      .send({ sessionId });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /attendance/sessions → dosen tanpa data lecturers → 403', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/sessions')
      .set('Authorization', `Bearer ${ghostDosenToken}`)
      .send({ scheduleId, topic: 'Test' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
