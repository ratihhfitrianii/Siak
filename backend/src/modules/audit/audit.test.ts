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
import bcrypt from 'bcrypt';
import { buildChangedByLabel, sanitizeIp, writeAuditLog } from '../../lib/audit-service';

describe('Audit module (T1.9) — F-13, S-06, S-07, AC-05', () => {
  const app = createApp();
  let tokenByRole: Map<string, string>;
  let userIdByRole: Map<string, number>;
  let startTime: Date;
  let student1Id: number;
  let classId: number;
  let krsItemId: number;
  let gradeId: number;
  let facultyId: number;
  let newUserId: number;
  let paginationUserId: number;
  const cleanup: { submissionId?: number; periodId?: number; classIds: number[] } = {
    classIds: [],
  };

  async function login(label: string, uid: number): Promise<void> {
    const password = label === 'dosen' ? 'Dosen123!' : 'Mhs123!';
    const adminPassword = 'Admin123!';
    const useAdmin = label.startsWith('admin');
    const email = (await pgPool.query('SELECT email FROM users WHERE id = $1', [uid])).rows[0]
      .email;
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: useAdmin ? adminPassword : password });
    expect(res.status).toBe(200);
    tokenByRole.set(label, res.body.data.accessToken);
  }

  // Timeout diperpanjang (30s): 5× query seed + 5 login + setup data + pagination user
  // bisa > 5s saat DB sibuk (kegagalan hook timeout 5s default — pelajaran T1.13).
  beforeAll(async () => {
    startTime = new Date();
    // T1.13 determinisme: user SEED terkecil per peran (ORDER BY id), eksklusi
    // imp-*/t110* (leftover import bisa dihapus import.test.ts saat berjalan).
    const seedUserId = async (code: string): Promise<number> => {
      const res = await pgPool.query(
        `SELECT u.id FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.code = $1 AND u.is_active
           AND u.email NOT LIKE 'imp-%' AND u.email NOT LIKE 't110%'
         ORDER BY u.id LIMIT 1`,
        [code],
      );
      return Number(res.rows[0].id);
    };
    const ids = {
      admin_sistem: await seedUserId('admin_sistem'),
      admin_akademik: await seedUserId('admin_akademik'),
      admin_keuangan: await seedUserId('admin_keuangan'),
      dosen: await seedUserId('dosen'),
      mahasiswa: await seedUserId('mahasiswa'),
    };
    userIdByRole = new Map(Object.entries(ids));
    tokenByRole = new Map();
    for (const [label, uid] of Object.entries(ids)) {
      await login(label, uid);
    }

    // User khusus untuk pagination test (T1.13 fix): terisolasi dari suite lain —
    // baris audit user ini tidak pernah bertambah dari luar, jadi offset page 1/2
    // deterministik (sebelumnya baris LOGIN suite paralel menggeser offset → overlap).
    const pagHash = await bcrypt.hash('Pag123!', 4);
    const pagUser = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Pagination Tester', (SELECT id FROM roles WHERE code = 'admin_sistem'), true)
       RETURNING id`,
      [`audit-pag-${Date.now().toString().slice(-8)}@siak.local`, pagHash],
    );
    paginationUserId = Number(pagUser.rows[0].id);

    // Setup data test: periode KRS + submission + kelas + krs_item (pola T1.8)
    const sem = await pgPool.query('SELECT id FROM semesters ORDER BY id LIMIT 1');
    const semesterId = Number(sem.rows[0].id);
    const cur = await pgPool.query('SELECT id FROM curricula ORDER BY id LIMIT 1');
    const curriculumId = Number(cur.rows[0].id);
    const student1 = await pgPool.query(
      'SELECT s.id FROM students s JOIN users u ON u.id = s.user_id WHERE u.id = $1',
      [ids.mahasiswa],
    );
    student1Id = Number(student1.rows[0].id);

    const ts = Date.now().toString().slice(-8);
    const period = await pgPool.query(
      `INSERT INTO krs_periods (semester_id, name, start_date, end_date)
       VALUES ($1, $2, now() - interval '1 day', now() + interval '30 days')
       RETURNING id`,
      [semesterId, `T1.9-TEST-${ts}`],
    );
    cleanup.periodId = Number(period.rows[0].id);

    const submission = await pgPool.query(
      `INSERT INTO krs_submissions (student_id, krs_period_id, status)
       VALUES ($1, $2, 'draft')
       RETURNING id`,
      [student1Id, cleanup.periodId],
    );
    cleanup.submissionId = Number(submission.rows[0].id);

    const cls = await pgPool.query(
      `INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity)
       VALUES ($1, $2, $3, 30)
       RETURNING id`,
      [curriculumId, `T19-${ts}`, ids.dosen],
    );
    classId = Number(cls.rows[0].id);
    cleanup.classIds.push(classId);

    const item = await pgPool.query(
      'INSERT INTO krs_items (krs_submission_id, class_id) VALUES ($1, $2) RETURNING id',
      [cleanup.submissionId, classId],
    );
    krsItemId = Number(item.rows[0].id);
  }, 30_000);

  afterAll(async () => {
    if (cleanup.submissionId) {
      // Cascade menghapus krs_items dan grades
      await pgPool.query('DELETE FROM krs_submissions WHERE id = $1', [cleanup.submissionId]);
    }
    if (cleanup.classIds.length > 0) {
      await pgPool.query('DELETE FROM classes WHERE id = ANY($1::bigint[])', [cleanup.classIds]);
    }
    if (cleanup.periodId) {
      await pgPool.query('DELETE FROM krs_periods WHERE id = $1', [cleanup.periodId]);
    }
    if (facultyId) {
      await pgPool.query('DELETE FROM faculties WHERE id = $1', [facultyId]);
    }
    if (paginationUserId) {
      // Baris audit user ini tetap ada (changed_by → NULL via SET NULL) — aman.
      await pgPool.query('DELETE FROM users WHERE id = $1', [paginationUserId]);
    }
    if (newUserId) {
      await pgPool.query('DELETE FROM users WHERE id = $1', [newUserId]);
    }
    // Bersihkan audit rows yang dibuat test ini (presisi per recordId/actor)
    const actorIds = [...userIdByRole.values()];
    await pgPool.query(
      `DELETE FROM audit_logs
       WHERE created_at > $1
         AND ((table_name = 'grades' AND record_id = $2)
              OR (table_name = 'faculties' AND record_id = $3)
              OR (table_name = 'users' AND record_id = $4)
              OR (action = 'LOGIN' AND changed_by = ANY($5::bigint[])))`,
      [startTime, gradeId ?? 0, facultyId ?? 0, newUserId ?? 0, actorIds],
    );
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
  });

  describe('Service unit — audit-service', () => {
    it('buildChangedByLabel: format "diinput oleh {nama} ({role})"', () => {
      expect(buildChangedByLabel({ fullName: 'Budi Santoso', roleCode: 'dosen' })).toBe(
        'diinput oleh Budi Santoso (dosen)',
      );
    });

    it('buildChangedByLabel: label panjang dipotong ke 100 karakter (VARCHAR(100))', () => {
      const label = buildChangedByLabel({ fullName: 'X'.repeat(200), roleCode: 'dosen' });
      expect(label.length).toBe(100);
      expect(label.startsWith('diinput oleh')).toBe(true);
    });

    it('sanitizeIp: IPv4 dan IPv6 valid diterima', () => {
      expect(sanitizeIp('127.0.0.1')).toBe('127.0.0.1');
      expect(sanitizeIp('::1')).toBe('::1');
    });

    it('sanitizeIp: string non-IP → null (jangan gagalkan audit)', () => {
      expect(sanitizeIp('not-an-ip')).toBeNull();
      expect(sanitizeIp('')).toBeNull();
      expect(sanitizeIp(null)).toBeNull();
      expect(sanitizeIp(undefined)).toBeNull();
    });

    it('writeAuditLog: insert via pool + baca ulang', async () => {
      const before = await pgPool.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2',
        ['audit_service_test', 424242],
      );
      expect(before.rows[0].n).toBe(0);

      await writeAuditLog({
        tableName: 'audit_service_test',
        recordId: 424242,
        action: 'INSERT',
        newValues: { hello: 'world' },
        changedBy: userIdByRole.get('admin_sistem')!,
        changedByLabel: buildChangedByLabel({ fullName: 'Tester', roleCode: 'admin_sistem' }),
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      const after = await pgPool.query(
        `SELECT table_name, record_id, action, new_values, changed_by_label
         FROM audit_logs WHERE table_name = $1 AND record_id = $2`,
        ['audit_service_test', 424242],
      );
      expect(after.rows.length).toBe(1);
      expect(after.rows[0].action).toBe('INSERT');
      expect(after.rows[0].changed_by_label).toContain('diinput oleh Tester');

      await pgPool.query('DELETE FROM audit_logs WHERE table_name = $1 AND record_id = $2', [
        'audit_service_test',
        424242,
      ]);
    });

    it('writeAuditLog: mendukung transaksi (client) — insert + rollback', async () => {
      const client = await pgPool.connect();
      await client.query('BEGIN');
      await writeAuditLog(
        {
          tableName: 'audit_service_test',
          recordId: 424243,
          action: 'UPDATE',
          oldValues: { a: 1 },
          newValues: { a: 2 },
          changedBy: userIdByRole.get('admin_sistem')!,
          changedByLabel: 'diinput oleh Tester (admin_sistem)',
        },
        client,
      );
      const inTx = await client.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2',
        ['audit_service_test', 424243],
      );
      expect(inTx.rows[0].n).toBe(1);
      await client.query('ROLLBACK');
      client.release();

      const after = await pgPool.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2',
        ['audit_service_test', 424243],
      );
      expect(after.rows[0].n).toBe(0);
    });
  });

  describe('GET /api/v1/audit-logs — RBAC (matriks §6.1)', () => {
    it('Tanpa token → 401', async () => {
      await request(app).get('/api/v1/audit-logs').expect(401);
    });

    it('Mahasiswa → 403', async () => {
      await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .expect(403);
    });

    it('Dosen → 403', async () => {
      await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .expect(403);
    });

    it('Admin Akademik → 200', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('Admin Keuangan → 200', async () => {
      await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_keuangan')}`)
        .expect(200);
    });

    it('Admin Sistem → 200', async () => {
      await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
    });
  });

  describe('GET /api/v1/audit-logs — list, filter, pagination', () => {
    const get = (query: string) =>
      request(app)
        .get(`/api/v1/audit-logs${query}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`);

    it('List default: items + pagination, berisi data', async () => {
      const res = await get('').expect(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
      const first = res.body.data.items[0];
      expect(first).toHaveProperty('tableName');
      expect(first).toHaveProperty('action');
      expect(first).toHaveProperty('changedByLabel');
      expect(typeof first.id).toBe('number'); // BIGSERIAL dinormalisasi
    });

    it('Filter tableName', async () => {
      const res = await get('?tableName=faculties').expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(0);
      for (const item of res.body.data.items) {
        expect(item.tableName).toBe('faculties');
      }
    });

    it('Filter action=LOGIN', async () => {
      const res = await get('?action=LOGIN').expect(200);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(5); // 5 login di beforeAll
      for (const item of res.body.data.items) {
        expect(item.action).toBe('LOGIN');
      }
    });

    it('Filter changedBy', async () => {
      const adminSistemId = userIdByRole.get('admin_sistem')!;
      const res = await get(`?changedBy=${adminSistemId}`).expect(200);
      for (const item of res.body.data.items) {
        expect(item.changedBy).toBe(adminSistemId);
      }
    });

    it('Filter rentang tanggal from/to (ISO) → 200', async () => {
      const from = new Date(Date.now() - 60_000).toISOString();
      const to = new Date(Date.now() + 60_000).toISOString();
      const res = await get(
        `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ).expect(200);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('Pagination page=2 limit=5 → offset benar (dataset terisolasi)', async () => {
      // Burst 12 baris audit untuk user khusus — tidak ada suite lain yang
      // menulis baris untuk user ini → total & offset stabil selama assertion.
      for (let i = 0; i < 12; i++) {
        await writeAuditLog({
          tableName: 'users',
          recordId: paginationUserId,
          action: 'LOGIN',
          changedBy: paginationUserId,
          changedByLabel: 'diinput oleh Pagination Tester (admin_sistem)',
        });
      }
      const page1 = await get(`?limit=5&page=1&changedBy=${paginationUserId}`).expect(200);
      const page2 = await get(`?limit=5&page=2&changedBy=${paginationUserId}`).expect(200);
      expect(page1.body.data.items.length).toBe(5);
      expect(page2.body.data.items.length).toBe(5);
      expect(page1.body.data.pagination.total).toBe(12);
      const ids1 = new Set(page1.body.data.items.map((i: { id: number }) => i.id));
      const overlap = page2.body.data.items.some((i: { id: number }) => ids1.has(i.id));
      expect(overlap).toBe(false);
    });

    it('Sort whitelist: sort=table_name&order=asc → 200', async () => {
      const res = await get('?sort=table_name&order=asc').expect(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
    });

    it('action tidak valid → 400', async () => {
      await get('?action=HACK').expect(400);
    });

    it('page=0 → 400', async () => {
      await get('?page=0').expect(400);
    });
  });

  describe('Integrasi: mutasi → audit trail (F-13, S-06, S-07)', () => {
    it('Login mencatat LOGIN dengan label atribusi', async () => {
      const adminSistemId = userIdByRole.get('admin_sistem')!;
      const res = await request(app)
        .get(`/api/v1/audit-logs?action=LOGIN&changedBy=${adminSistemId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
      const latest = res.body.data.items[0];
      expect(latest.tableName).toBe('users');
      expect(latest.changedByLabel).toContain('diinput oleh');
      expect(latest.changedByLabel).toContain('admin_sistem');
    });

    it('Input nilai (POST /grades) → INSERT grades tercatat', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ krsItemId, tugasScore: 80, utsScore: 75, uasScore: 85 });
      expect(res.status).toBe(201);
      gradeId = Number(res.body.data.id);

      const audit = await request(app)
        .get('/api/v1/audit-logs?tableName=grades&action=INSERT')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      const entry = audit.body.data.items.find((i: { recordId: number }) => i.recordId === gradeId);
      expect(entry).toBeDefined();
      expect(entry.changedByLabel).toContain('diinput oleh');
      expect(entry.newValues).toMatchObject({ finalScore: 81, gradeLetter: 'A-' });
    });

    it('Edit nilai (PUT /grades/:id) → UPDATE grades dengan old/new JSONB', async () => {
      const res = await request(app)
        .put(`/api/v1/grades/${gradeId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ tugasScore: 90, utsScore: 88, uasScore: 92 });
      expect(res.status).toBe(200);

      const audit = await request(app)
        .get('/api/v1/audit-logs?tableName=grades&action=UPDATE')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      const entry = audit.body.data.items.find((i: { recordId: number }) => i.recordId === gradeId);
      expect(entry).toBeDefined();
      // oldValues dari DB: NUMERIC → string
      expect(entry.oldValues).toMatchObject({ finalScore: '81.00' });
      expect(Number(entry.newValues.finalScore)).toBeCloseTo(90.4, 2);
      expect(entry.newValues).toMatchObject({ gradeLetter: 'A' });
      expect(entry.changedByLabel).toContain('admin_akademik');
    });

    it('Buat fakultas (POST /academic/faculties) → INSERT faculties tercatat', async () => {
      const ts = Date.now().toString().slice(-5); // code max 10 char
      const code = `T19F-${ts}`;
      const res = await request(app)
        .post('/api/v1/faculties')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({ code, name: `Fakultas Test Audit ${ts}` });
      expect(res.status).toBe(201);
      facultyId = Number(res.body.data.id);

      const audit = await request(app)
        .get('/api/v1/audit-logs?tableName=faculties&action=INSERT')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      const entry = audit.body.data.items.find(
        (i: { recordId: number }) => i.recordId === facultyId,
      );
      expect(entry).toBeDefined();
      expect(entry.changedByLabel).toContain('admin_akademik');
      expect(entry.newValues).toMatchObject({ code });
    });

    it('Buat user (POST /users) → INSERT users tercatat (tanpa password)', async () => {
      const ts = Date.now().toString().slice(-6);
      const email = `audit.test.${ts}@siak.local`;
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({
          email,
          password: 'Rahasia123!',
          fullName: 'User Audit Test',
          roleCode: 'mahasiswa',
        });
      expect(res.status).toBe(201);
      newUserId = Number(res.body.data.id);

      const audit = await request(app)
        .get('/api/v1/audit-logs?tableName=users&action=INSERT')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      const entry = audit.body.data.items.find(
        (i: { recordId: number }) => i.recordId === newUserId,
      );
      expect(entry).toBeDefined();
      expect(entry.newValues).toMatchObject({ email, roleCode: 'mahasiswa' });
      expect(JSON.stringify(entry.newValues)).not.toContain('password');
    });
  });
});
