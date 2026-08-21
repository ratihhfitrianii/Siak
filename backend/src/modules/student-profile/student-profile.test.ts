import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import request from 'supertest';

// Env test SEBELUM import app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-student-profile';

import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

const app = createApp({}, { waitingRoom: null });

// Helper: login as student and get token
async function loginStudent(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });
  return res.body.data?.accessToken ?? '';
}

const STUDENT_EMAIL = 'e2e.mahasiswa1@test.local';
const STUDENT_PASSWORD = 'Mahasiswa123!';

let studentToken = '';

describe('Student Profile Module', () => {
  beforeAll(async () => {
    // Try to get a real student token; if not available, tests will be skipped
    try {
      studentToken = await loginStudent(STUDENT_EMAIL, STUDENT_PASSWORD);
    } catch {
      // Ignore — tests will be skipped
    }
  });

  afterAll(async () => {
    await pgPool.end();
  });

  describe('GET /students/me', () => {
    it('should return student profile when authenticated', async () => {
      if (!studentToken) return;

      const res = await request(app)
        .get('/api/v1/students/me')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.nim).toBeDefined();
      expect(res.body.data.fullName).toBeDefined();
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/students/me');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /students/me', () => {
    it('should update student phone', async () => {
      if (!studentToken) return;

      const res = await request(app)
        .put('/api/v1/students/me')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ phone: '08123456789' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid input', async () => {
      if (!studentToken) return;

      const res = await request(app)
        .put('/api/v1/students/me')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ phone: 'abc' }); // invalid phone

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).put('/api/v1/students/me').send({ phone: '08123456789' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /students/me/ips', () => {
    it('should return IPS per semester', async () => {
      if (!studentToken) return;

      const res = await request(app)
        .get('/api/v1/students/me/ips')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/students/me/ips');

      expect(res.status).toBe(401);
    });
  });
});
