// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-secret-min-32-chars-long-for-hs256-alg';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-chars-long-for-hs256-alg';
process.env.BCRYPT_ROUNDS ??= '4';

import request from 'supertest';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

const app = createApp();

describe('T3.1 Dosen Pilih MK', () => {
  let dosenToken: string;
  let dosenLecturerId: number;
  let adminToken: string;
  let adminUserId: number;
  let semesterId: number;
  let curriculumId: number;
  let prodiId: number;

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    // Get active semester
    const semRes = await pgPool.query(`SELECT id FROM semesters WHERE is_active LIMIT 1`);
    semesterId = Number(semRes.rows[0].id);

    // Use existing seed dosen (pick first dosen with lecturer profile)
    const seedDosenRes = await pgPool.query(
      `SELECT u.id, u.email, l.id as lecturer_id, l.prodi_id 
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
    prodiId = Number(seedDosenRes.rows[0].prodi_id);
    dosenToken = await login(seedDosenRes.rows[0].email, 'Dosen123!');

    // Get a curriculum for this prodi+semester (use any, we'll filter by prodi in test)
    const curRes = await pgPool.query(
      `SELECT cur.id FROM curricula cur
       WHERE cur.prodi_id = $1 AND cur.semester_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM lecturer_course_selections lcs 
           WHERE lcs.lecturer_id = $3 AND lcs.curriculum_id = cur.id
         )
       LIMIT 1`,
      [prodiId, semesterId, dosenLecturerId],
    );
    let curriculumIdToUse: number;
    if (curRes.rows.length === 0) {
      // All curricula already have selections for this dosen; create a new one for testing
      const courseRes = await pgPool.query(
        `INSERT INTO courses (code, name, credits) VALUES ($1, $2, 3) RETURNING id`,
        [`T31TEST${Date.now()}`, 'T3.1 Test Course'],
      );
      const courseId = Number(courseRes.rows[0].id);

      const curRes2 = await pgPool.query(
        `INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
         VALUES ($1, $2, $3, true, 1) RETURNING id`,
        [prodiId, semesterId, courseId],
      );
      curriculumIdToUse = Number(curRes2.rows[0].id);
    } else {
      curriculumIdToUse = Number(curRes.rows[0].id);
    }
    curriculumId = curriculumIdToUse;

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

  it('GET /dosen/courses/available → list MK for dosen prodi+semester', async () => {
    const res = await request(app)
      .get('/api/v1/dosen/courses/available')
      .set('Authorization', `Bearer ${dosenToken}`)
      .query({ semesterId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);

    // Verify structure
    const item = res.body.data.items[0];
    expect(item).toHaveProperty('curriculum_id');
    expect(item).toHaveProperty('course_code');
    expect(item).toHaveProperty('course_name');
    expect(item).toHaveProperty('credits');
    expect(item).toHaveProperty('semester_number');
    expect(item).toHaveProperty('is_mandatory');
    expect(item).toHaveProperty('available_classes');
    expect(item).toHaveProperty('selection_status');
  });

  it('POST /dosen/courses/select → submit pilihan MK', async () => {
    const res = await request(app)
      .post('/api/v1/dosen/courses/select')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        curriculumId,
        priority: 1,
        notes: 'Minat mengajar MK ini',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.lecturer_id).toBe(String(dosenLecturerId));
    expect(res.body.data.curriculum_id).toBe(String(curriculumId));
    expect(res.body.data.status).toBe('diajukan');
    expect(res.body.data.priority).toBe(1);
    expect(res.body.data.notes).toBe('Minat mengajar MK ini');
  });

  it('POST /dosen/courses/select → update existing pilihan (diajukan/ditolak)', async () => {
    const res = await request(app)
      .post('/api/v1/dosen/courses/select')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        curriculumId,
        priority: 2,
        notes: 'Updated prioritas',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.priority).toBe(2);
    expect(res.body.data.notes).toBe('Updated prioritas');
    expect(res.body.data.status).toBe('diajukan'); // reset to diajukan on update
  });

  it('GET /dosen/courses/my → lihat pilihan sendiri', async () => {
    const res = await request(app)
      .get('/api/v1/dosen/courses/my')
      .set('Authorization', `Bearer ${dosenToken}`)
      .query({ semesterId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);

    const mySelection = res.body.data.items.find(
      (s: { curriculum_id: number | string }) => Number(s.curriculum_id) === curriculumId,
    );
    expect(mySelection).toBeDefined();
    expect(mySelection.priority).toBe(2);
    expect(mySelection.status).toBe('diajukan');
  });

  it('GET /dosen/courses/all → admin lihat semua pilihan (kurikulum.manage)', async () => {
    const res = await request(app)
      .get('/api/v1/dosen/courses/all')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ semesterId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);

    const adminView = res.body.data.items.find(
      (s: { curriculum_id: number | string; lecturer_id: number | string }) =>
        Number(s.curriculum_id) === curriculumId && Number(s.lecturer_id) === dosenLecturerId,
    );
    expect(adminView).toBeDefined();
    expect(adminView).toHaveProperty('lecturer_name');
    expect(adminView).toHaveProperty('nidn');
    expect(adminView).toHaveProperty('course_code');
    expect(adminView).toHaveProperty('course_name');
  });

  it('PUT /dosen/courses/:id/review → admin review pilihan (diterima)', async () => {
    // Get the selection ID
    const myRes = await request(app)
      .get('/api/v1/dosen/courses/my')
      .set('Authorization', `Bearer ${dosenToken}`)
      .query({ semesterId });

    const mySelection = myRes.body.data.items.find(
      (s: { curriculum_id: number | string }) => Number(s.curriculum_id) === curriculumId,
    );
    expect(mySelection).toBeDefined();

    const res = await request(app)
      .put(`/api/v1/dosen/courses/${mySelection.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'diterima',
        reviewNotes: 'Disetujui, sesuai keahlian',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('diterima');
    expect(res.body.data.review_notes).toBe('Disetujui, sesuai keahlian');
    expect(res.body.data.reviewed_by).toBe(String(adminUserId));
    expect(res.body.data.reviewed_at).toBeDefined();
  });

  it('POST /dosen/courses/select → cannot modify after diterima', async () => {
    const res = await request(app)
      .post('/api/v1/dosen/courses/select')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({
        curriculumId,
        priority: 3,
        notes: 'Coba ubah setelah diterima',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('already accepted');
  });

  it('PUT /dosen/courses/:id/review → admin tolak pilihan', async () => {
    // Create another selection for testing rejection
    const anotherCurRes = await pgPool.query(
      `SELECT cur.id FROM curricula cur
       WHERE cur.prodi_id = $1 AND cur.semester_id = $2 AND cur.id != $3
         AND NOT EXISTS (
           SELECT 1 FROM lecturer_course_selections lcs 
           WHERE lcs.lecturer_id = $4 AND lcs.curriculum_id = cur.id
         )
       LIMIT 1`,
      [prodiId, semesterId, curriculumId, dosenLecturerId],
    );
    if (anotherCurRes.rows.length > 0) {
      const anotherCurriculumId = Number(anotherCurRes.rows[0].id);

      // Create selection
      const createRes = await request(app)
        .post('/api/v1/dosen/courses/select')
        .set('Authorization', `Bearer ${dosenToken}`)
        .send({
          curriculumId: anotherCurriculumId,
          priority: 1,
          notes: 'Untuk ditolak',
        });

      expect(createRes.status).toBe(201);

      // Now reject it
      const res = await request(app)
        .put(`/api/v1/dosen/courses/${createRes.body.data.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'ditolak',
          reviewNotes: 'Kuota sudah penuh',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ditolak');
      expect(res.body.data.review_notes).toBe('Kuota sudah penuh');
    }
  });
});
