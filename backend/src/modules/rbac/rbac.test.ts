// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';

// Import app AFTER env is set
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';
import bcrypt from 'bcrypt';
import request from 'supertest';
import {
  can,
  permissionsFor,
  PERMISSIONS,
  ROLE_CODES,
  type Permission,
  type RoleCode,
} from '../../lib/policy';
import { createRbacRouter } from './index';

const app = createApp();

/**
 * Matriks RBAC §6.1 — literal dari docs/02-solution-spec.md.
 * true = ✅, false = ❌. (Dosen Wali: sel yang beda ditandai di kolom khusus.)
 * Sumber kebenaran test = SPEC, bukan implementasi (anti self-confirmation).
 */
const EXPECTED_MATRIX: Record<Permission, Record<RoleCode, boolean>> = {
  'auth.profile': {
    mahasiswa: true,
    dosen: true,
    admin_akademik: true,
    admin_keuangan: true,
    admin_sistem: true,
  },
  'user.edit_contact': {
    mahasiswa: true,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'transcript.view_own': {
    mahasiswa: true,
    dosen: true,
    admin_akademik: true,
    admin_keuangan: true,
    admin_sistem: true,
  },
  'transcript.view_mentee': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'transcript.download': {
    mahasiswa: true,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'krs.fill': {
    mahasiswa: true,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'krs.view_classes': {
    mahasiswa: true,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'krs.approve': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'class.view_students': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'grade.input': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'grade.edit': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'lecturer.select_course': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'lecturer.availability': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'attendance.input': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'guidance.manage': {
    mahasiswa: true,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'substitute.manage': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'payroll.view': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: false,
    admin_keuangan: true,
    admin_sistem: true,
  },
  'payroll.input': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: true,
    admin_sistem: true,
  },
  'payment.generate': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: true,
    admin_sistem: true,
  },
  'payment.update': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: true,
    admin_sistem: true,
  },
  'user.manage': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'audit.view': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: true,
    admin_sistem: true,
  },
  'import.data': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
};

// Dosen Wali: penambahan akses dari atribut is_wali (binaan).
const WALI_EXTRA: Permission[] = ['transcript.view_mentee', 'guidance.manage'];

describe('RBAC Policy Matrix (docs/02 §6.1) — 1 test per sel', () => {
  it('semua permission terdefinisi di matriks spec', () => {
    for (const p of PERMISSIONS) {
      expect(EXPECTED_MATRIX[p]).toBeDefined();
    }
    // Tidak ada permission yatim di matriks spec
    for (const p of Object.keys(EXPECTED_MATRIX) as Permission[]) {
      expect(PERMISSIONS).toContain(p);
    }
  });

  for (const role of ROLE_CODES) {
    for (const perm of PERMISSIONS) {
      const expected = EXPECTED_MATRIX[perm][role];
      it(`sel [${role}] ${perm} → ${expected ? 'ALLOW' : 'DENY'}`, () => {
        expect(can(role, perm)).toBe(expected);
      });
    }
  }

  it('Dosen Wali mendapat akses ekstra binaan (is_wali attribute)', () => {
    for (const perm of WALI_EXTRA) {
      expect(can('dosen', perm)).toBe(false); // dosen non-wali DENY
    }
  });

  it('permissionsFor mengembalikan hanya yang diizinkan', () => {
    for (const role of ROLE_CODES) {
      const perms = permissionsFor(role);
      for (const p of perms) {
        expect(EXPECTED_MATRIX[p][role]).toBe(true);
      }
    }
  });

  it('admin_sistem = superuser: semua permission', () => {
    for (const p of PERMISSIONS) {
      expect(can('admin_sistem', p)).toBe(true);
    }
  });
});

