// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= `postgres://${process.env.PGUSER || 'siak'}:${process.env.PGPASSWORD || 'siak_dev_password'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'siak'}`;
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
    admin_akademik: true,
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
  'attendance.recap': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: false,
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
  'academic.manage': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'kurikulum.manage': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'course.manage': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'schedule.manage': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'schedule.approve': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'student.profile': {
    mahasiswa: true,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'thesis.submit': {
    mahasiswa: true,
    dosen: false,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'thesis.review': {
    mahasiswa: false,
    dosen: true,
    admin_akademik: false,
    admin_keuangan: false,
    admin_sistem: true,
  },
  'thesis.manage': {
    mahasiswa: false,
    dosen: false,
    admin_akademik: true,
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
        .send({ identifier: u.email, password: u.password })
        .expect(200);
      tokenByRole.set(u.roleCode, loginRes.body.data.accessToken);
    }
  }, 20_000);

  afterAll(async () => {
    for (const u of users) {
      try {
        await pgPool.query('DELETE FROM users WHERE email = $1', [u.email]);
      } catch {
        // ignore cleanup race
      }
    }
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
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
      expect(res.body.data).toHaveProperty('studentId'); // T1.11b: transkrip mandiri butuh studentId
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
        .send({ identifier: 'bukan-email', password: 'x', fullName: '' })
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

  describe('POST /users (flow NIM/NIK — buat user cukup peran + NIM/NIK)', () => {
    const TEST_NIM = '9990001';
    const TEST_NIK = '8870001';
    let prodiId: number;
    let ayId: number;
    let mhsUserId: number;
    let dosenUserId: number;

    beforeAll(async () => {
      const prodi = await pgPool.query(
        `SELECT id FROM prodis WHERE code = 'TI' AND is_active LIMIT 1`,
      );
      const ay = await pgPool.query(
        `SELECT id FROM academic_years WHERE code = '2023/2024' LIMIT 1`,
      );
      prodiId = Number(
        prodi.rows[0]?.id ?? (await pgPool.query('SELECT id FROM prodis LIMIT 1')).rows[0].id,
      );
      ayId = Number(
        ay.rows[0]?.id ?? (await pgPool.query('SELECT id FROM academic_years LIMIT 1')).rows[0].id,
      );
      const mhs = await pgPool.query(`SELECT id FROM users WHERE email = $1`, [
        'rbac-test-mhs@siak.local',
      ]);
      const dosen = await pgPool.query(`SELECT id FROM users WHERE email = $1`, [
        'rbac-test-dosen@siak.local',
      ]);
      mhsUserId = Number(mhs.rows[0].id);
      dosenUserId = Number(dosen.rows[0].id);
      await pgPool.query(
        `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
         VALUES ($1, $2, $3, $4, 'Test', true, 'aktif')
         ON CONFLICT (nim) DO UPDATE SET user_id = $1, is_active = true`,
        [mhsUserId, TEST_NIM, prodiId, ayId],
      );
      await pgPool.query(
        `INSERT INTO lecturers (user_id, nidn, nik, prodi_id, employment_type, is_active)
         VALUES ($1, $2, $3, $4, 'tetap', true)
         ON CONFLICT (nik) DO UPDATE SET user_id = $1, is_active = true`,
        [dosenUserId, '8880001', TEST_NIK, prodiId],
      );
    }, 20_000);

    afterAll(async () => {
      try {
        await pgPool.query('DELETE FROM students WHERE nim = $1', [TEST_NIM]);
        await pgPool.query('DELETE FROM lecturers WHERE nik = $1', [TEST_NIK]);
      } catch {
        // ignore cleanup race
      }
    });

    it('mahasiswa: NIM terdaftar → akun diaktifkan, password = NIM, must_change = true', async () => {
      // nonaktifkan dulu untuk membuktikan alur mengaktifkan kembali
      await pgPool.query('UPDATE users SET is_active = false WHERE id = $1', [mhsUserId]);
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'mahasiswa', nim: TEST_NIM })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nim).toBe(TEST_NIM);
      expect(res.body.data.message).toContain('password awal = NIM');

      // bukti nyata: login pakai NIM + password NIM berhasil & wajib ganti password
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: TEST_NIM, password: TEST_NIM })
        .expect(200);
      expect(login.body.data.user.mustChangePassword).toBe(true);
      await pgPool.query('UPDATE users SET is_active = true WHERE id = $1', [mhsUserId]);
    });

    it('dosen: NIK terdaftar → password = NIK, must_change = true', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'dosen', nik: TEST_NIK })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nik).toBe(TEST_NIK);
      expect(res.body.data.message).toContain('password awal = NIK');

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: TEST_NIK, password: TEST_NIK })
        .expect(200);
      expect(login.body.data.user.mustChangePassword).toBe(true);
    });

    it('NIM tidak terdaftar di master data → 404 dengan pesan jelas', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'mahasiswa', nim: '9999999' })
        .expect(404);
      expect(res.body.error.message).toContain('tidak ditemukan di data mahasiswa');
    });

    it('nim + roleCode dosen → 400 (NIM hanya utk mahasiswa)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({ roleCode: 'dosen', nim: TEST_NIM })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('nim + field manual bersamaan → 400', async () => {
      await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .send({
          roleCode: 'mahasiswa',
          nim: TEST_NIM,
          email: 'x@siak.local',
          password: 'TestPass123!',
          fullName: 'X',
        })
        .expect(400);
    });
  });

  describe('GET /users/lookup (preview auto-fill)', () => {
    const LOOKUP_NIM = '9990002';
    const LOOKUP_EMAIL = 'rbac-test-lookup-mhs-2@siak.local';
    let lookupUserId: number;

    beforeAll(async () => {
      const ins = await pgPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
         VALUES ($1, 'x', 'Lookup Mahasiswa 2',
                 (SELECT id FROM roles WHERE code='mahasiswa'), true)
         RETURNING id`,
        [LOOKUP_EMAIL],
      );
      lookupUserId = ins.rows[0].id;
      await pgPool.query(
        `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type)
         VALUES ($1, $2,
                 (SELECT id FROM prodis WHERE code = 'TI'),
                 (SELECT id FROM academic_years ORDER BY id LIMIT 1),
                 'Mandiri')`,
        [lookupUserId, LOOKUP_NIM],
      );
    }, 20_000);

    afterAll(async () => {
      try {
        await pgPool.query('DELETE FROM students WHERE nim = $1', [LOOKUP_NIM]);
        await pgPool.query('DELETE FROM users WHERE id = $1', [lookupUserId]);
      } catch {
        // ignore cleanup race
      }
    });

    it('NIM terdaftar → found dengan detail lengkap', async () => {
      const res = await request(app)
        .get(`/api/v1/users/lookup?role=mahasiswa&identifier=${LOOKUP_NIM}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.fullName).toBe('Lookup Mahasiswa 2');
      expect(res.body.data.email).toBe(LOOKUP_EMAIL);
      expect(res.body.data.prodiName).toBeTruthy();
      expect(typeof res.body.data.mustChangePassword).toBe('boolean');
    });

    it('NIK tidak terdaftar → found=false', async () => {
      const res = await request(app)
        .get('/api/v1/users/lookup?role=dosen&identifier=9999999')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      expect(res.body.data.found).toBe(false);
    });

    it('non-admin_sistem → 403', async () => {
      await request(app)
        .get(`/api/v1/users/lookup?role=mahasiswa&identifier=${LOOKUP_NIM}`)
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
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
      try {
        await pgPool.query('DELETE FROM users WHERE email = $1', ['rbac-test-target@siak.local']);
      } catch {
        // ignore cleanup race
      }
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

  describe('DELETE /users/:id (nonaktifkan user — keluhan lama)', () => {
    let targetId: number;

    beforeAll(async () => {
      const r = await pgPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
         VALUES ('rbac-test-delete@siak.local', 'x', 'Delete Target', (SELECT id FROM roles WHERE code='mahasiswa'), true)
         RETURNING id`,
      );
      targetId = r.rows[0].id;
    });

    afterAll(async () => {
      try {
        await pgPool.query('DELETE FROM users WHERE email = $1', ['rbac-test-delete@siak.local']);
      } catch {
        // ignore cleanup race
      }
    });

    it('admin_sistem boleh nonaktifkan user → 200 + is_active=false', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${targetId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('dinonaktifkan');

      const db = await pgPool.query('SELECT is_active FROM users WHERE id = $1', [targetId]);
      expect(db.rows[0].is_active).toBe(false);
    });

    it('user yang sudah nonaktif → 409', async () => {
      await request(app)
        .delete(`/api/v1/users/${targetId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(409);
    });

    it('tidak bisa hapus akun sendiri → 400 (anti lockout)', async () => {
      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(200);
      await request(app)
        .delete(`/api/v1/users/${meRes.body.data.id}`)
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(400);
    });

    it('user tidak ditemukan → 404', async () => {
      const res = await request(app)
        .delete('/api/v1/users/99999999')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('id invalid → 400', async () => {
      await request(app)
        .delete('/api/v1/users/abc')
        .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
        .expect(400);
    });

    it('dosen TIDAK boleh nonaktifkan user → 403', async () => {
      await request(app)
        .delete(`/api/v1/users/${targetId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
        .expect(403);
    });

    it('mahasiswa TIDAK boleh nonaktifkan user → 403', async () => {
      await request(app)
        .delete(`/api/v1/users/${targetId}`)
        .set('Authorization', `Bearer ${tokenByRole.get('mahasiswa')}`)
        .expect(403);
    });
  });

  it('createRbacRouter export valid', () => {
    expect(typeof createRbacRouter).toBe('function');
    const router = createRbacRouter();
    expect(router).toBeDefined();
  });
});

describe('Admin Akademik ↔ Fakultas binding + kuota max 3', () => {
  const FACULTY_CODE = 'AMFT';
  const createdMails: string[] = [];

  let adminToken: string;

  beforeAll(async () => {
    // Buat fakultas test aktif
    await pgPool.query(
      `INSERT INTO faculties (code, name, is_active)
       VALUES ($1, 'Fakultas Test AM', true)
       ON CONFLICT (code) DO UPDATE SET is_active = true`,
      [FACULTY_CODE],
    );
    // Token admin_sistem dari suite induk — buat ulang di sini utk isolasi
    const hash = await bcrypt.hash('TestPass123!', 12);
    await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ('rbac-fac-admin@siak.local', $1, 'Admin AM', (SELECT id FROM roles WHERE code='admin_sistem'), true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $1, is_active = true`,
      [hash],
    );
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'rbac-fac-admin@siak.local', password: 'TestPass123!' })
      .expect(200);
    adminToken = login.body.data.accessToken;
  }, 20_000);

  afterAll(async () => {
    for (const mail of createdMails) {
      try {
        await pgPool.query('DELETE FROM users WHERE email = $1', [mail]);
      } catch {
        // ignore
      }
    }
    await pgPool.query('DELETE FROM users WHERE email = $1', ['rbac-fac-admin@siak.local']);
    await pgPool.query('DELETE FROM faculties WHERE code = $1', [FACULTY_CODE]);
  });

  const createAkademik = async (mail: string) => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: mail,
        password: 'TestPass123!',
        fullName: 'Admin Akademik AM',
        roleCode: 'admin_akademik',
        adminFacultyCode: FACULTY_CODE,
      });
    return res;
  };

  it('admin_akademik tanpa fakultas → 400', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'rbac-fac-nofac@siak.local',
        password: 'TestPass123!',
        fullName: 'No Fac',
        roleCode: 'admin_akademik',
      })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('admin_akademik dengan fakultas valid → 201, fakultas tersimpan', async () => {
    const mail = 'rbac-fac-one@siak.local';
    const res = await createAkademik(mail);
    expect(res.status).toBe(201);
    createdMails.push(mail);

    const row = await pgPool.query('SELECT admin_faculty_code FROM users WHERE email = $1', [mail]);
    expect(row.rows[0].admin_faculty_code).toBe(FACULTY_CODE);
  });

  it('max 3 admin akademik per fakultas → ke-4 ditolak 400', async () => {
    for (let i = 2; i <= 3; i++) {
      const mail = `rbac-fac-${i}@siak.local`;
      const res = await createAkademik(mail);
      expect(res.status).toBe(201);
      createdMails.push(mail);
    }
    // Ke-4 → melebihi kuota 3 → 400
    const res = await createAkademik('rbac-fac-keempat@siak.local');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
