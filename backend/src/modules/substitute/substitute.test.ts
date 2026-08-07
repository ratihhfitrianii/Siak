// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-min-32-chars-long-for-hs256-alg';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-long-for-hs256-alg';
process.env.BCRYPT_ROUNDS = '4';

import request from 'supertest';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

const app = createApp();

describe('T3.5 Substitute Teaching (F-25)', () => {
  let dosenToken: string;
  let dosenLecturerId: number;
  let dosenUserId: number;
  let dosen2Token: string;
  let dosen2LecturerId: number;
  let adminToken: string;
  let adminUserId: number;
  let classId: number;
  let scheduleId: number;
  let scheduleId2: number;
  let scheduleId3: number;
  let otherClassScheduleId: number | null = null;
  const createdSubstituteIds: number[] = [];

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    // Use existing seed dosen (pick first dosen with lecturer profile)
    const seedDosenRes = await pgPool.query(
      `SELECT u.id as user_id, u.email, l.id as lecturer_id
       FROM users u
       JOIN lecturers l ON l.user_id = u.id
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'dosen' AND u.is_active AND l.is_active
       ORDER BY u.id LIMIT 1`,
    );
    if (seedDosenRes.rows.length === 0) {
      throw new Error('No seed dosen available');
    }
    dosenUserId = Number(seedDosenRes.rows[0].user_id);
    dosenLecturerId = Number(seedDosenRes.rows[0].lecturer_id);
    dosenToken = await login(seedDosenRes.rows[0].email, 'Dosen123!');

    // Second dosen (for substitute)
    const seedDosen2Res = await pgPool.query(
      `SELECT u.id as user_id, u.email, l.id as lecturer_id
       FROM users u
       JOIN lecturers l ON l.user_id = u.id
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'dosen' AND u.is_active AND l.is_active AND u.id != $1
       ORDER BY u.id LIMIT 1`,
      [dosenUserId],
    );
    if (seedDosen2Res.rows.length === 0) {
      throw new Error('No second seed dosen available');
    }
    dosen2LecturerId = Number(seedDosen2Res.rows[0].lecturer_id);
    dosen2Token = await login(seedDosen2Res.rows[0].email, 'Dosen123!');

    // Get a class taught by dosen1
    const classRes = await pgPool.query(
      `SELECT c.id, c.curriculum_id
       FROM classes c
       WHERE c.lecturer_id = $1 AND c.is_active
       LIMIT 1`,
      [dosenUserId],
    );
    if (classRes.rows.length === 0) {
      throw new Error('No class found for dosen1');
    }
    classId = Number(classRes.rows[0].id);

    // Create a unique schedule for this test (self-sufficient — CI DB fresh,
    // seed tidak menyediakan schedules; jangan bergantung data leftover dari suite lain)
    const meetingNum = Math.floor(Math.random() * 30000) + 1000;
    const schedRes = await pgPool.query(
      `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic)
       VALUES ($1, $2, CURRENT_DATE + interval '30 days', 'Test Schedule for Substitute')
       RETURNING id`,
      [classId, meetingNum],
    );
    if (schedRes.rows.length === 0) throw new Error('Failed to create schedule');
    scheduleId = Number(schedRes.rows[0].id);

    // Schedule kedua untuk kelas yang sama (test "admin ajukan" butuh schedule berbeda)
    const schedRes2 = await pgPool.query(
      `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic)
       VALUES ($1, $2, CURRENT_DATE + interval '30 days', 'Test Schedule for Substitute 2')
       RETURNING id`,
      [classId, meetingNum + 1],
    );
    scheduleId2 = Number(schedRes2.rows[0].id);

    // Schedule ketiga untuk kelas yang sama (test "sudah cancelled" butuh schedule bebas)
    const schedRes3 = await pgPool.query(
      `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic)
       VALUES ($1, $2, CURRENT_DATE + interval '30 days', 'Test Schedule for Substitute 3')
       RETURNING id`,
      [classId, meetingNum + 3],
    );
    scheduleId3 = Number(schedRes3.rows[0].id);

    // Schedule untuk kelas LAIN (test "schedule bukan milik kelas")
    const otherClassRes = await pgPool.query(
      `SELECT c.id FROM classes c WHERE c.id != $1 AND c.is_active LIMIT 1`,
      [classId],
    );
    if (otherClassRes.rows.length > 0) {
      const otherClassId = Number(otherClassRes.rows[0].id);
      const otherSchedRes = await pgPool.query(
        `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic)
         VALUES ($1, $2, CURRENT_DATE + interval '30 days', 'Test Schedule for Other Class')
         RETURNING id`,
        [otherClassId, meetingNum + 2],
      );
      otherClassScheduleId = Number(otherSchedRes.rows[0].id);
    }

    // Use existing seed admin akademik
    const seedAdminRes = await pgPool.query(
      `SELECT u.id, u.email FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'admin_akademik' AND u.is_active
       ORDER BY u.id LIMIT 1`,
    );
    adminUserId = Number(seedAdminRes.rows[0].id);
    adminToken = await login(seedAdminRes.rows[0].email, 'Admin123!');
  }, 30000);

  afterAll(async () => {
    // Cleanup test substitutes
    if (createdSubstituteIds.length > 0) {
      await pgPool.query(`DELETE FROM substitute_teaching WHERE id = ANY($1)`, [
        createdSubstituteIds,
      ]);
    }
    if (scheduleId) {
      await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [scheduleId]);
    }
    if (scheduleId2) {
      await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [scheduleId2]);
    }
    if (scheduleId3) {
      await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [scheduleId3]);
    }
    if (otherClassScheduleId) {
      await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [otherClassScheduleId]);
    }
    await pgPool.end();
  }, 30000);

  it('POST /substitute — dosen ajukan substitute untuk kelas sendiri → 201', async () => {
    // Pakai schedule pertama (milik kelas dosen ini) — test ini berjalan pertama,
    // jadi scheduleId belum punya substitute aktif
    const testScheduleId = scheduleId;
    const testClassRes = await pgPool.query(`SELECT class_id FROM schedules WHERE id = $1`, [
      testScheduleId,
    ]);
    const testClassId = Number(testClassRes.rows[0].class_id);

    const res = await request(app)
      .post('/api/v1/substitute')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        originalLecturerId: dosenLecturerId,
        substituteLecturerId: dosen2LecturerId,
        classId: testClassId,
        scheduleId: testScheduleId,
        reason: 'Sakit mendadak',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.original_lecturer_id)).toBe(dosenLecturerId);
    expect(Number(res.body.data.substitute_lecturer_id)).toBe(dosen2LecturerId);
    expect(Number(res.body.data.class_id)).toBe(testClassId);
    expect(Number(res.body.data.schedule_id)).toBe(testScheduleId);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.reason).toBe('Sakit mendadak');
    expect(res.body.data.requested_by).toBe(String(dosenUserId));
    expect(res.body.data.approved_by).toBe(String(dosenUserId)); // langsung aktif
    expect(res.body.data.approved_at).toBeDefined();

    createdSubstituteIds.push(Number(res.body.data.id));
  });

  it('POST /substitute — admin ajukan substitute untuk kelas dosen lain → 201', async () => {
    // Pakai schedule kedua yang dibuat di beforeAll (self-sufficient)
    const testScheduleId = scheduleId2;
    const testClassRes = await pgPool.query(`SELECT class_id FROM schedules WHERE id = $1`, [
      testScheduleId,
    ]);
    const testClassId = Number(testClassRes.rows[0].class_id);

    const res = await request(app)
      .post('/api/v1/substitute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originalLecturerId: dosenLecturerId,
        substituteLecturerId: dosen2LecturerId,
        classId: testClassId,
        scheduleId: testScheduleId,
        reason: 'Izin penelitian',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requested_by).toBe(String(adminUserId));
    expect(res.body.data.approved_by).toBe(String(adminUserId));

    createdSubstituteIds.push(Number(res.body.data.id));
  });

  it('POST /substitute — original == substitute → 400', async () => {
    const res = await request(app)
      .post('/api/v1/substitute')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        originalLecturerId: dosenLecturerId,
        substituteLecturerId: dosenLecturerId,
        classId,
        scheduleId,
        reason: 'Test',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Dosen pengganti tidak boleh sama');
  });

  it('POST /substitute — dosen bukan pengajar kelas → 400', async () => {
    // Buat dosen ghost (user + lecturer) yang TIDAK mengajar classId —
    // self-sufficient: seed kini mengisi 1 dosen per kelas, jadi tak ada
    // dosen lain yang mengajar kelas yang sama
    const ghostEmail = `ghost-dosen-${Date.now()}@siak.test`;
    const ghostUserRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Ghost Dosen Other Class', (SELECT id FROM roles WHERE code = 'dosen'), true)
       RETURNING id`,
      [ghostEmail, 'test-password-hash'],
    );
    const ghostUserId = Number(ghostUserRes.rows[0].id);
    const ghostLecturerRes = await pgPool.query(
      `INSERT INTO lecturers (user_id, nidn, prodi_id, is_active)
       VALUES ($1, 'GHOST_NIDN_OTHER', 1, true)
       RETURNING id`,
      [ghostUserId],
    );
    const ghostLecturerId = Number(ghostLecturerRes.rows[0].id);

    const res = await request(app)
      .post('/api/v1/substitute')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        originalLecturerId: ghostLecturerId,
        substituteLecturerId: dosen2LecturerId,
        classId,
        scheduleId,
        reason: 'Test',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Dosen yang diganti bukan pengajar kelas ini');

    // Cleanup
    await pgPool.query(`DELETE FROM lecturers WHERE id = $1`, [ghostLecturerId]);
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostUserId]);
  });

  it('POST /substitute — schedule bukan milik kelas → 400', async () => {
    // Pakai schedule dari kelas lain (dibuat di beforeAll)
    if (otherClassScheduleId) {
      const otherScheduleId = otherClassScheduleId;
      const res = await request(app)
        .post('/api/v1/substitute')
        .set('Authorization', `Bearer ${dosenToken}`)
        .send({
          originalLecturerId: dosenLecturerId,
          substituteLecturerId: dosen2LecturerId,
          classId,
          scheduleId: otherScheduleId,
          reason: 'Test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Jadwal tidak ditemukan untuk kelas ini');
    }
  });

  it('POST /substitute — substitute lecturer tidak aktif → 400', async () => {
    // Create an inactive lecturer (buat user dosen baru dulu — seed kini mengisi
    // profil lecturer untuk SEMUA user dosen, jadi tak ada user dosen tanpa lecturer)
    const inactiveUserRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Inactive Dosen Test', (SELECT id FROM roles WHERE code = 'dosen'), true)
       RETURNING id`,
      [`inactive-dosen-${Date.now()}@siak.test`, 'test-password-hash'],
    );
    const inactiveUserId = Number(inactiveUserRes.rows[0].id);
    const inactiveRes = await pgPool.query(
      `INSERT INTO lecturers (user_id, nidn, prodi_id, is_active)
       VALUES ($1, 'INACTIVE_TEST', 1, false)
       RETURNING id`,
      [inactiveUserId],
    );
    if (inactiveRes.rows.length > 0) {
      const inactiveLecturerId = Number(inactiveRes.rows[0].id);
      const res = await request(app)
        .post('/api/v1/substitute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          originalLecturerId: dosenLecturerId,
          substituteLecturerId: inactiveLecturerId,
          classId,
          scheduleId,
          reason: 'Test inactive',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Dosen pengganti tidak aktif atau tidak ditemukan');

      // Cleanup
      await pgPool.query(`DELETE FROM lecturers WHERE id = $1`, [inactiveLecturerId]);
      await pgPool.query(`DELETE FROM users WHERE id = $1`, [inactiveUserId]);
    }
  });

  it('POST /substitute — duplicate active substitute untuk schedule sama → 409', async () => {
    // Pakai schedule kedua (sudah punya substitute aktif dari test admin)
    const testScheduleId = scheduleId2;
    const testClassRes = await pgPool.query(`SELECT class_id FROM schedules WHERE id = $1`, [
      testScheduleId,
    ]);
    const testClassId = Number(testClassRes.rows[0].class_id);

    // First create
    const res1 = await request(app)
      .post('/api/v1/substitute')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        originalLecturerId: dosenLecturerId,
        substituteLecturerId: dosen2LecturerId,
        classId: testClassId,
        scheduleId: testScheduleId,
        reason: 'First',
      });
    if (res1.status === 201) {
      createdSubstituteIds.push(Number(res1.body.data.id));
    }

    // Second create (duplicate)
    const res = await request(app)
      .post('/api/v1/substitute')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        originalLecturerId: dosenLecturerId,
        substituteLecturerId: dosen2LecturerId,
        classId: testClassId,
        scheduleId: testScheduleId,
        reason: 'Duplicate',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Sudah ada substitute aktif');
  });

  it('GET /substitute — dosen lihat substitute sendiri (original & substitute) → 200', async () => {
    // List substitutes - the first test should have created one (scheduleId = 37)
    const res = await request(app)
      .get('/api/v1/substitute')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    // Semua item harus melibatkan dosen ini (sebagai original atau substitute)
    for (const item of res.body.data.items) {
      const isInvolved =
        Number(item.original_lecturer_id) === dosenLecturerId ||
        Number(item.substitute_lecturer_id) === dosenLecturerId;
      expect(isInvolved).toBe(true);
    }
    expect(res.body.data.pagination).toBeDefined();
  });

  it('GET /substitute — admin lihat semua substitute → 200', async () => {
    const res = await request(app)
      .get('/api/v1/substitute')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('GET /substitute?status=active — filter by status → 200', async () => {
    const res = await request(app)
      .get('/api/v1/substitute?status=active')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const item of res.body.data.items) {
      expect(item.status).toBe('active');
    }
  });

  it('GET /substitute?class_id & schedule_id — filter by class & schedule → 200', async () => {
    const res = await request(app)
      .get(`/api/v1/substitute?class_id=${classId}&schedule_id=${scheduleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const item of res.body.data.items) {
      expect(Number(item.class_id)).toBe(classId);
      expect(Number(item.schedule_id)).toBe(scheduleId);
    }
  });

  it('GET /substitute — dosen tanpa lecturerId → 403', async () => {
    // Buat user dosen tanpa profil lecturer (self-sufficient)
    const ghostEmail = `ghost-dosen-${Date.now()}@siak.test`;
    const ghostUserRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Ghost Dosen No Lecturer', (SELECT id FROM roles WHERE code = 'dosen'), true)
       RETURNING id`,
      [ghostEmail, 'test-password-hash'],
    );
    const ghostUserId = Number(ghostUserRes.rows[0].id);
    await pgPool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      ghostUserId,
      '$2b$12$fyQeFJg/KUQch2k9qB1iv.y/Z5wmz9rmKWSGBbsJiyYi2lIZq.ZZm',
    ]);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ghostEmail, password: 'Dosen123!' });
    if (loginRes.body.data?.accessToken) {
      const res = await request(app)
        .get('/api/v1/substitute')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    // Cleanup
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostUserId]);
  });

  it('GET /substitute/:id — dosen lihat detail substitute miliknya → 200', async () => {
    const substituteId = createdSubstituteIds[0];
    const res = await request(app)
      .get(`/api/v1/substitute/${substituteId}`)
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.id)).toBe(substituteId);
    expect(res.body.data.original_lecturer_name).toBeDefined();
    expect(res.body.data.substitute_lecturer_name).toBeDefined();
    expect(res.body.data.course_code).toBeDefined();
  });

  it('GET /substitute/:id — id invalid → 400', async () => {
    const res = await request(app)
      .get('/api/v1/substitute/abc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid substitute ID');
  });

  it('GET /substitute/:id — dosen tanpa lecturerId → 403', async () => {
    // Buat user dosen tanpa profil lecturer sendiri (self-sufficient — seed kini
    // mengisi profil lecturer untuk semua user dosen, tak ada yang kosong)
    const ghostEmail = `ghost-dosen-${Date.now()}@siak.test`;
    const ghostUserRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Ghost Dosen No Lecturer', (SELECT id FROM roles WHERE code = 'dosen'), true)
       RETURNING id`,
      [ghostEmail, 'test-password-hash'],
    );
    const ghostUserId = Number(ghostUserRes.rows[0].id);
    // login butuh bcrypt hash; pakai hash seed 'Dosen123!' yang sudah dikenal (V009)
    await pgPool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      ghostUserId,
      '$2b$12$fyQeFJg/KUQch2k9qB1iv.y/Z5wmz9rmKWSGBbsJiyYi2lIZq.ZZm',
    ]);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ghostEmail, password: 'Dosen123!' });
    if (loginRes.body.data?.accessToken) {
      const noLecturerToken = loginRes.body.data.accessToken;
      const substituteId = createdSubstituteIds[0];
      const res = await request(app)
        .get(`/api/v1/substitute/${substituteId}`)
        .set('Authorization', `Bearer ${noLecturerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Akun bukan dosen aktif');
    }
    // Cleanup
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostUserId]);
  });

  it('GET /substitute/:id — tidak ada → 404', async () => {
    const res = await request(app)
      .get('/api/v1/substitute/999999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Substitute teaching tidak ditemukan');
  });

  it('GET /substitute/:id — dosen lihat substitute bukan miliknya → 404', async () => {
    // Buat substitute milik dosen2 (dosen1 bukan original/substitute)
    // Use a different schedule from dosen2's classes (or create one)
    const otherScheduleRes = await pgPool.query(
      `SELECT s.id FROM schedules s JOIN classes c ON c.id = s.class_id WHERE c.lecturer_id = $1 LIMIT 1`,
      [dosen2LecturerId],
    );
    if (otherScheduleRes.rows.length > 0) {
      const otherScheduleId = Number(otherScheduleRes.rows[0].id);
      const otherClassRes = await pgPool.query(`SELECT class_id FROM schedules WHERE id = $1`, [
        otherScheduleId,
      ]);
      const otherClassId = Number(otherClassRes.rows[0].class_id);

      const createRes = await request(app)
        .post('/api/v1/substitute')
        .set('Authorization', `Bearer ${dosen2Token}`)
        .send({
          originalLecturerId: dosen2LecturerId,
          substituteLecturerId: dosenLecturerId,
          classId: otherClassId,
          scheduleId: otherScheduleId,
          reason: 'Test other dosen',
        });

      if (createRes.status === 201) {
        const otherSubstituteId = Number(createRes.body.data.id);
        createdSubstituteIds.push(otherSubstituteId);

        // Dosen1 coba lihat
        const res = await request(app)
          .get(`/api/v1/substitute/${otherSubstituteId}`)
          .set('Authorization', `Bearer ${dosenToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Substitute teaching tidak ditemukan');
      }
    }
  });

  it('PUT /substitute/:id/cancel — original lecturer cancel → 200', async () => {
    // Use the first test's substitute (schedule 37, createdSubstituteIds[0])
    const substituteId = createdSubstituteIds[0];
    // Now cancel as original lecturer
    const res = await request(app)
      .put(`/api/v1/substitute/${substituteId}/cancel`)
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ reason: 'Sudah sembuh' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.reason).toBe('Sudah sembuh');
  });

  it('PUT /substitute/:id/cancel — dosen tanpa lecturerId → 403', async () => {
    // Buat user dosen tanpa profil lecturer sendiri (self-sufficient — seed kini
    // mengisi profil lecturer untuk semua user dosen, tak ada yang kosong)
    const ghostEmail = `ghost-dosen-${Date.now()}@siak.test`;
    const ghostUserRes = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Ghost Dosen No Lecturer', (SELECT id FROM roles WHERE code = 'dosen'), true)
       RETURNING id`,
      [ghostEmail, 'test-password-hash'],
    );
    const ghostUserId = Number(ghostUserRes.rows[0].id);
    // login butuh bcrypt hash; pakai hash seed 'Dosen123!' yang sudah dikenal (V009)
    await pgPool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      ghostUserId,
      '$2b$12$fyQeFJg/KUQch2k9qB1iv.y/Z5wmz9rmKWSGBbsJiyYi2lIZq.ZZm',
    ]);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ghostEmail, password: 'Dosen123!' });
    if (loginRes.body.data?.accessToken) {
      const noLecturerToken = loginRes.body.data.accessToken;
      const substituteId = createdSubstituteIds[0];
      const res = await request(app)
        .put(`/api/v1/substitute/${substituteId}/cancel`)
        .set('Authorization', `Bearer ${noLecturerToken}`)
        .send({ reason: 'Test' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Akun bukan dosen aktif');
    }
    // Cleanup
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostUserId]);
  });

  it('PUT /substitute/:id/cancel — id invalid → 400', async () => {
    const res = await request(app)
      .put('/api/v1/substitute/abc/cancel')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid substitute ID');
  });

  it('PUT /substitute/:id/cancel — tidak ada → 404', async () => {
    const res = await request(app)
      .put('/api/v1/substitute/999999999/cancel')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Test' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Substitute teaching tidak ditemukan');
  });

  it('PUT /substitute/:id/cancel — substitute lecturer (bukan original) coba cancel → 404', async () => {
    // Substitute lecturer coba cancel milik dosen1
    const substituteId = createdSubstituteIds[0]; // original = dosen1, substitute = dosen2
    const res = await request(app)
      .put(`/api/v1/substitute/${substituteId}/cancel`)
      .set('Authorization', `Bearer ${dosen2Token}`)
      .send({ reason: 'Test' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('tidak berhak membatalkan');
  });

  it('PUT /substitute/:id/cancel — sudah cancelled → 400', async () => {
    // Create a substitute and cancel it first, then try to cancel again —
    // pakai schedule ketiga (kelas dosen ini, belum punya substitute aktif)
    const testScheduleId = scheduleId3;
    const testClassRes = await pgPool.query(`SELECT class_id FROM schedules WHERE id = $1`, [
      testScheduleId,
    ]);
    const testClassId = Number(testClassRes.rows[0].class_id);

    const createRes = await request(app)
      .post('/api/v1/substitute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originalLecturerId: dosenLecturerId,
        substituteLecturerId: dosen2LecturerId,
        classId: testClassId,
        scheduleId: testScheduleId,
        reason: 'Test double cancel',
      });

    expect(createRes.status).toBe(201);
    const substituteId = Number(createRes.body.data.id);
    createdSubstituteIds.push(substituteId);

    // Cancel first time
    await request(app)
      .put(`/api/v1/substitute/${substituteId}/cancel`)
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ reason: 'Pertama' });

    // Cancel second time - should fail with 400
    const res = await request(app)
      .put(`/api/v1/substitute/${substituteId}/cancel`)
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ reason: 'Lagi' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Substitute sudah dibatalkan');
  });
});
