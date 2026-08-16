import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import bcrypt from 'bcrypt';
import request from 'supertest';

// Env test SEBELUM import app (port 5433 = DB test; lihat infra/docker-compose.yml)
process.env.NODE_ENV = 'test';
// ??= (bukan =) agar env CI (port 5432) dihormati — di lokal default 5433.
process.env.DATABASE_URL ??= 'postgres://siak:***@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-announcement';

import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

// Pass waitingRoom: null to bypass waiting room middleware for tests
const app = createApp({}, { waitingRoom: null });

const adminEmail = 'admin@siak.local';
const adminPassword = 'Admin123!';
const password = 'TestPass123!';

describe('Modul Announcements (Informasi Penting)', () => {
  const ts = Date.now().toString().slice(-6);
  const createdAnnouncementIds: number[] = [];

  let adminToken = '';
  let mahasiswaToken = '';

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
    adminToken = await login(adminEmail, adminPassword);

    // User mahasiswa test untuk uji RBAC (403)
    const mhsId = await insertUser(
      `ann-mhs-${ts}@siak.local`,
      'mahasiswa',
      'Mhs Announcement Test',
    );
    mahasiswaToken = await login(`ann-mhs-${ts}@siak.local`, password);
    await pgPool.query(
      `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
       VALUES ($1, 'an${ts}99', (SELECT id FROM prodis WHERE is_active LIMIT 1),
               (SELECT id FROM academic_years WHERE is_active LIMIT 1), 'Mandiri', true, 'aktif')`,
      [mhsId],
    );
  });

  afterAll(async () => {
    // Cleanup announcements test + audit lognya, lalu user test
    await pgPool.query(
      'DELETE FROM audit_logs WHERE table_name = $1 AND record_id = ANY($2::bigint[])',
      ['announcements', createdAnnouncementIds],
    );
    await pgPool.query(`DELETE FROM announcements WHERE title LIKE 'Test ${ts}%'`);
    await pgPool.query(`DELETE FROM students WHERE nim LIKE 'an${ts}%'`);
    await pgPool.query(`DELETE FROM users WHERE email LIKE 'ann-mhs-${ts}%'`);
  });

  describe('GET /announcements', () => {
    it('tanpa token → 401', async () => {
      await request(app).get('/api/v1/announcements').expect(401);
    });

    it('parameter tidak valid → 400', async () => {
      await request(app)
        .get('/api/v1/announcements?limit=999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('admin → 200 dengan items + pagination', async () => {
      const res = await request(app)
        .get('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination).toHaveProperty('total');
    });

    it('admin dengan activeOnly=true → hanya yang aktif', async () => {
      // Buat 1 announcement aktif + 1 nonaktif
      const active = await pgPool.query(
        `INSERT INTO announcements (title, message, target_roles, priority, is_active, created_by)
         VALUES ($1, $2, '{}', 5, true, (SELECT id FROM users WHERE email = $3))
         RETURNING id`,
        [`Test ${ts} aktif`, 'Pesan aktif', adminEmail],
      );
      const inactive = await pgPool.query(
        `INSERT INTO announcements (title, message, target_roles, priority, is_active, created_by)
         VALUES ($1, $2, '{}', 5, false, (SELECT id FROM users WHERE email = $3))
         RETURNING id`,
        [`Test ${ts} nonaktif`, 'Pesan nonaktif', adminEmail],
      );
      createdAnnouncementIds.push(Number(active.rows[0].id), Number(inactive.rows[0].id));

      const res = await request(app)
        .get('/api/v1/announcements?activeOnly=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const titles = res.body.data.items.map((i: { title: string }) => i.title);
      expect(titles).toContain(`Test ${ts} aktif`);
      expect(titles).not.toContain(`Test ${ts} nonaktif`);
    });

    it('mahasiswa → hanya announcement yang menarget mahasiswa', async () => {
      await request(app)
        .get('/api/v1/announcements')
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.data.items)).toBe(true);
        });
    });
  });

  describe('GET /announcements/active', () => {
    it('tanpa token → 401', async () => {
      await request(app).get('/api/v1/announcements/active').expect(401);
    });

    it('mahasiswa → 200 berisi announcement aktif yang menarget mahasiswa', async () => {
      const res = await request(app)
        .get('/api/v1/announcements/active')
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /announcements/:id', () => {
    it('ID tidak valid → 400', async () => {
      await request(app)
        .get('/api/v1/announcements/abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('tidak ditemukan → 404', async () => {
      await request(app)
        .get('/api/v1/announcements/999999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('admin → detail announcement', async () => {
      const created = await pgPool.query(
        `INSERT INTO announcements (title, message, target_roles, priority, is_active, created_by)
         VALUES ($1, $2, '{mahasiswa}', 3, true, (SELECT id FROM users WHERE email = $3))
         RETURNING id`,
        [`Test ${ts} detail`, 'Pesan detail', adminEmail],
      );
      const id = Number(created.rows[0].id);
      createdAnnouncementIds.push(id);

      const res = await request(app)
        .get(`/api/v1/announcements/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.title).toBe(`Test ${ts} detail`);
    });

    it('mahasiswa → detail announcement yang menarget mahasiswa (200)', async () => {
      const created = await pgPool.query(
        `INSERT INTO announcements (title, message, target_roles, priority, is_active, created_by)
         VALUES ($1, $2, '{mahasiswa}', 3, true, (SELECT id FROM users WHERE email = $3))
         RETURNING id`,
        [`Test ${ts} detail-mhs`, 'Pesan detail mahasiswa', adminEmail],
      );
      const id = Number(created.rows[0].id);
      createdAnnouncementIds.push(id);

      const res = await request(app)
        .get(`/api/v1/announcements/${id}`)
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(id);
    });

    it('mahasiswa → detail announcement target dosen (404)', async () => {
      const created = await pgPool.query(
        `INSERT INTO announcements (title, message, target_roles, priority, is_active, created_by)
         VALUES ($1, $2, '{dosen}', 3, true, (SELECT id FROM users WHERE email = $3))
         RETURNING id`,
        [`Test ${ts} detail-dosen`, 'Pesan detail dosen', adminEmail],
      );
      const id = Number(created.rows[0].id);
      createdAnnouncementIds.push(id);

      await request(app)
        .get(`/api/v1/announcements/${id}`)
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .expect(404);
    });
  });

  describe('POST /announcements', () => {
    it('tanpa token → 401', async () => {
      await request(app)
        .post('/api/v1/announcements')
        .send({ title: 'X', message: 'Y' })
        .expect(401);
    });

    it('role mahasiswa → 403', async () => {
      await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .send({ title: 'X', message: 'Y' })
        .expect(403);
    });

    it('data tidak valid → 400', async () => {
      await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '', message: 'Y' })
        .expect(400);
    });

    it('admin → 201 + data announcement + audit log', async () => {
      const res = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Test ${ts} buat`,
          message: 'Pesan dibuat',
          targetRoles: ['mahasiswa', 'dosen'],
          priority: 10,
          isActive: true,
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe(`Test ${ts} buat`);
      expect(res.body.data.targetRoles).toEqual(['mahasiswa', 'dosen']);

      const id = Number(res.body.data.id);
      createdAnnouncementIds.push(id);

      const audit = await pgPool.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2',
        ['announcements', id],
      );
      expect(audit.rows[0].n).toBeGreaterThan(0);
    });
  });

  describe('PUT /announcements/:id', () => {
    let putId = 0;

    beforeAll(async () => {
      const created = await pgPool.query(
        `INSERT INTO announcements (title, message, target_roles, priority, is_active, created_by)
         VALUES ($1, $2, '{}', 1, true, (SELECT id FROM users WHERE email = $3))
         RETURNING id`,
        [`Test ${ts} update`, 'Pesan awal', adminEmail],
      );
      putId = Number(created.rows[0].id);
      createdAnnouncementIds.push(putId);
    });

    it('ID tidak valid → 400', async () => {
      await request(app)
        .put('/api/v1/announcements/abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'X' })
        .expect(400);
    });

    it('tidak ditemukan → 404', async () => {
      await request(app)
        .put('/api/v1/announcements/999999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'X' })
        .expect(404);
    });

    it('tanpa field update → 400', async () => {
      await request(app)
        .put(`/api/v1/announcements/${putId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('data tidak valid → 400', async () => {
      await request(app)
        .put(`/api/v1/announcements/${putId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 999 })
        .expect(400);
    });

    it('admin → update title + isActive + audit log', async () => {
      const res = await request(app)
        .put(`/api/v1/announcements/${putId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: `Test ${ts} update v2`, isActive: false })
        .expect(200);
      expect(res.body.data.title).toBe(`Test ${ts} update v2`);
      expect(res.body.data.isActive).toBe(false);

      const audit = await pgPool.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2 AND action = $3',
        ['announcements', putId, 'UPDATE'],
      );
      expect(audit.rows[0].n).toBeGreaterThan(0);
    });

    it('admin → update semua field (targetRoles, priority, publishedAt, expiresAt)', async () => {
      const res = await request(app)
        .put(`/api/v1/announcements/${putId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          message: 'Pesan v3',
          targetRoles: ['dosen'],
          priority: 7,
          publishedAt: '2026-08-01T00:00:00.000Z',
          expiresAt: '2026-12-31T00:00:00.000Z',
        })
        .expect(200);
      expect(res.body.data.message).toBe('Pesan v3');
      expect(res.body.data.targetRoles).toEqual(['dosen']);
      expect(res.body.data.priority).toBe(7);
      expect(res.body.data.publishedAt).not.toBeNull();
      expect(res.body.data.expiresAt).not.toBeNull();
    });
  });

  describe('DELETE /announcements/:id', () => {
    let delId = 0;

    beforeAll(async () => {
      const created = await pgPool.query(
        `INSERT INTO announcements (title, message, target_roles, priority, is_active, created_by)
         VALUES ($1, $2, '{}', 1, true, (SELECT id FROM users WHERE email = $3))
         RETURNING id`,
        [`Test ${ts} delete`, 'Pesan delete', adminEmail],
      );
      delId = Number(created.rows[0].id);
      createdAnnouncementIds.push(delId);
    });

    it('tanpa token → 401', async () => {
      await request(app).delete(`/api/v1/announcements/${delId}`).expect(401);
    });

    it('role mahasiswa → 403', async () => {
      await request(app)
        .delete(`/api/v1/announcements/${delId}`)
        .set('Authorization', `Bearer ${mahasiswaToken}`)
        .expect(403);
    });

    it('ID tidak valid → 400', async () => {
      await request(app)
        .delete('/api/v1/announcements/abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('admin → soft delete (is_active=false) + audit log', async () => {
      const res = await request(app)
        .delete(`/api/v1/announcements/${delId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.message).toContain('dinonaktifkan');

      const row = await pgPool.query('SELECT is_active FROM announcements WHERE id = $1', [delId]);
      expect(row.rows[0].is_active).toBe(false);

      const audit = await pgPool.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2 AND action = $3',
        ['announcements', delId, 'DELETE'],
      );
      expect(audit.rows[0].n).toBeGreaterThan(0);
    });
  });
});
