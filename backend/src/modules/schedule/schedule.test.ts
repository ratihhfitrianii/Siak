// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= `postgres://${process.env.PGUSER || 'siak'}:${process.env.PGPASSWORD || 'siak_dev_password'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'siak'}`;
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-jwt-secret-minimum-16-chars-long';
process.env.IMPORT_DEFAULT_PASSWORD ??= 'Import123!';
process.env.BCRYPT_ROUNDS ??= '4';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

const app = createApp();

describe('T3.2 Schedule — Jadwal Kelas + Ketersediaan', () => {
  let adminToken: string;
  let adminUserId: number;
  let dosenToken: string;
  let dosenLecturerId: number;
  let classId: number;
  let semesterId: number;
  let mhsToken: string;
  let ghostDosenUserId: number;
  let ghostDosenToken: string;

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: email, password: password });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    // Get active semester
    const semRes = await pgPool.query(`SELECT id FROM semesters WHERE is_active LIMIT 1`);
    semesterId = Number(semRes.rows[0].id);

    // Create admin akademik
    const adminEmail = `t32-admin-${Date.now()}@siak.local`;
    // Use pre-hashed bcrypt password (same as seed: 'Admin123!' with 12 rounds)
    const adminPasswordHash = '$2b$12$8HU58T/7ACy5X9z2WhzQveyfvkvbEEhJOlB8Mz.xpyvTdUMMsVKCa';
    await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       SELECT $1, $2, 'T3.2 Admin', r.id, true
       FROM roles r WHERE r.code = 'admin_akademik'`,
      [adminEmail, adminPasswordHash],
    );
    adminUserId = (await pgPool.query(`SELECT id FROM users WHERE email = $1`, [adminEmail]))
      .rows[0].id;
    adminToken = await login(adminEmail, 'Admin123!');

    // Mahasiswa (untuk deny 403 — tidak punya schedule.manage / lecturer.availability)
    const mhsRes = await pgPool.query(
      `SELECT u.email FROM students s JOIN users u ON u.id = s.user_id
       WHERE s.is_active AND u.is_active LIMIT 1`,
    );
    mhsToken = await login(mhsRes.rows[0].email, 'Mhs123!');

    // Ghost dosen (user role dosen TANPA row lecturers) — untuk availability 404
    const ghostDosenEmail = `t32-ghost-dosen-${Date.now()}@siak.local`;
    await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       SELECT $1, $2, 'T3.2 Ghost Dosen', r.id, true
       FROM roles r WHERE r.code = 'dosen'`,
      [ghostDosenEmail, adminPasswordHash],
    );
    ghostDosenUserId = Number(
      (await pgPool.query(`SELECT id FROM users WHERE email = $1`, [ghostDosenEmail])).rows[0].id,
    );
    ghostDosenToken = await login(ghostDosenEmail, 'Admin123!');

    // Use existing seed dosen
    const seedDosenRes = await pgPool.query(
      `SELECT u.id, u.email, l.id as lecturer_id 
       FROM users u 
       JOIN lecturers l ON l.user_id = u.id 
       JOIN roles r ON r.id = u.role_id 
       WHERE r.code = 'dosen' AND u.is_active AND l.is_active
       ORDER BY u.id LIMIT 1`,
    );
    if (seedDosenRes.rows.length === 0) {
      throw new Error('No seed dosen available');
    }
    dosenLecturerId = Number(seedDosenRes.rows[0].lecturer_id);
    dosenToken = await login(seedDosenRes.rows[0].email, 'Dosen123!');

    // Get a class for this dosen (with active schedule)
    const classRes = await pgPool.query(
      `SELECT cl.id FROM classes cl
       WHERE cl.lecturer_id = $1 AND cl.is_active
       LIMIT 1`,
      [dosenLecturerId],
    );
    if (classRes.rows.length === 0) {
      // Create a curriculum + class for testing
      const courseRes = await pgPool.query(
        `INSERT INTO courses (code, name, credits) VALUES ($1, $2, 3) RETURNING id`,
        [`T32TEST${Date.now()}`, 'T3.2 Test Course'],
      );
      const courseId = Number(courseRes.rows[0].id);

      // Get prodi_id from the dosen's lecturer profile
      const dosenProdiRes = await pgPool.query(
        `SELECT prodi_id, user_id FROM lecturers WHERE id = $1`,
        [dosenLecturerId],
      );
      const prodiId = Number(dosenProdiRes.rows[0].prodi_id);
      const dosenUserId = Number(dosenProdiRes.rows[0].user_id);

      const curRes = await pgPool.query(
        `INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
         VALUES ($1, $2, $3, true, 1) RETURNING id`,
        [prodiId, semesterId, courseId],
      );
      const curriculumId = Number(curRes.rows[0].id);

      const classRes2 = await pgPool.query(
        `INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, day_of_week, start_time, end_time, is_active)
         VALUES ($1, 'A', $2, 30, 0, 1, '08:00', '10:00', true) RETURNING id`,
        [curriculumId, dosenUserId], // classes.lecturer_id references users.id
      );
      classId = Number(classRes2.rows[0].id);
    } else {
      classId = Number(classRes.rows[0].id);
    }
  }, 30000);

  afterAll(async () => {
    // Cleanup test data
    await pgPool.query(`DELETE FROM schedules WHERE class_id = $1`, [classId]);
    await pgPool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
    await pgPool.query(`DELETE FROM users WHERE id = $1`, [adminUserId]);
    if (ghostDosenUserId) await pgPool.query(`DELETE FROM users WHERE id = $1`, [ghostDosenUserId]);
    // Don't delete dosenUserId - it's a seed user
    await pgPool.end();
  }, 30000);

  it('GET /schedule/availability → dosen cek ketersediaan pada tanggal', async () => {
    const today = new Date().toISOString().split('T')[0];

    const res = await request(app)
      .get('/api/v1/schedule/availability')
      .set('Authorization', `Bearer ${dosenToken}`)
      .query({ date: today });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('date');
    expect(res.body.data).toHaveProperty('dayOfWeek');
    expect(res.body.data).toHaveProperty('busySlots');
    expect(res.body.data).toHaveProperty('availableSlots');
    expect(res.body.data).toHaveProperty('isAvailable');
  });

  it('GET /schedule/class/:classId → admin lihat jadwal kelas', async () => {
    const res = await request(app)
      .get(`/api/v1/schedule/class/${classId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('class');
    expect(res.body.data).toHaveProperty('schedules');
    expect(Array.isArray(res.body.data.schedules)).toBe(true);
  });

  it('POST /schedule → admin buat jadwal pertemuan', async () => {
    const res = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId,
        meetingNumber: 1,
        scheduledDate: '2025-01-15',
        topic: 'Pendahuluan',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.class_id).toBe(String(classId));
    expect(res.body.data.meeting_number).toBe(1);
    expect(res.body.data.scheduled_date).toMatch(/^2025-01-1[45]/);
    expect(res.body.data.topic).toBe('Pendahuluan');
    expect(res.body.data.is_completed).toBe(false);
  });

  it('POST /schedule → duplicate meeting number → 409', async () => {
    const res = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId,
        meetingNumber: 1,
        scheduledDate: '2025-01-16',
        topic: 'Duplicate',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('PUT /schedule/:id → admin update jadwal', async () => {
    // Get the schedule ID
    const listRes = await pgPool.query(
      `SELECT id FROM schedules WHERE class_id = $1 AND meeting_number = 1`,
      [classId],
    );
    const scheduleId = Number(listRes.rows[0].id);

    const res = await request(app)
      .put(`/api/v1/schedule/${scheduleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        topic: 'Updated Topic',
        isCompleted: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.topic).toBe('Updated Topic');
    expect(res.body.data.is_completed).toBe(true);
    expect(res.body.data.completed_at).toBeDefined();
  });

  it('DELETE /schedule/:id → admin hapus jadwal', async () => {
    // Create another schedule to delete
    const createRes = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId,
        meetingNumber: 2,
        scheduledDate: '2025-01-22',
        topic: 'To Delete',
      });
    const scheduleId = Number(createRes.body.data.id);

    const res = await request(app)
      .delete(`/api/v1/schedule/${scheduleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);

    // Verify deleted
    const checkRes = await pgPool.query(`SELECT id FROM schedules WHERE id = $1`, [scheduleId]);
    expect(checkRes.rows.length).toBe(0);
  });

  it('GET /schedule/availability → dosen lihat busy slots setelah jadwal dibuat', async () => {
    // Create a schedule for a specific date
    const createRes = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId,
        meetingNumber: 3,
        scheduledDate: '2025-02-01',
        topic: 'Availability Test',
      });
    const scheduleId = Number(createRes.body.data.id);

    // Check availability on that date
    const res = await request(app)
      .get('/api/v1/schedule/availability')
      .set('Authorization', `Bearer ${dosenToken}`)
      .query({ date: '2025-02-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.busySlots.length).toBeGreaterThan(0);
    const busy = res.body.data.busySlots.find(
      (s: { topic: string }) => s.topic === 'Availability Test',
    );
    expect(busy).toBeDefined();

    // Cleanup
    await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [scheduleId]);
  });

  // ============================================================
  // Branch-coverage: error paths & RBAC
  // ============================================================

  it('GET /schedule/availability — tanpa date → 400', async () => {
    const res = await request(app)
      .get('/api/v1/schedule/availability')
      .set('Authorization', `Bearer ${dosenToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('date required');
  });

  it('GET /schedule/availability — dosen tanpa profil lecturer → 404', async () => {
    const res = await request(app)
      .get('/api/v1/schedule/availability?date=2025-03-01')
      .set('Authorization', `Bearer ${ghostDosenToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Lecturer profile not found');
  });

  it('GET /schedule/availability — mahasiswa → 403', async () => {
    const res = await request(app)
      .get('/api/v1/schedule/availability?date=2025-03-01')
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(403);
  });

  it('GET /schedule/class/:classId — id invalid → 400', async () => {
    const res = await request(app)
      .get('/api/v1/schedule/class/abc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid class ID');
  });

  it('GET /schedule/class/:classId — kelas tidak ada → 404', async () => {
    const res = await request(app)
      .get('/api/v1/schedule/class/999999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Class not found');
  });

  it('GET /schedule/class/:classId — mahasiswa → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/schedule/class/${classId}`)
      .set('Authorization', `Bearer ${mhsToken}`);

    expect(res.status).toBe(403);
  });

  it('POST /schedule — kelas tidak ada → 404', async () => {
    const res = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classId: 999999999, meetingNumber: 1, scheduledDate: '2025-03-01' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Class not found');
  });

  it('POST /schedule — tanpa topic (opsional) → 201 topic null', async () => {
    const res = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classId, meetingNumber: 5, scheduledDate: '2025-03-05' });

    expect(res.status).toBe(201);
    expect(res.body.data.topic).toBeNull();

    await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [Number(res.body.data.id)]);
  });

  it('POST /schedule — dosen → 403', async () => {
    const res = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ classId, meetingNumber: 6, scheduledDate: '2025-03-06' });

    expect(res.status).toBe(403);
  });

  it('PUT /schedule/:id — id invalid → 400', async () => {
    const res = await request(app)
      .put('/api/v1/schedule/abc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topic: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid schedule ID');
  });

  it('PUT /schedule/:id — tidak ada → 404', async () => {
    const res = await request(app)
      .put('/api/v1/schedule/999999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topic: 'X' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Schedule not found');
  });

  it('PUT /schedule/:id — meeting number duplikat → 409', async () => {
    // Buat jadwal lain dulu, lalu PUT ke meeting_number=1 (sudah dipakai)
    const createRes = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classId, meetingNumber: 7, scheduledDate: '2025-03-07' });
    const otherId = Number(createRes.body.data.id);

    const res = await request(app)
      .put(`/api/v1/schedule/${otherId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ meetingNumber: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Meeting number already exists');

    await pgPool.query(`DELETE FROM schedules WHERE id = $1`, [otherId]);
  });

  it('DELETE /schedule/:id — id invalid → 400', async () => {
    const res = await request(app)
      .delete('/api/v1/schedule/abc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid schedule ID');
  });

  it('DELETE /schedule/:id — tidak ada → 404', async () => {
    const res = await request(app)
      .delete('/api/v1/schedule/999999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Schedule not found');
  });
});
