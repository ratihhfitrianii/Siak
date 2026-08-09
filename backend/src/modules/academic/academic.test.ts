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
});
