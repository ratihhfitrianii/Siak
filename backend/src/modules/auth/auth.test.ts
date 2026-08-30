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

const app = createApp();

describe('Auth Module', () => {
  const testEmail = 'test-auth@siak.local';
  const testEmailDosen = 'test-auth-dosen@siak.local';
  const testPassword = 'TestPass123!';
  let testUserId: number;
  let testDosenUserId: number;

  beforeAll(async () => {
    // Create test user (mahasiswa)
    const passwordHash = await bcrypt.hash(testPassword, 12);
    const mhsRoleResult = await pgPool.query("SELECT id FROM roles WHERE code = 'mahasiswa'");
    const mhsRoleId = mhsRoleResult.rows[0].id;

    const result = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = true
       RETURNING id`,
      [testEmail, passwordHash, 'Test Auth User', mhsRoleId],
    );
    testUserId = result.rows[0].id;

    // Create test user (dosen)
    const dosenRoleResult = await pgPool.query("SELECT id FROM roles WHERE code = 'dosen'");
    const dosenRoleId = dosenRoleResult.rows[0].id;

    const dosenResult = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = true
       RETURNING id`,
      [testEmailDosen, passwordHash, 'Test Auth Dosen', dosenRoleId],
    );
    testDosenUserId = dosenResult.rows[0].id;

    // Profile student (NIM) — untuk test login via NIM
    const prodiRes = await pgPool.query(`SELECT id FROM prodis WHERE code = 'TI' LIMIT 1`);
    const prodiId = prodiRes.rows[0].id;
    const ayRes = await pgPool.query(`SELECT id FROM academic_years LIMIT 1`);
    const ayId = ayRes.rows[0].id;
    await pgPool.query(
      `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
       VALUES ($1, 'AUTH0001', $2, $3, 'Mandiri', true, 'aktif')
       ON CONFLICT (user_id) DO NOTHING`,
      [testUserId, prodiId, ayId],
    );
    // Profile lecturer (NIK) — untuk test login via NIK
    await pgPool.query(
      `INSERT INTO lecturers (user_id, nidn, nik, prodi_id, employment_type, is_active)
       VALUES ($1, 'AUTH0002', 'AUTH0002', $2, 'tetap', true)
       ON CONFLICT (user_id) DO NOTHING`,
      [testDosenUserId, prodiId],
    );
  });

  afterAll(async () => {
    // Cleanup
    await pgPool.query(
      `DELETE FROM audit_logs WHERE record_id = $1 AND action IN ('LOGIN', 'LOGOUT', 'PASSWORD_CHANGED')`,
      [testUserId],
    );
    await pgPool.query(
      `DELETE FROM audit_logs WHERE record_id = $1 AND action IN ('LOGIN', 'LOGOUT', 'PASSWORD_CHANGED')`,
      [testDosenUserId],
    );
    await pgPool.query('DELETE FROM students WHERE user_id = $1', [testUserId]);
    await pgPool.query('DELETE FROM lecturers WHERE user_id = $1', [testDosenUserId]);
    await pgPool.query('DELETE FROM users WHERE email IN ($1, $2)', [testEmail, testEmailDosen]);
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
  });

  async function loginAndGetTokens() {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: testEmail, password: testPassword })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken,
      refreshToken: res.body.data.refreshToken,
    };
  }

  describe('POST /api/v1/auth/login', () => {
    it('should return 400 for missing identifier', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ password: testPassword })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: testEmail })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return specific field message for identifier < 3 chars (UX: bukan pesan generik)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ab', password: testPassword })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('NIM/NIK atau email minimal 3 karakter');
      expect(res.body.error.details.fields.identifier).toBeDefined();
    });

    it('should return 401 for invalid identifier', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'nonexistent@siak.local', password: testPassword })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for invalid password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: testEmail, password: 'WrongPassword123!' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 200 with tokens for valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: testEmail, password: testPassword })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.expiresIn).toBe(900); // 15 minutes
    });

    it('should return 200 when logging in with NIM (mahasiswa)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'AUTH0001', password: testPassword })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testEmail);
    });

    it('should return 200 when logging in with NIK (dosen)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'AUTH0002', password: testPassword })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testEmailDosen);
    });

    it('deterministic: identifier bentrok (NIM mahasiswa = NIDN dosen) selalu resolve ke mahasiswa', async () => {
      // Regresi CI E2E: dulu UNION tanpa order → rows[0] tak menentu saat NIM bentrok
      // dengan NIDN, login bisa masuk ke akun dosen (dashboard salah, test logout gagal).
      // Prioritas resolver: email > NIM > NIK > NIDN → NIM (mahasiswa) harus menang.
      await pgPool.query(`UPDATE lecturers SET nidn = 'AUTH0001' WHERE user_id = $1`, [
        testDosenUserId,
      ]);
      try {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ identifier: 'AUTH0001', password: testPassword })
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.user.email).toBe(testEmail); // mahasiswa, bukan dosen
      } finally {
        await pgPool.query(`UPDATE lecturers SET nidn = 'AUTH0002' WHERE user_id = $1`, [
          testDosenUserId,
        ]);
      }
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return 400 for missing refresh token', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({}).expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return new tokens for valid refresh token', async () => {
      const { refreshToken } = await loginAndGetTokens();

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should reject reused refresh token (rotation)', async () => {
      const { refreshToken: r1 } = await loginAndGetTokens();

      // First refresh: use R1, get R2 (R1 should be revoked)
      const res1 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1 })
        .expect(200);

      expect(res1.body.success).toBe(true);
      const r2 = res1.body.data.refreshToken;
      expect(r2).not.toBe(r1);

      // Try to use the OLD refresh token again - should fail (rotation)
      const res2 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1 })
        .expect(401);

      expect(res2.body.success).toBe(false);
      expect(res2.body.error.code).toBe('UNAUTHORIZED');

      // The new token R2 should still work
      const res3 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r2 })
        .expect(200);

      expect(res3.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 without authorization header', async () => {
      const res = await request(app).get('/api/v1/auth/me').expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return user info with valid token', async () => {
      const { accessToken } = await loginAndGetTokens();

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testUserId);
      expect(res.body.data.email).toBe(testEmail);
      expect(res.body.data.role).toBe('mahasiswa');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should return 200 without refresh token', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({}).expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should revoke refresh token when provided', async () => {
      const { refreshToken } = await loginAndGetTokens();

      const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken }).expect(200);

      expect(res.body.success).toBe(true);

      // Try to use revoked token
      const res2 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(res2.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/change-password (T1.11a, F-18)', () => {
    // User khusus change-password — password-nya boleh berubah tanpa memengaruhi suite lain.
    const cpEmail = 'test-auth-cp@siak.local';
    const cpPassword = 'CpPass123!';
    let cpUserId: number;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(cpPassword, 12);
      const roleResult = await pgPool.query("SELECT id FROM roles WHERE code = 'mahasiswa'");
      const roleId = roleResult.rows[0].id;
      const result = await pgPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, true, false)
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = true
         RETURNING id`,
        [cpEmail, passwordHash, 'Test Change Password User', roleId],
      );
      cpUserId = Number(result.rows[0].id);
    });

    afterAll(async () => {
      await pgPool.query(
        `DELETE FROM audit_logs WHERE record_id = $1 AND action IN ('LOGIN', 'LOGOUT', 'PASSWORD_CHANGED')`,
        [cpUserId],
      );
      await pgPool.query('DELETE FROM users WHERE email = $1', [cpEmail]);
    });

    async function cpLogin() {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: cpEmail, password: cpPassword })
        .expect(200);
      return {
        accessToken: res.body.data.accessToken,
        refreshToken: res.body.data.refreshToken,
      };
    }

    it('mengubah password dengan password lama benar; must_change_password di-clear; refresh token lama dicabut', async () => {
      // Set must_change_password = true dulu (simulasi akun impor)
      await pgPool.query('UPDATE users SET must_change_password = true WHERE id = $1', [cpUserId]);
      const { accessToken, refreshToken } = await cpLogin();

      const newPassword = 'CpNewPass456!';
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: cpPassword, newPassword })
        .expect(200);

      expect(res.body.data.message).toBe('Password berhasil diubah');

      // must_change_password cleared
      const user = await pgPool.query('SELECT must_change_password FROM users WHERE id = $1', [
        cpUserId,
      ]);
      expect(user.rows[0].must_change_password).toBe(false);

      // Password lama tidak valid lagi, password baru valid
      await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: cpEmail, password: cpPassword })
        .expect(401);
      await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: cpEmail, password: newPassword })
        .expect(200);

      // Refresh token lama dicabut (ganti password → semua sesi logout)
      const resRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
      expect(resRefresh.body.success).toBe(false);

      // Jejak audit PASSWORD_CHANGED ada, tanpa nilai password (S-04)
      const audit = await pgPool.query(
        `SELECT action, new_values FROM audit_logs
         WHERE action = 'PASSWORD_CHANGED' AND record_id = $1 ORDER BY id DESC LIMIT 1`,
        [cpUserId],
      );
      expect(audit.rows[0].action).toBe('PASSWORD_CHANGED');
      expect(JSON.stringify(audit.rows[0].new_values)).not.toContain(newPassword);

      // Kembalikan password untuk test berikutnya di describe ini
      const oldHash = await bcrypt.hash(cpPassword, 12);
      await pgPool.query(
        'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
        [oldHash, cpUserId],
      );
    });

    it('menolak password saat ini salah (401)', async () => {
      const { accessToken } = await cpLogin();

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'SalahPass123!', newPassword: 'CpNewPass456!' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('menolak password baru < 8 karakter (400, error inline fields)', async () => {
      const { accessToken } = await cpLogin();

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: cpPassword, newPassword: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fields.newPassword).toBeDefined();
    });

    it('menolak password baru sama dengan password saat ini (400)', async () => {
      const { accessToken } = await cpLogin();

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: cpPassword, newPassword: cpPassword })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('menolak tanpa token (401)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: cpPassword, newPassword: 'CpNewPass456!' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });
});
