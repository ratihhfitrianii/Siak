import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import bcrypt from 'bcrypt';
import request from 'supertest';

// Env test SEBELUM import app (port 5433 = DB test; lihat infra/docker-compose.yml)
process.env.NODE_ENV = 'test';
// ??= (bukan =) agar env CI (port 5432) dihormati — di lokal default 5433.
process.env.DATABASE_URL ??= `postgres://${process.env.PGUSER || 'siak'}:${process.env.PGPASSWORD || 'siak_dev_password'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'siak'}`;
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

  describe('CRUD /admin-master/faculties', () => {
    const facCode = `am${ts}F`;
    const facCode2 = `am${ts}G`;

    afterAll(async () => {
      await pgPool.query(`DELETE FROM prodis WHERE code LIKE 'am${ts}%'`);
      await pgPool.query(`DELETE FROM faculties WHERE code LIKE 'am${ts}%'`);
    });

    it('GET → 200 dengan data fakultas (pagination)', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/faculties')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toHaveProperty('total');
      expect(res.body.data.items[0]).toHaveProperty('code');
      expect(res.body.data.items[0]).toHaveProperty('name');
    });

    it('GET ?limit=1 → hanya 1 item + total tetap', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/faculties?limit=1&page=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.limit).toBe(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('GET ?page=999 → items kosong', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/faculties?page=999&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.pagination.page).toBe(999);
    });

    it('POST valid → 201', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/faculties')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: facCode, name: 'Fakultas Test AM', isActive: true })
        .expect(201);
      expect(res.body.data.code).toBe(facCode);
    });

    it('POST duplikat → 409', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/faculties')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: facCode, name: 'Duplikat' })
        .expect(409);
      expect(res.body.error.message).toContain('sudah terdaftar');
    });

    it('POST body invalid → 400', async () => {
      await request(app)
        .post('/api/v1/admin-master/faculties')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '', name: 'x' })
        .expect(400);
    });

    it('PUT id non-numeric (kode) → 400', async () => {
      const res = await request(app)
        .put(`/api/v1/admin-master/faculties/${facCode}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Fakultas Test AM Update', isActive: false })
        .expect(400);
      // id harus numeric — kode bukan id valid
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('PUT valid dengan id numeric → 200', async () => {
      const created = await pgPool.query('SELECT id FROM faculties WHERE code = $1', [facCode]);
      const facId = Number(created.rows[0].id);
      const res = await request(app)
        .put(`/api/v1/admin-master/faculties/${facId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Fakultas Test AM Update', isActive: false })
        .expect(200);
      expect(res.body.data.name).toBe('Fakultas Test AM Update');
      expect(res.body.data.is_active).toBe(false);
    });

    it('PUT duplikat code → 409', async () => {
      // Buat fakultas kedua
      await request(app)
        .post('/api/v1/admin-master/faculties')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: facCode2, name: 'Fakultas Test AM 2' })
        .expect(201);

      const created = await pgPool.query('SELECT id FROM faculties WHERE code = $1', [facCode2]);
      const facId2 = Number(created.rows[0].id);
      const res = await request(app)
        .put(`/api/v1/admin-master/faculties/${facId2}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: facCode })
        .expect(409);
      expect(res.body.error.message).toContain('sudah terdaftar');
    });

    it('PUT tidak ditemukan → 404', async () => {
      await request(app)
        .put('/api/v1/admin-master/faculties/32767')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Fakultas Tidak Ada' })
        .expect(404);
    });

    it('PUT tanpa field → 400', async () => {
      const created = await pgPool.query('SELECT id FROM faculties WHERE code = $1', [facCode]);
      const facId = Number(created.rows[0].id);
      await request(app)
        .put(`/api/v1/admin-master/faculties/${facId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('DELETE dengan prodi aktif → 409', async () => {
      // Pakai fakultas seed yang punya prodi aktif
      const res = await pgPool.query(
        `SELECT f.id FROM faculties f
         JOIN prodis p ON p.faculty_id = f.id AND p.is_active
         LIMIT 1`,
      );
      const facId = Number(res.rows[0].id);
      await request(app)
        .delete(`/api/v1/admin-master/faculties/${facId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });

    it('DELETE valid (tanpa prodi aktif) → soft delete', async () => {
      const created = await pgPool.query('SELECT id FROM faculties WHERE code = $1', [facCode2]);
      const facId = Number(created.rows[0].id);
      const res = await request(app)
        .delete(`/api/v1/admin-master/faculties/${facId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.message).toContain('dinonaktifkan');

      const row = await pgPool.query('SELECT is_active FROM faculties WHERE id = $1', [facId]);
      expect(row.rows[0].is_active).toBe(false);
    });

    it('DELETE id invalid → 400', async () => {
      await request(app)
        .delete('/api/v1/admin-master/faculties/abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('CRUD /admin-master/prodis', () => {
    const prodiCode = `am${ts}P`;
    const prodiCode2 = `am${ts}Q`;
    let prodiId = 0;
    let prodiId2 = 0;

    afterAll(async () => {
      await pgPool.query(`DELETE FROM prodis WHERE code LIKE 'am${ts}%'`);
      await pgPool.query(`DELETE FROM faculties WHERE code LIKE 'am${ts}%'`);
    });

    it('GET → 200 dengan data prodi (pagination)', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/prodis')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toHaveProperty('total');
      expect(res.body.data.items[0]).toHaveProperty('facultyCode');
    });

    it('GET ?limit=1 → hanya 1 prodi + total tetap', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/prodis?limit=1&page=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('POST valid → 201', async () => {
      // Cari fakultas aktif dari seed
      const facRes = await pgPool.query(
        'SELECT code FROM faculties WHERE is_active ORDER BY id LIMIT 1',
      );
      const facCode = facRes.rows[0].code as string;
      const res = await request(app)
        .post('/api/v1/admin-master/prodis')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: prodiCode,
          name: 'Prodi Test AM',
          facultyCode: facCode,
          degree: 'S1',
          accreditation: 'A',
        })
        .expect(201);
      expect(res.body.data.code).toBe(prodiCode);
      prodiId = Number(res.body.data.id);
    });

    it('POST fakultas tidak ditemukan → 400', async () => {
      await request(app)
        .post('/api/v1/admin-master/prodis')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: prodiCode2,
          name: 'Prodi Salah',
          facultyCode: 'ZZZ',
          degree: 'S1',
        })
        .expect(400);
    });

    it('POST duplikat → 409', async () => {
      const facRes = await pgPool.query(
        'SELECT code FROM faculties WHERE is_active ORDER BY id LIMIT 1',
      );
      const facCode = facRes.rows[0].code as string;
      const res = await request(app)
        .post('/api/v1/admin-master/prodis')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: prodiCode, name: 'Duplikat', facultyCode: facCode, degree: 'S1' })
        .expect(409);
      expect(res.body.error.message).toContain('sudah terdaftar');
    });

    it('POST body invalid → 400', async () => {
      await request(app)
        .post('/api/v1/admin-master/prodis')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '', name: '', facultyCode: '', degree: 'S9' })
        .expect(400);
    });

    it('PUT valid → 200 (update name, degree, accreditation, isActive)', async () => {
      const res = await request(app)
        .put(`/api/v1/admin-master/prodis/${prodiId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Prodi Test AM Update',
          degree: 'S2',
          accreditation: 'B',
          isActive: false,
        })
        .expect(200);
      expect(res.body.data.name).toBe('Prodi Test AM Update');
      expect(res.body.data.degree).toBe('S2');
      expect(res.body.data.is_active).toBe(false);
    });

    it('PUT fakultas tidak ditemukan → 400', async () => {
      await request(app)
        .put(`/api/v1/admin-master/prodis/${prodiId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ facultyCode: 'ZZZ' })
        .expect(400);
    });

    it('PUT duplikat code → 409', async () => {
      // Buat prodi kedua
      const facRes = await pgPool.query(
        'SELECT code FROM faculties WHERE is_active ORDER BY id LIMIT 1',
      );
      const facCode = facRes.rows[0].code as string;
      const created = await request(app)
        .post('/api/v1/admin-master/prodis')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: prodiCode2, name: 'Prodi Test AM 2', facultyCode: facCode, degree: 'S1' })
        .expect(201);
      prodiId2 = Number(created.body.data.id);

      const res = await request(app)
        .put(`/api/v1/admin-master/prodis/${prodiId2}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: prodiCode })
        .expect(409);
      expect(res.body.error.message).toContain('sudah terdaftar');
    });

    it('PUT tidak ditemukan → 404', async () => {
      await request(app)
        .put('/api/v1/admin-master/prodis/32767')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Prodi Tidak Ada' })
        .expect(404);
    });

    it('PUT tanpa field → 400', async () => {
      await request(app)
        .put(`/api/v1/admin-master/prodis/${prodiId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('DELETE dengan mahasiswa/dosen aktif → 409', async () => {
      // Pakai prodi seed yang punya mahasiswa aktif
      const res = await pgPool.query(
        `SELECT p.id FROM prodis p
         JOIN students s ON s.prodi_id = p.id AND s.is_active
         LIMIT 1`,
      );
      if (res.rows.length > 0) {
        const seedProdiId = Number(res.rows[0].id);
        await request(app)
          .delete(`/api/v1/admin-master/prodis/${seedProdiId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(409);
      }
    });

    it('DELETE valid (tanpa referensi) → soft delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin-master/prodis/${prodiId2}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.message).toContain('dinonaktifkan');

      const row = await pgPool.query('SELECT is_active FROM prodis WHERE id = $1', [prodiId2]);
      expect(row.rows[0].is_active).toBe(false);
    });

    it('DELETE id invalid → 400', async () => {
      await request(app)
        .delete('/api/v1/admin-master/prodis/abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('PUT /admin-master/students/:id', () => {
    const nim = `am${ts}77`;
    let studentId = 0;

    beforeAll(async () => {
      // Buat mahasiswa test via POST (biar alur lengkap)
      const res = await request(app)
        .post('/api/v1/admin-master/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ nim, fullName: 'Mahasiswa PUT Test', prodiCode, angkatan: angkatanCode })
        .expect(201);
      studentId = Number(res.body.data.id);
      createdEmails.push(`${nim}@student.siak.local`);
    });

    afterAll(async () => {
      await pgPool.query(`DELETE FROM students WHERE nim = $1`, [nim]);
      await pgPool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [
        `${nim}@student.siak.local`,
        `am-put-${ts}@siak.local`,
      ]);
    });

    it('valid (nama + email) → 200, users ikut terupdate', async () => {
      const res = await request(app)
        .put(`/api/v1/admin-master/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Mahasiswa PUT Updated', email: `am-put-${ts}@siak.local` })
        .expect(200);
      expect(res.body.data.message).toContain('diupdate');
      expect(res.body.data.fullName).toBe('Mahasiswa PUT Updated');

      const user = await pgPool.query(
        `SELECT u.full_name, u.email FROM users u
         JOIN students s ON s.user_id = u.id WHERE s.nim = $1`,
        [nim],
      );
      expect(user.rows[0].full_name).toBe('Mahasiswa PUT Updated');
      expect(user.rows[0].email).toBe(`am-put-${ts}@siak.local`);
    });

    it('ganti prodi valid → 200', async () => {
      // Cari prodi aktif kedua (beda dari prodiCode)
      const prodiRes = await pgPool.query(
        `SELECT code FROM prodis WHERE is_active AND code != $1 ORDER BY id LIMIT 1`,
        [prodiCode],
      );
      if (prodiRes.rows.length > 0) {
        const newProdi = prodiRes.rows[0].code as string;
        const res = await request(app)
          .put(`/api/v1/admin-master/students/${studentId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ prodiCode: newProdi })
          .expect(200);
        expect(res.body.data.message).toContain('diupdate');
      }
    });

    it('prodi tidak ditemukan → 400', async () => {
      await request(app)
        .put(`/api/v1/admin-master/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ prodiCode: 'ZZZ' })
        .expect(400);
    });

    it('angkatan tidak ditemukan → 400', async () => {
      await request(app)
        .put(`/api/v1/admin-master/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ angkatan: '2099/2100' })
        .expect(400);
    });

    it('id tidak ditemukan → 404', async () => {
      await request(app)
        .put('/api/v1/admin-master/students/32767')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Tidak Ada' })
        .expect(404);
    });

    it('tanpa field → 400', async () => {
      await request(app)
        .put(`/api/v1/admin-master/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('id invalid → 400', async () => {
      await request(app)
        .put('/api/v1/admin-master/students/abc')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'X' })
        .expect(400);
    });
  });

  describe('PUT /admin-master/lecturers/:id', () => {
    const nidn = `am${ts}88`;
    let lecturerId = 0;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/lecturers')
        .set('Authorization', `Bearer ${token}`)
        .send({ nidn, fullName: 'Dosen PUT Test', prodiCode })
        .expect(201);
      lecturerId = Number(res.body.data.id);
      createdEmails.push(`${nidn}@siak.local`);
    });

    afterAll(async () => {
      await pgPool.query(`DELETE FROM lecturers WHERE nidn = $1`, [nidn]);
      await pgPool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [
        `${nidn}@siak.local`,
        `am-put-dsn-${ts}@siak.local`,
      ]);
    });

    it('valid (nama + email + prodi) → 200, users ikut terupdate', async () => {
      const res = await request(app)
        .put(`/api/v1/admin-master/lecturers/${lecturerId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Dosen PUT Updated',
          email: `am-put-dsn-${ts}@siak.local`,
          prodiCode,
        })
        .expect(200);
      expect(res.body.data.message).toContain('diupdate');
      expect(res.body.data.fullName).toBe('Dosen PUT Updated');

      const user = await pgPool.query(
        `SELECT u.full_name, u.email FROM users u
         JOIN lecturers l ON l.user_id = u.id WHERE l.nidn = $1`,
        [nidn],
      );
      expect(user.rows[0].full_name).toBe('Dosen PUT Updated');
      expect(user.rows[0].email).toBe(`am-put-dsn-${ts}@siak.local`);
    });

    it('id tidak ditemukan → 404', async () => {
      await request(app)
        .put('/api/v1/admin-master/lecturers/32767')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Tidak Ada' })
        .expect(404);
    });

    it('tanpa field → 400', async () => {
      await request(app)
        .put(`/api/v1/admin-master/lecturers/${lecturerId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });
  });

  describe('CRUD /admin-master/rooms', () => {
    const roomCode = `am${ts}R1`;
    let roomId = 0;

    afterAll(async () => {
      await pgPool.query(`DELETE FROM rooms WHERE code LIKE 'am${ts}%'`);
    });

    it('GET → 200 dengan data ruangan (kosong)', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/rooms')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination).toHaveProperty('total');
    });

    it('POST valid → 201', async () => {
      const res = await request(app)
        .post('/api/v1/admin-master/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: roomCode,
          name: 'Ruang Test AM',
          capacity: 40,
          facultyCode: 'FT',
          isActive: true,
        })
        .expect(201);
      expect(res.body.data.code).toBe(roomCode);
      roomId = Number(res.body.data.id);
    });

    it('POST body invalid → 400', async () => {
      await request(app)
        .post('/api/v1/admin-master/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '', name: 'x' })
        .expect(400);
    });

    it('GET ?facultyId → menyaring by fakultas', async () => {
      const res = await request(app)
        .get('/api/v1/admin-master/rooms?facultyId=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('PUT valid → 200', async () => {
      const res = await request(app)
        .put(`/api/v1/admin-master/rooms/${roomId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ruang Test AM Updated', capacity: 45 })
        .expect(200);
      expect(res.body.data.name).toBe('Ruang Test AM Updated');
    });

    it('PUT id tidak ditemukan → 404', async () => {
      await request(app)
        .put('/api/v1/admin-master/rooms/32767')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tidak Ada' })
        .expect(404);
    });

    it('DELETE → 200 nonaktif', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin-master/rooms/${roomId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.message).toContain('dinonaktifkan');
    });

    it('DELETE id tidak ditemukan → 404', async () => {
      await request(app)
        .delete('/api/v1/admin-master/rooms/32767')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('RBAC: mahasiswa dilarang akses rooms', async () => {
      await request(app)
        .get('/api/v1/admin-master/rooms')
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .expect(403);
    });
  });

  describe('CRUD /admin-master/courses', () => {
    const courseCode = `am${ts}C1`;
    let courseId = 0;

    afterAll(async () => {
      await pgPool.query(`DELETE FROM courses WHERE code LIKE 'am${ts}%'`);
    });

    it('PUT valid → 200', async () => {
      const created = await pgPool.query(
        `INSERT INTO courses (code, name, credits, description) VALUES ($1, $2, $3, $4) RETURNING id`,
        [courseCode, 'Kursus Test AM', 3, 'desc'],
      );
      courseId = Number(created.rows[0].id);
      const res = await request(app)
        .put(`/api/v1/admin-master/courses/${courseId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Kursus Test AM Updated', credits: 4 })
        .expect(200);
      expect(res.body.data.name).toBe('Kursus Test AM Updated');
    });

    it('PUT id tidak ditemukan → 404', async () => {
      await request(app)
        .put('/api/v1/admin-master/courses/32767')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tidak Ada' })
        .expect(404);
    });

    it('DELETE → 200 nonaktif', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin-master/courses/${courseId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.message).toContain('dinonaktifkan');
    });

    it('DELETE id tidak ditemukan → 404', async () => {
      await request(app)
        .delete('/api/v1/admin-master/courses/32767')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
