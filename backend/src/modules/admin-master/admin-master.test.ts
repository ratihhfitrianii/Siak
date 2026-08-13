import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import bcrypt from 'bcrypt';
import request from 'supertest';

// Env test SEBELUM import app (port 5433 = DB test; lihat infra/docker-compose.yml)
process.env.NODE_ENV = 'test';
// ??= (bukan =) agar env CI (port 5432) dihormati — di lokal default 5433.
process.env.DATABASE_URL ??= 'postgres://siak:***@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-admin-master';

import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

// Pass waitingRoom: null to bypass waiting room middleware for tests
const app = createApp({}, { waitingRoom: null });

const adminEmail = 'admin@siak.local';
const adminPassword = 'Admin123!';
const password = 'TestPass123!';

describe('Modul Admin Master Data (#16)', () => {
  const ts = Date.now().toString().slice(-6);
  const createdEmails: string[] = [];

  let token = '';
  let mahasiswaToken = '';
  let prodiCode = '';
  let angkatanCode = '';

  const insertUser = async (email: string, role: string, fullName: string) => {
    const hash = await bcrypt.hash(password, 10);
    const res = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE code = $4), true)
       RETURNING id`,
      [email, hash, fullName, role],
    );
    return Number(res.rows[0].id);
  };

  const login = async (email: string, pw: string) => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: email, password: pw })
      .expect(200);
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    token = await login(adminEmail, adminPassword);

    // User mahasiswa test untuk uji RBAC (403)
    const mhsId = await insertUser(`am-mhs-${ts}@siak.local`, 'mahasiswa', 'Mhs AM Test');
    createdEmails.push(`am-mhs-${ts}@siak.local`);
    mahasiswaToken = await login(`am-mhs-${ts}@siak.local`, password);
    await pgPool.query(
      `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
       VALUES ($1, 'am${ts}99', (SELECT id FROM prodis WHERE is_active LIMIT 1),
               (SELECT id FROM academic_years WHERE is_active LIMIT 1), 'Mandiri', true, 'aktif')`,
      [mhsId],
    );

    // Prodi & angkatan aktif dari seed (dipakai POST manual)
    const prodiRes = await pgPool.query(
      `SELECT code FROM prodis WHERE is_active ORDER BY id LIMIT 1`,
    );
    prodiCode = prodiRes.rows[0].code as string;
    const ayRes = await pgPool.query(
      `SELECT code FROM academic_years WHERE is_active ORDER BY id LIMIT 1`,
    );
    angkatanCode = ayRes.rows[0].code as string;
  });

  afterAll(async () => {
    // Urutan sesuai FK: students/lecturers → users.
    // Pola am{ts}% menangkap: nim test (am{ts}01/02/…, am{ts}99), nidn test (am{ts}10),
    // email default mahasiswa (am{ts}01@student.siak.local), email eksplisit (am-test-{ts}-*),
    // dan email user mhs test (am-mhs-{ts}@…).
    await pgPool.query(`DELETE FROM students WHERE nim LIKE 'am${ts}%'`);
    await pgPool.query(`DELETE FROM lecturers WHERE nidn LIKE 'am${ts}%'`);
    await pgPool.query(
      `DELETE FROM users WHERE email LIKE 'am${ts}%' OR email LIKE 'am-test-${ts}%' OR email LIKE 'am-mhs-${ts}%'`,
    );
    await pgPool.query(`DELETE FROM users WHERE email = ANY($1)`, [createdEmails]);
  });

  describe('GET /admin-master/students', () => {
    it('tanpa token → 401', async () => {
      await request(app).get('/api/v1/admin-master/students').expect(401);
    });

    it('role mahasiswa (tanpa user.manage) → 403', async () => {
      await request(app)
        .get('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .expect(403);
    });

    it('admin → 200 dengan items + pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.pagination.total).toBeGreaterThan(0);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.items[0]).toHaveProperty('nim');
      expect(res.body.data.items[0]).toHaveProperty('fullName');
    });

    it('search (nim sebagian) → item test ditemukan', async () => {
      const res = await request(app)
        .get(`/api/v1/admin-master/students?search=${ts}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      // Student test dibuat di beforeAll dengan nim am{ts}99 — harus muncul di hasil.
      const nims = res.body.data.items.map((i: { nim: string }) => String(i.nim));
      expect(nims.some((n: string) => n.includes(ts))).toBe(true);
    });

    it('filter prodi → hanya item prodi tsb', async () => {
      const res = await request(app)
        .get(`/api/v1/admin-master/students?prodi=${prodiCode}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      for (const item of res.body.data.items) {
        expect(item.prodiCode).toBe(prodiCode);
      }
    });

    it('page invalid → 400', async () => {
      await request(app)
        .get('/api/v1/admin-master/students?page=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('GET /admin-master/lecturers', () => {
    it('admin → 200 dengan items + pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/lecturers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items[0]).toHaveProperty('nidn');
      expect(res.body.data.items[0]).toHaveProperty('fullName');
    });

    it('search nama dosen', async () => {
      const res = await request(app)
        .get(`/api/v1/admin-master/lecturers?search=admin`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  describe('POST /admin-master/students', () => {
    const nim = `am${ts}01`;
    const email = `am-test-${ts}-mhs@siak.local`;

    it('valid → 201, user dibuat (role mahasiswa, must_change_password=true)', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ nim, fullName: 'Mahasiswa AM Test', prodiCode, angkatan: angkatanCode })
        .expect(201);
      expect(res.body.data.message).toBe('Mahasiswa berhasil dibuat');
      expect(res.body.data.nim).toBe(nim);

      const user = await pgPool.query(
        `SELECT u.email, u.must_change_password, r.code AS role, s.nim
         FROM users u
         JOIN roles r ON r.id = u.role_id
         JOIN students s ON s.user_id = u.id
         WHERE s.nim = $1`,
        [nim],
      );
      expect(user.rows).toHaveLength(1);
      expect(user.rows[0].role).toBe('mahasiswa');
      expect(user.rows[0].must_change_password).toBe(true);
      // email default = nim@student.siak.local
      expect(user.rows[0].email).toBe(`${nim}@student.siak.local`);
      createdEmails.push(`${nim}@student.siak.local`);
    });

    it('NIM duplikat → 409', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ nim, fullName: 'Duplikat NIM', prodiCode, angkatan: angkatanCode })
        .expect(409);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('sudah terdaftar');
    });

    it('email duplikat → 409', async () => {
      // Buat user dengan email yg sama dulu (langsung di DB), lalu create manual → 409
      const otherNim = `am${ts}02`;
      await pgPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
         VALUES ($1, 'x', 'Email Duplikat', (SELECT id FROM roles WHERE code='mahasiswa'), true)`,
        [email],
      );
      createdEmails.push(email);
      const res = await request(app)
        .post('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nim: otherNim,
          fullName: 'Email Duplikat',
          prodiCode,
          angkatan: angkatanCode,
          email,
        })
        .expect(409);
      expect(res.body.error.message).toContain('sudah digunakan');
    });

    it('prodi tidak ditemukan → 400', async () => {
      await request(app)
        .post('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nim: `am${ts}03`,
          fullName: 'Prodi Salah',
          prodiCode: 'ZZZ',
          angkatan: angkatanCode,
        })
        .expect(400);
    });

    it('angkatan tidak ditemukan → 400', async () => {
      await request(app)
        .post('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ nim: `am${ts}04`, fullName: 'Angkatan Salah', prodiCode, angkatan: '2099' })
        .expect(400);
    });

    it('body invalid (nim terlalu pendek) → 400 dengan detail fields', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ nim: 'a', fullName: '', prodiCode: '', angkatan: '' })
        .expect(400);
      expect(res.body.error.details.fields).toBeDefined();
    });
  });

  describe('POST /admin-master/lecturers', () => {
    const nidn = `am${ts}10`;
    const email = `am-test-${ts}-dsn@siak.local`;

    it('valid → 201, user dibuat (role dosen, must_change_password=true)', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/lecturers')
        .set('Authorization', `Bearer ${token}`)
        .send({ nidn, fullName: 'Dosen AM Test', prodiCode, email })
        .expect(201);
      expect(res.body.data.message).toBe('Dosen berhasil dibuat');
      expect(res.body.data.nidn).toBe(nidn);

      const user = await pgPool.query(
        `SELECT u.email, u.must_change_password, r.code AS role, l.nidn
         FROM users u
         JOIN roles r ON r.id = u.role_id
         JOIN lecturers l ON l.user_id = u.id
         WHERE l.nidn = $1`,
        [nidn],
      );
      expect(user.rows).toHaveLength(1);
      expect(user.rows[0].role).toBe('dosen');
      expect(user.rows[0].must_change_password).toBe(true);
      expect(user.rows[0].email).toBe(email);
      createdEmails.push(email);
    });

    it('NIDN duplikat → 409', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/lecturers')
        .set('Authorization', `Bearer ${token}`)
        .send({ nidn, fullName: 'Duplikat NIDN', prodiCode })
        .expect(409);
      expect(res.body.error.message).toContain('sudah terdaftar');
    });

    it('body invalid → 400', async () => {
      await request(app)
        .post('/api/v1/admin-master/lecturers')
        .set('Authorization', `Bearer ${token}`)
        .send({ nidn: '', fullName: '', prodiCode: '' })
        .expect(400);
    });
  });
});