describe('User Service (RBAC endpoints)', () => {
  const users: { email: string; password: string; roleCode: string }[] = [
    { email: 'rbac-test-mhs@siak.local', password: 'TestPass123!', roleCode: 'mahasiswa' },
    { email: 'rbac-test-dosen@siak.local', password: 'TestPass123!', roleCode: 'dosen' },
    {
      email: 'rbac-test-admin-akademik@siak.local',
      password: 'TestPass123!',
      roleCode: 'admin_akademik',
    },
    {
      email: 'rbac-test-admin-keuangan@siak.local',
      password: 'TestPass123!',
      roleCode: 'admin_keuangan',
    },
    {
      email: 'rbac-test-admin-sistem@siak.local',
      password: 'TestPass123!',
      roleCode: 'admin_sistem',
    },
  ];
  const tokenByRole = new Map<string, string>();

  // Timeout hook diperbesar (20s): full suite paralel (krs) membebani DB test.
  beforeAll(async () => {
    const roleResult = await pgPool.query('SELECT id, code FROM roles');
    const roleIdByCode = new Map(
      roleResult.rows.map((r: { id: number; code: string }) => [r.code, r.id]),
    );

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 12);
      await pgPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = true
         RETURNING id`,
        [u.email, hash, `Test ${u.roleCode}`, roleIdByCode.get(u.roleCode)],
      );
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: u.password })
        .expect(200);
      tokenByRole.set(u.roleCode, loginRes.body.data.accessToken);
    }
  }, 20_000);

  afterAll(async () => {
    for (const u of users) {
      await pgPool.query('DELETE FROM users WHERE email = $1', [u.email]);
    }
    await pgPool.end();
  });

  describe('GET /users/me', () => {
    it('mahasiswa mendapat menu RBAC', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .expect(200);
      expect(res.body.data.role).toBe('mahasiswa');
      expect(res.body.data.menu).toContain('krs.fill');
      expect(res.body.data.menu).not.toContain('user.manage');
    });

    it('admin_sistem mendapat semua menu', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      expect(res.body.data.menu).toContain('user.manage');
      expect(res.body.data.menu).toContain('import.data');
    });

    it('tanpa token → 401', async () => {
      await request(app).get('/api/v1/users/me').expect(401);
    });
  });

  describe('PUT /users/me/contact', () => {
    it('mahasiswa boleh edit kontak (sel ✅)', async () => {
      const res = await request(app)
        .put('/api/v1/users/me/contact')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .send({ fullName: 'Nama Baru Mhs' })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.full_name).toBe('Nama Baru Mhs');
    });

    it('body invalid → 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .put('/api/v1/users/me/contact')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .send({ email: 'bukan-email' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('email duplikat → 409', async () => {
      const res = await request(app)
        .put('/api/v1/users/me/contact')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .send({ email: users[1]!.email })
        .expect(409);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('dosen TIDAK boleh edit kontak (sel ❌) → 403', async () => {
      await request(app)
        .put('/api/v1/users/me/contact')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ fullName: 'Hack' })
        .expect(403);
    });

    it('admin_keuangan TIDAK boleh edit kontak (sel ❌) → 403', async () => {
      await request(app)
        .put('/api/v1/users/me/contact')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_keuangan')}`)
        .send({ fullName: 'Hack' })
        .expect(403);
    });
  });

  describe('GET /users (list)', () => {
    it('admin_sistem boleh list user', async () => {
      const res = await request(app)
        .get('/api/v1/users?limit=5')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('filter role + search bekerja', async () => {
      const res = await request(app)
        .get('/api/v1/users?role=mahasiswa&search=Test&limit=10')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      for (const item of res.body.data.items) {
        expect(item.role_code).toBe('mahasiswa');
      }
    });

    it('query invalid (page bukan angka) → 400', async () => {
      const res = await request(app)
        .get('/api/v1/users?page=abc')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('mahasiswa TIDAK boleh list user → 403', async () => {
      await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .expect(403);
    });

    it('dosen TIDAK boleh list user → 403', async () => {
      await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .expect(403);
    });
  });

  describe('POST /users (create)', () => {
    it('admin_sistem boleh create user', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({
          email: 'rbac-test-new@siak.local',
          password: 'TestPass123!',
          fullName: 'User Baru',
          roleCode: 'mahasiswa',
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      await pgPool.query('DELETE FROM users WHERE email = $1', ['rbac-test-new@siak.local']);
    });

    it('duplicate email → 409', async () => {
      await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({
          email: users[0]!.email,
          password: 'TestPass123!',
          fullName: 'Dup',
          roleCode: 'mahasiswa',
        })
        .expect(409);
    });

    it('roleCode tidak dikenal → 400', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({
          email: 'rbac-bad-role@siak.local',
          password: 'TestPass123!',
          fullName: 'Bad Role',
          roleCode: 'role_ghost',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('body invalid → 400', async () => {
      await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ email: 'bukan-email', password: 'x', fullName: '' })
        .expect(400);
    });

    it('admin_akademik TIDAK boleh create user → 403', async () => {
      await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_akademik')}`)
        .send({
          email: 'x@siak.local',
          password: 'TestPass123!',
          fullName: 'X',
          roleCode: 'mahasiswa',
        })
        .expect(403);
    });
  });

  describe('PUT /users/:id/role (update role)', () => {
    let targetId: number;

    beforeAll(async () => {
      const r = await pgPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
         VALUES ('rbac-test-target@siak.local', 'x', 'Target', (SELECT id FROM roles WHERE code='mahasiswa'), true)
         RETURNING id`,
      );
      targetId = r.rows[0].id;
    });

    afterAll(async () => {
      await pgPool.query('DELETE FROM users WHERE email = $1', ['rbac-test-target@siak.local']);
    });

    it('admin_sistem boleh update role + is_wali', async () => {
      const res = await request(app)
        .put(`/api/v1/users/${targetId}/role`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'dosen', isWali: true })
        .expect(200);
      expect(res.body.data.is_wali).toBe(true);
      expect(res.body.data.role).toBe('dosen');
    });

    it('is_wali direset false untuk role non-dosen', async () => {
      const res = await request(app)
        .put(`/api/v1/users/${targetId}/role`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'mahasiswa', isWali: true })
        .expect(200);
      expect(res.body.data.is_wali).toBe(false);
    });

    it('admin_sistem TIDAK boleh ubah role diri sendiri (anti lockout) → 400', async () => {
      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      await request(app)
        .put(`/api/v1/users/${meRes.body.data.id}/role`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'mahasiswa' })
        .expect(400);
    });

    it('id invalid → 400', async () => {
      const res = await request(app)
        .put('/api/v1/users/abc/role')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'mahasiswa' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('user tidak ditemukan → 404', async () => {
      const res = await request(app)
        .put('/api/v1/users/99999999/role')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'mahasiswa' })
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('roleCode tidak dikenal → 400', async () => {
      await request(app)
        .put(`/api/v1/users/${targetId}/role`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'role_ghost' })
        .expect(400);
    });

    it('dosen TIDAK boleh update role → 403', async () => {
      await request(app)
        .put(`/api/v1/users/${targetId}/role`)
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .send({ roleCode: 'admin_sistem' })
        .expect(403);
    });
  });

  it('createRbacRouter export valid', () => {
    expect(typeof createRbacRouter).toBe('function');
    const router = createRbacRouter();
    expect(router).toBeDefined();
  });
});
