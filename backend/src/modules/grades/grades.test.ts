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

describe('Grades module (T1.8)', () => {
  const app = createApp();
  let tokenByRole: Map<string, string>;
  let student1Id: number;
  let classId: number;
  const krsItemIds: number[] = [];
  let grade1Id: number;
  const cleanupIds: { submissionId?: number; periodId?: number; classIds: number[] } = {
    classIds: [],
  };

  async function login(label: string, uid: number): Promise<string> {
    const password = label.startsWith('admin')
      ? 'Admin123!'
      : label === 'dosen' || label === 'dosen2'
        ? 'Dosen123!'
        : 'Mhs123!';
    const email = (await pgPool.query('SELECT email FROM users WHERE id = $1', [uid])).rows[0]
      .email;
    const login = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: password });
    return login.body.data.accessToken;
  }

  // Timeout diperpanjang (30s): 4× query seed + 6 login + setup data bisa > 5s saat DB sibuk
  // (kegagalan hook timeout 5s default saat full-suite paralel — pelajaran T1.13).
  beforeAll(async () => {
    // T1.13 determinisme: ambil user SEED terkecil per peran (ORDER BY id) dan
    // eksklusi imp-*/t110* — leftover import run lama (paralel/terbunuh) bisa
    // terpilih `find` acak lalu DIHAPUS import.test.ts saat berjalan → login gagal.
    const seedUserIds = async (code: string): Promise<number | undefined> => {
      const res = await pgPool.query(
        `SELECT u.id FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.code = $1 AND u.is_active
           AND u.email NOT LIKE 'imp-%' AND u.email NOT LIKE 't110%'
         ORDER BY u.id LIMIT 1`,
        [code],
      );
      return res.rows[0]?.id as number | undefined;
    };
    const adminSistemId = await seedUserIds('admin_sistem');
    const adminAkademikId = await seedUserIds('admin_akademik');
    const dosenId = await seedUserIds('dosen');
    const mahasiswaId = await seedUserIds('mahasiswa');
    const dosen2 = await pgPool.query(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'dosen' AND u.is_active AND u.id <> $1
         AND u.email NOT LIKE 'imp-%' AND u.email NOT LIKE 't110%'
       ORDER BY u.id LIMIT 1`,
      [dosenId],
    );
    const dosen2Id = dosen2.rows[0]?.id as number | undefined;
    const mahasiswa2 = await pgPool.query(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'mahasiswa' AND u.is_active AND u.id <> $1
         AND u.email NOT LIKE 'imp-%' AND u.email NOT LIKE 't110%'
       ORDER BY u.id LIMIT 1`,
      [mahasiswaId],
    );
    const mahasiswa2Id = mahasiswa2.rows[0]?.id as number | undefined;

    tokenByRole = new Map();
    for (const [label, uid] of [
      ['admin_sistem', adminSistemId],
      ['admin_akademik', adminAkademikId],
      ['dosen', dosenId],
      ['mahasiswa', mahasiswaId],
      ['dosen2', dosen2Id],
      ['mahasiswa2', mahasiswa2Id],
    ] as Array<[string, number | undefined]>) {
      if (uid) tokenByRole.set(label, await login(label, uid));
      else tokenByRole.set(label, '');
    }

    // Setup data test: 1 periode KRS, 1 submission, 4 kelas, 4 krs_items
    const sem = await pgPool.query('SELECT id FROM semesters ORDER BY id LIMIT 1');
    const semesterId = Number(sem.rows[0].id);
    const cur = await pgPool.query('SELECT id FROM curricula ORDER BY id LIMIT 1');
    const curriculumId = Number(cur.rows[0].id);
    const student1 = await pgPool.query(
      'SELECT s.id FROM students s JOIN users u ON u.id = s.user_id WHERE u.id = $1',
      [mahasiswaId],
    );
    student1Id = Number(student1.rows[0]?.id);

    const ts = Date.now().toString().slice(-8);
    const period = await pgPool.query(
      `INSERT INTO krs_periods (semester_id, name, start_date, end_date)
       VALUES ($1, $2, now() - interval '1 day', now() + interval '30 days')
       RETURNING id`,
      [semesterId, `T1.8-TEST-${ts}`],
    );
    const periodId = Number(period.rows[0].id);
    cleanupIds.periodId = periodId;

    const submission = await pgPool.query(
      `INSERT INTO krs_submissions (student_id, krs_period_id, status)
       VALUES ($1, $2, 'draft')
       RETURNING id`,
      [student1Id, periodId],
    );
    const submissionId = Number(submission.rows[0].id);
    cleanupIds.submissionId = submissionId;

    for (let i = 1; i <= 4; i++) {
      const cls = await pgPool.query(
        `INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity)
         VALUES ($1, $2, $3, 30)
         RETURNING id`,
        [curriculumId, `T18-${ts}-${i}`, dosenId],
      );
      const newClassId = Number(cls.rows[0].id);
      cleanupIds.classIds.push(newClassId);
      if (i === 1) classId = newClassId;

      const item = await pgPool.query(
        `INSERT INTO krs_items (krs_submission_id, class_id)
         VALUES ($1, $2)
         RETURNING id`,
        [submissionId, newClassId],
      );
      krsItemIds.push(Number(item.rows[0].id));
    }
  }, 30_000);

  afterAll(async () => {
    if (cleanupIds.submissionId) {
      // Cascade menghapus krs_items dan grades
      await pgPool.query('DELETE FROM krs_submissions WHERE id = $1', [cleanupIds.submissionId]);
    }
    if (cleanupIds.classIds.length > 0) {
      await pgPool.query('DELETE FROM classes WHERE id = ANY($1::bigint[])', [cleanupIds.classIds]);
    }
    if (cleanupIds.periodId) {
      await pgPool.query('DELETE FROM krs_periods WHERE id = $1', [cleanupIds.periodId]);
    }
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite dalam worker yang sama;
    // menutupnya menyebabkan race "Cannot use a pool after calling end" (jest forceExit: true).
    // Cleanup data dilakukan per-suite.
  });

  describe('POST /api/v1/grades — input nilai baru', () => {
    it('Dosen pengampu input nilai (bobot 20/30/50) → 201', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ krsItemId: krsItemIds[0], tugasScore: 80, utsScore: 75, uasScore: 85 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // 80*0.2 + 75*0.3 + 85*0.5 = 16 + 22.5 + 42.5 = 81 → A- (3.70)
      expect(res.body.data.final_score).toBe('81.00');
      expect(res.body.data.grade_letter).toBe('A-');
      expect(res.body.data.grade_point).toBe('3.70');
      grade1Id = Number(res.body.data.id);
    });

    it('Remedial: max(UAS asli 60, remedial 80) → final 73.5 → B (3.00)', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({
          krsItemId: krsItemIds[1],
          tugasScore: 70,
          utsScore: 65,
          uasScore: 60,
          remedialUasScore: 80,
        });
      expect(res.status).toBe(201);
      // 70*0.2 + 65*0.3 + max(60,80)*0.5 = 14 + 19.5 + 40 = 73.5 → B
      expect(res.body.data.final_score).toBe('73.50');
      expect(res.body.data.grade_letter).toBe('B');
      expect(res.body.data.grade_point).toBe('3.00');
      expect(res.body.data.remedial_uas_score).toBe('80.00');
    });

    it('Admin Akademik input nilai untuk kelas mana pun → 201', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ krsItemId: krsItemIds[2], tugasScore: 90, utsScore: 88, uasScore: 92 });
      expect(res.status).toBe(201);
      // 90*0.2 + 88*0.3 + 92*0.5 = 18 + 26.4 + 46 = 90.4 → A (4.00)
      expect(res.body.data.final_score).toBe('90.40');
      expect(res.body.data.grade_letter).toBe('A');
      expect(res.body.data.grade_point).toBe('4.00');
    });

    it('Tanpa komponen nilai → final_score null, grade_letter null', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ krsItemId: krsItemIds[3] });
      expect(res.status).toBe(201);
      expect(res.body.data.final_score).toBeNull();
      expect(res.body.data.grade_letter).toBeNull();
    });

    it('Duplicate grade untuk krs_item yang sama → 409', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ krsItemId: krsItemIds[0], tugasScore: 80, utsScore: 75, uasScore: 85 });
      expect(res.status).toBe(409);
    });

    it('krsItemId wajib diisi → 400', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ tugasScore: 80 });
      expect(res.status).toBe(400);
    });

    it('krsItemId tidak ditemukan → 404', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ krsItemId: 99999999, tugasScore: 80 });
      expect(res.status).toBe(404);
    });

    it('Skor di luar rentang 0-100 → 400', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ krsItemId: krsItemIds[0], tugasScore: 150 });
      expect(res.status).toBe(400);
    });

    it('Mahasiswa tidak boleh input → 403', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .send({ krsItemId: krsItemIds[0], tugasScore: 80 });
      expect(res.status).toBe(403);
    });

    it('Dosen bukan pengampu kelas → 403', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen2')}`)
        .send({ krsItemId: krsItemIds[0], tugasScore: 80 });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/grades/:id — edit nilai + atribusi', () => {
    it('Admin edit nilai + atribusi "diperbarui oleh X"', async () => {
      const res = await request(app)
        .put(`/api/v1/grades/${grade1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ tugasScore: 85, utsScore: 80, uasScore: 90 });
      expect(res.status).toBe(200);
      // 85*0.2 + 80*0.3 + 90*0.5 = 17 + 24 + 45 = 86 → A (4.00)
      expect(res.body.data.final_score).toBe('86.00');
      expect(res.body.data.grade_letter).toBe('A');
      expect(res.body.data.grade_point).toBe('4.00');
      expect(res.body.message).toContain('diperbarui oleh');
      expect(res.body.message).toContain('admin_akademik');
    });

    it('Dosen pengampu boleh edit nilai kelasnya → 200', async () => {
      const res = await request(app)
        .put(`/api/v1/grades/${grade1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ uasScore: 95 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Dosen bukan pengampu → 403', async () => {
      const res = await request(app)
        .put(`/api/v1/grades/${grade1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('dosen2')}`)
        .send({ uasScore: 95 });
      expect(res.status).toBe(403);
    });

    it('Mahasiswa tidak boleh edit → 403', async () => {
      const res = await request(app)
        .put(`/api/v1/grades/${grade1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .send({ uasScore: 95 });
      expect(res.status).toBe(403);
    });

    it('Grade ID tidak valid → 400', async () => {
      const res = await request(app)
        .put('/api/v1/grades/abc')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ uasScore: 95 });
      expect(res.status).toBe(400);
    });

    it('Grade tidak ditemukan → 404', async () => {
      const res = await request(app)
        .put('/api/v1/grades/99999999')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ uasScore: 95 });
      expect(res.status).toBe(404);
    });

    it('Skor di luar rentang saat edit → 400', async () => {
      const res = await request(app)
        .put(`/api/v1/grades/${grade1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ utsScore: -5 });
      expect(res.status).toBe(400);
    });
  });

  describe('Skala nilai (scoreToGrade)', () => {
    async function setScores(t: number, u: number, a: number) {
      return request(app)
        .put(`/api/v1/grades/${grade1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ tugasScore: t, utsScore: u, uasScore: a });
    }

    it('85 → A (4.00)', async () => {
      const res = await setScores(85, 85, 85);
      expect(res.body.data.final_score).toBe('85.00');
      expect(res.body.data.grade_letter).toBe('A');
      expect(res.body.data.grade_point).toBe('4.00');
    });

    it('80 → A- (3.70)', async () => {
      const res = await setScores(80, 80, 80);
      expect(res.body.data.final_score).toBe('80.00');
      expect(res.body.data.grade_letter).toBe('A-');
      expect(res.body.data.grade_point).toBe('3.70');
    });

    it('75 → B+ (3.30)', async () => {
      const res = await setScores(75, 75, 75);
      expect(res.body.data.final_score).toBe('75.00');
      expect(res.body.data.grade_letter).toBe('B+');
      expect(res.body.data.grade_point).toBe('3.30');
    });

    it('70 → B (3.00)', async () => {
      const res = await setScores(70, 70, 70);
      expect(res.body.data.final_score).toBe('70.00');
      expect(res.body.data.grade_letter).toBe('B');
      expect(res.body.data.grade_point).toBe('3.00');
    });

    it('65 → B- (2.70)', async () => {
      const res = await setScores(65, 65, 65);
      expect(res.body.data.final_score).toBe('65.00');
      expect(res.body.data.grade_letter).toBe('B-');
      expect(res.body.data.grade_point).toBe('2.70');
    });

    it('60 → C+ (2.30)', async () => {
      const res = await setScores(60, 60, 60);
      expect(res.body.data.final_score).toBe('60.00');
      expect(res.body.data.grade_letter).toBe('C+');
      expect(res.body.data.grade_point).toBe('2.30');
    });

    it('55 → C (2.00)', async () => {
      const res = await setScores(55, 55, 55);
      expect(res.body.data.final_score).toBe('55.00');
      expect(res.body.data.grade_letter).toBe('C');
      expect(res.body.data.grade_point).toBe('2.00');
    });

    it('40 → D (1.00)', async () => {
      const res = await setScores(40, 40, 40);
      expect(res.body.data.final_score).toBe('40.00');
      expect(res.body.data.grade_letter).toBe('D');
      expect(res.body.data.grade_point).toBe('1.00');
    });

    it('39 → E (0.00)', async () => {
      const res = await setScores(39, 39, 39);
      expect(res.body.data.final_score).toBe('39.00');
      expect(res.body.data.grade_letter).toBe('E');
      expect(res.body.data.grade_point).toBe('0.00');
    });
  });

  describe('GET /api/v1/grades/class/:classId', () => {
    it('Dosen pengampu melihat nilai kelasnya → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/grades/class/${classId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.class.id).toBe(classId);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('Admin Akademik melihat nilai kelas → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/grades/class/${classId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('Mahasiswa tidak boleh → 403', async () => {
      await request(app)
        .get(`/api/v1/grades/class/${classId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .expect(403);
    });

    it('Dosen bukan pengampu → 403', async () => {
      await request(app)
        .get(`/api/v1/grades/class/${classId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('dosen2')}`)
        .expect(403);
    });

    it('Class ID tidak valid → 400', async () => {
      await request(app)
        .get('/api/v1/grades/class/abc')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(400);
    });

    it('Kelas tidak ditemukan → 404', async () => {
      await request(app)
        .get('/api/v1/grades/class/99999999')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/grades/student/:studentId', () => {
    it('Mahasiswa melihat nilai sendiri → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/grades/student/${student1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('Admin Akademik melihat nilai mahasiswa → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/grades/student/${student1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('Mahasiswa lain tidak boleh → 403', async () => {
      await request(app)
        .get(`/api/v1/grades/student/${student1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa2')}`)
        .expect(403);
    });

    it('Dosen non-wali tidak boleh → 403', async () => {
      await request(app)
        .get(`/api/v1/grades/student/${student1Id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('dosen2')}`)
        .expect(403);
    });

    it('Student ID tidak valid → 400', async () => {
      await request(app)
        .get('/api/v1/grades/student/abc')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(400);
    });
  });
});
