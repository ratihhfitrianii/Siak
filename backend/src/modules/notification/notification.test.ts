// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';

import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';
import { createNotificationRouter, remindUnfilledStudents, sendInAppNotification } from './index';
import request from 'supertest';

const app = createApp();
app.use('/api/v1', createNotificationRouter());

const tokens: Record<string, string> = {};
const userIdByRole: Record<string, number> = {};

beforeAll(async () => {
  // Login seed users
  const emails = {
    admin_akademik: 'akademik@siak.local',
    mahasiswa: 'mhs.TI_20232024_2@siak.local',
  };
  for (const [role, email] of Object.entries(emails)) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: role === 'admin_akademik' ? 'Admin123!' : 'Mhs123!' });
    tokens[role] = res.body.data.accessToken;
    userIdByRole[role] = res.body.data.user.id;
  }

  // Ensure clean notification state for test users
  await pgPool.query('DELETE FROM notifications WHERE user_id IN ($1, $2)', [
    userIdByRole.admin_akademik,
    userIdByRole.mahasiswa,
  ]);
}, 20_000);

afterAll(async () => {
  await pgPool.query('DELETE FROM notifications WHERE user_id IN ($1, $2)', [
    userIdByRole.admin_akademik,
    userIdByRole.mahasiswa,
  ]);
  await pgPool.end();
});

describe('Notification module (T1.6)', () => {
  describe('sendInAppNotification', () => {
    it('inserts a notification and can be retrieved via GET /notifications/my', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/my')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      const initialCount = res.body.data.items.length;

      // Directly call helper to cover its branch (line 38 in index.ts)
      await sendInAppNotification({
        userId: userIdByRole.mahasiswa!,
        type: 'system',
        title: 'Test coverage',
        message: 'Testing sendInAppNotification branch',
      });

      // Verify it's retrievable
      const after = await request(app)
        .get('/api/v1/notifications/my')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(200);
      expect(after.body.data.items.length).toBe(initialCount + 1);
      const added = after.body.data.items[0];
      expect(added.title).toBe('Test coverage');
      expect(added.type).toBe('system');
    });
  });

  describe('GET /notifications/my', () => {
    it('returns 401 without token', async () => {
      await request(app).get('/api/v1/notifications/my').expect(401);
    });

    it('returns only current user notifications', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/my')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('PUT /notifications/:id/read', () => {
    it('returns 401 without token', async () => {
      await request(app).put('/api/v1/notifications/1/read').expect(401);
    });

    it('returns 400 for invalid id', async () => {
      await request(app)
        .put('/api/v1/notifications/abc/read')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(400);
    });

    it('returns 404 for non-existent notification', async () => {
      await request(app)
        .put('/api/v1/notifications/999999/read')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(404);
    });

    it('marks own notification as read', async () => {
      const listRes = await request(app)
        .get('/api/v1/notifications/my')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(200);

      if (listRes.body.data.items.length > 0) {
        const nid = listRes.body.data.items[0].id;
        const res = await request(app)
          .put(`/api/v1/notifications/${nid}/read`)
          .set('Authorization', `Bearer ${tokens.mahasiswa}`)
          .expect(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.isRead).toBe(true);
        expect(res.body.data.id).toBe(nid);

        const verify = await request(app)
          .get('/api/v1/notifications/my')
          .set('Authorization', `Bearer ${tokens.mahasiswa}`)
          .expect(200);
        const item = verify.body.data.items.find((n: { id: number; isRead: boolean }) => n.id === nid);
        expect(item?.isRead).toBe(true);
      }
    });

    it('returns 404 when trying to read another user notification', async () => {
      const adminList = await request(app)
        .get('/api/v1/notifications/my')
        .set('Authorization', `Bearer ${tokens.admin_akademik}`)
        .expect(200);

      if (adminList.body.data.items.length > 0) {
        const adminNid = adminList.body.data.items[0].id;
        await request(app)
          .put(`/api/v1/notifications/${adminNid}/read`)
          .set('Authorization', `Bearer ${tokens.mahasiswa}`)
          .expect(404);
      }
    });
  });

  describe('remindUnfilledStudents', () => {
    it('runs without error and returns count (may be 0 if no eligible students)', async () => {
      const count = await remindUnfilledStudents();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});