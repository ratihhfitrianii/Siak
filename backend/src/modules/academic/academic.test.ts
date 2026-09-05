// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= `postgres://${process.env.PGUSER || 'siak'}:${process.env.PGPASSWORD || 'siak_dev_password'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'siak'}`;
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-secret-min-32-chars-long-for-hs256-alg';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-chars-long-for-hs256-alg';
process.env.BCRYPT_ROUNDS ??= '4';

import request from 'supertest';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

describe('Academic module (T1.7)', () => {
  const app = createApp();
  let tokenByRole: Map<string, string>;
  let userIdByRole: Map<string, number | null>;

  beforeAll(async () => {
    // T1.13 determinisme: user SEED terkecil per peran (ORDER BY id), eksklusi
    // imp-*/t110* (leftover import bisa dihapus import.test.ts saat berjalan).
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

    tokenByRole = new Map();
    userIdByRole = new Map();
    for (const [label, uid] of [
      ['admin_sistem', adminSistemId],
      ['admin_akademik', adminAkademikId],
      ['dosen', dosenId],
      ['mahasiswa', mahasiswaId],
    ] as Array<[string, number | undefined]>) {
      if (uid) {
        const password =
          label === 'admin_sistem' || label === 'admin_akademik'
            ? 'Admin123!'
            : label === 'dosen'
              ? 'Dosen123!'
              : label === 'mahasiswa'
                ? 'Mhs123!'
                : 'Test123!';
        const login = await request(app)
          .post('/api/v1/auth/login')
          .send({
            identifier: (await pgPool.query('SELECT email FROM users WHERE id = $1', [uid])).rows[0]
              .email,
            password,
          });
        tokenByRole.set(label, login.body.data.accessToken);
        userIdByRole.set(label, uid);
      } else {
        tokenByRole.set(label, '');
        userIdByRole.set(label, null);
      }
    }
  }, 30_000);

  afterAll(async () => {
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
  });

  // --- FAKULTAS ---
  describe('Fakultas', () => {
    it('GET /api/v1/faculties — admin_akademik boleh lihat', async () => {
      const res = await request(app)
        .get('/api/v1/faculties')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('POST /api/v1/faculties — admin_akademik boleh create', async () => {
      const code = `F${Date.now().toString().slice(-8)}`;
      const res = await request(app)
        .post('/api/v1/faculties')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ code, name: 'Fakultas Test' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(code);
    });

    it('POST /api/v1/faculties — mahasiswa 403', async () => {
      await request(app)
        .post('/api/v1/faculties')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .send({ code: 'X', name: 'X' })
        .expect(403);
    });
  });

  // --- PRODI ---
  describe('Prodi', () => {
    it('GET /api/v1/prodis — admin_akademik boleh lihat', async () => {
      const res = await request(app)
        .get('/api/v1/prodis')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('POST /api/v1/prodis — admin_akademik boleh create', async () => {
      const code = `P${Date.now().toString().slice(-8)}`;
      const res = await request(app)
        .post('/api/v1/prodis')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ facultyId: 1, code, name: 'Prodi Test', degree: 'S1' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(code);
    });
  });

  // --- DEPARTEMEN ---
  describe('Departemen', () => {
    it('GET /api/v1/departemens — admin_akademik boleh lihat', async () => {
      const res = await request(app)
        .get('/api/v1/departemens')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('POST /api/v1/departemens — admin_akademik boleh create', async () => {
      const code = `D${Date.now().toString().slice(-8)}`;
      const res = await request(app)
        .post('/api/v1/departemens')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ prodiId: 1, code, name: 'Departemen Test' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(code);
    });
  });

  // --- MATA KULIAH (COURSES) ---
  describe('Mata Kuliah', () => {
    it('GET /api/v1/courses — admin_akademik boleh lihat', async () => {
      const res = await request(app)
        .get('/api/v1/courses')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('POST /api/v1/courses — admin_akademik boleh create (course.manage permission)', async () => {
      const code = `C${Date.now().toString().slice(-8)}`;
      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ code, name: 'Mata Kuliah Test', credits: 3 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(code);
    });
  });

  // --- KURIKULUM ---
  describe('Kurikulum', () => {
    it('GET /api/v1/curricula — admin_akademik boleh lihat (filter prodi/semester)', async () => {
      const res = await request(app)
        .get('/api/v1/curricula?prodiId=1&semesterId=1')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  // --- KELAS (admin — kelola jadwal) ---
  describe('Kelas (admin — /admin/classes)', () => {
    it('GET /api/v1/admin/classes?facultyId= — admin_akademik lihat daftar kelas', async () => {
      const res = await request(app)
        .get('/api/v1/admin/classes?facultyId=1')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /api/v1/admin/classes — tanpa fakultas: HANYA kelas fakultas admin (auto-filter)', async () => {
      // Ambil fakultas admin akademik seed dari DB
      const adminId = userIdByRole.get('admin_akademik');
      const facRes = await pgPool.query(
        `SELECT u.admin_faculty_code, f.id AS faculty_id
         FROM users u
         JOIN faculties f ON f.code = u.admin_faculty_code
         WHERE u.id = $1`,
        [adminId],
      );
      if (facRes.rows.length === 0 || !facRes.rows[0].admin_faculty_code) {
        // admin akademik seed tanpa fakultas terikat → auto-filter off (semua tampil)
        // test tetap verifikasi 200 + items array
        const res = await request(app)
          .get('/api/v1/admin/classes')
          .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
          .expect(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.items)).toBe(true);
        return;
      }
      const facultyId = Number(facRes.rows[0].faculty_id);
      const res = await request(app)
        .get('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      const items = res.body.data.items as Array<Record<string, unknown>>;
      expect(Array.isArray(items)).toBe(true);
      for (const item of items) {
        expect(item.faculty_id).toBe(facultyId);
      }
      // Bandingkan dengan query eksplisit facultyId → jumlah sama
      const explicit = await request(app)
        .get(`/api/v1/admin/classes?facultyId=${facultyId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(explicit.body.data.items.length).toBe(items.length);
    });

    it('GET /api/v1/admin/classes — mahasiswa 403 (schedule.manage)', async () => {
      await request(app)
        .get('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .expect(403);
    });

    it('POST /api/v1/admin/classes — validasi: curriculumId wajib', async () => {
      await request(app)
        .post('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ classCode: 'A', capacity: 30 })
        .expect(400);
    });

    it('POST /api/v1/admin/classes — kurikulum tidak ada → 404', async () => {
      const res = await request(app)
        .post('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ curriculumId: 99999999, classCode: 'A', capacity: 30 })
        .expect(404);
      expect(res.body.error.message).toBe('Kurikulum tidak ditemukan');
    });

    it('POST /api/v1/admin/classes — admin_akademik buat kelas sukses', async () => {
      // Ambil kurikulum pertama dari DB
      const curRes = await pgPool.query('SELECT id FROM curricula ORDER BY id LIMIT 1');
      if (curRes.rows.length === 0) {
        // Tanpa kurikulum → skip (tidak mungkin di DB test)
        return;
      }
      const curriculumId = Number(curRes.rows[0].id);
      const classCode = `Z${Date.now().toString().slice(-6)}`;
      const res = await request(app)
        .post('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({
          curriculumId,
          classCode,
          capacity: 35,
          room: 'R.TEST',
          dayOfWeek: 3,
          startTime: '13:00',
          endTime: '14:40',
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.class_code).toBe(classCode);
      expect(res.body.data.room).toBe('R.TEST');
    });

    it('POST /api/v1/admin/classes — kelas aktif cek bentrok ruangan → 409', async () => {
      const curRes = await pgPool.query('SELECT id FROM curricula ORDER BY id LIMIT 1');
      if (curRes.rows.length === 0) return;
      const curriculumId = Number(curRes.rows[0].id);

      // Buat kelas pertama dengan ruangan + slot
      const firstCode = `Y${Date.now().toString().slice(-6)}`;
      await request(app)
        .post('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({
          curriculumId,
          classCode: firstCode,
          capacity: 30,
          room: 'R.CLASH',
          dayOfWeek: 4,
          startTime: '08:00',
          endTime: '09:40',
        })
        .expect(201);

      // Kelas kedua ruangan sama + hari sama + jam bentrok → 409
      const clashRes = await request(app)
        .post('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({
          curriculumId,
          classCode: `X${Date.now().toString().slice(-6)}`,
          capacity: 30,
          room: 'R.CLASH',
          dayOfWeek: 4,
          startTime: '08:30',
          endTime: '10:10',
        })
        .expect(409);
      expect(clashRes.body.error.message).toMatch(/Ruangan R.CLASH sudah dipakai/);
    });

    it('POST /api/v1/admin/classes — duplikat class_code per kurikulum → 409', async () => {
      const curRes = await pgPool.query('SELECT id FROM curricula ORDER BY id LIMIT 1');
      if (curRes.rows.length === 0) return;
      const curriculumId = Number(curRes.rows[0].id);
      const dupCode = `W${Date.now().toString().slice(-6)}`;

      await request(app)
        .post('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ curriculumId, classCode: dupCode, capacity: 25 })
        .expect(201);

      const dupRes = await request(app)
        .post('/api/v1/admin/classes')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ curriculumId, classCode: dupCode, capacity: 25 })
        .expect(409);
      expect(dupRes.body.error.message).toMatch(/Kode kelas sudah dipakai/);
    });
  });
});
