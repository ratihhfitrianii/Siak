// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
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
  const testPassword = 'TestPass123!';
  let testUserId: number;

  beforeAll(async () => {
    // Create test user
    const passwordHash = await bcrypt.hash(testPassword, 12);
    const roleResult = await pgPool.query("SELECT id FROM roles WHERE code = 'mahasiswa'");
    const roleId = roleResult.rows[0].id;

    const result = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = true
       RETURNING id`,
      [testEmail, passwordHash, 'Test Auth User', roleId],
    );
    testUserId = result.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pgPool.query('DELETE FROM users WHERE email = $1', [testEmail]);
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
  });

  async function loginAndGetTokens() {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken,
      refreshToken: res.body.data.refreshToken,
    };
  }

  describe('POST /api/v1/auth/login', () => {
    it('should return 400 for missing email', async () => {
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
        .send({ email: testEmail })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return specific field message for invalid email (UX: bukan pesan generik)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bukan-email', password: testPassword })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Email tidak valid');
      expect(res.body.error.details.fields.email).toBeDefined();
    });

    it('should return 401 for invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@siak.local', password: testPassword })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for invalid password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'WrongPassword123!' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 200 with tokens for valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.expiresIn).toBe(900); // 15 minutes
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
});
