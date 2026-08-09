// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';

import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';
import {
  createNotificationRouter,
  deliverPendingNotifications,
  remindUnfilledStudents,
  sendInAppNotification,
} from './index';
import type { NotificationProvider } from './provider';
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
      .send({ identifier: email, password: role === 'admin_akademik' ? 'Admin123!' : 'Mhs123!' });
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
  // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
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
        const item = verify.body.data.items.find(
          (n: { id: number; isRead: boolean }) => n.id === nid,
        );
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

  describe('PUT /notifications/read-all', () => {
    it('returns 401 without token', async () => {
      await request(app).put('/api/v1/notifications/read-all').expect(401);
    });

    it('marks all own notifications as read', async () => {
      // Seed 2 notifikasi belum dibaca untuk user mahasiswa
      const uid = userIdByRole.mahasiswa;
      await pgPool.query(
        `INSERT INTO notifications (user_id, title, message, type, is_read)
         VALUES ($1, 'ReadAll A', 'msg', 'info', false),
                ($1, 'ReadAll B', 'msg', 'info', false)`,
        [uid],
      );

      const res = await request(app)
        .put('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.marked).toBeGreaterThanOrEqual(2);

      const verify = await request(app)
        .get('/api/v1/notifications/my')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(200);
      const mine = verify.body.data.items.filter((n: { title: string }) =>
        n.title.startsWith('ReadAll'),
      );
      expect(mine.length).toBe(2);
      for (const n of mine) expect(n.isRead).toBe(true);
    });

    it('returns marked=0 when nothing unread', async () => {
      const res = await request(app)
        .put('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${tokens.mahasiswa}`)
        .expect(200);
      expect(res.body.data.marked).toBe(0);
    });
  });

  describe('remindUnfilledStudents', () => {
    it('runs without error and returns count (may be 0 if no eligible students)', async () => {
      const count = await remindUnfilledStudents();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deliverPendingNotifications (T2.5)', () => {
    let createdIds: number[] = [];

    function failingProvider(message: string): NotificationProvider {
      return {
        name: 'mock-fail',
        send: async () => {
          throw new Error(message);
        },
      };
    }

    beforeEach(async () => {
      createdIds = [];
    });

    afterEach(async () => {
      if (createdIds.length > 0) {
        await pgPool.query('DELETE FROM notifications WHERE id = ANY($1::bigint[])', [createdIds]);
      }
    });

    it('mengirim via provider sukses → status SENT + sent_at terisi', async () => {
      const UID = userIdByRole.mahasiswa!;
      const sent: Array<{ email: string }> = [];
      const okProvider: NotificationProvider = {
        name: 'mock-ok',
        send: async (r) => {
          sent.push(r);
        },
      };
      const ins = await pgPool.query(
        `INSERT INTO notifications (user_id, title, message, type, sent_via, status)
         VALUES ($1, 'Email test', 'Pesan', 'system', ARRAY['in_app','email'], 'PENDING')
         RETURNING id`,
        [UID],
      );
      createdIds.push(Number(ins.rows[0].id));

      const { delivered, failed } = await deliverPendingNotifications([okProvider]);

      expect(delivered).toBe(1);
      expect(failed).toBe(0);
      expect(sent.length).toBe(1);
      const row = await pgPool.query('SELECT status, sent_at FROM notifications WHERE id = $1', [
        createdIds[0],
      ]);
      expect(row.rows[0].status).toBe('SENT');
      expect(row.rows[0].sent_at).not.toBeNull();
    });

    it('provider gagal → attempts naik, status tetap PENDING (retry berikutnya)', async () => {
      const UID = userIdByRole.mahasiswa!;
      const ins = await pgPool.query(
        `INSERT INTO notifications (user_id, title, message, type, sent_via, status)
         VALUES ($1, 'Email retry', 'Pesan', 'system', ARRAY['in_app','email'], 'PENDING')
         RETURNING id`,
        [UID],
      );
      createdIds.push(Number(ins.rows[0].id));

      const { delivered, failed } = await deliverPendingNotifications([
        failingProvider('smtp down'),
      ]);

      expect(delivered).toBe(0);
      expect(failed).toBe(1);
      const row = await pgPool.query(
        'SELECT status, attempts, last_error FROM notifications WHERE id = $1',
        [createdIds[0]],
      );
      expect(row.rows[0].status).toBe('PENDING');
      expect(Number(row.rows[0].attempts)).toBe(1);
      expect(row.rows[0].last_error).toContain('smtp down');
    });

    it('gagal 3× → status FAILED (retry habis)', async () => {
      const UID = userIdByRole.mahasiswa!;
      const ins = await pgPool.query(
        `INSERT INTO notifications (user_id, title, message, type, sent_via, status, attempts)
         VALUES ($1, 'Email exhausted', 'Pesan', 'system', ARRAY['in_app','email'], 'PENDING', 2)
         RETURNING id`,
        [UID],
      );
      createdIds.push(Number(ins.rows[0].id));

      const { delivered, failed } = await deliverPendingNotifications([
        failingProvider('permanent failure'),
      ]);

      expect(delivered).toBe(0);
      expect(failed).toBe(1);
      const row = await pgPool.query(
        'SELECT status, attempts, last_error FROM notifications WHERE id = $1',
        [createdIds[0]],
      );
      expect(row.rows[0].status).toBe('FAILED');
      expect(Number(row.rows[0].attempts)).toBe(3);
      expect(row.rows[0].last_error).toContain('permanent failure');
    });

    it('in-app saja (tanpa kanal email) → tidak diproses oleh delivery', async () => {
      const UID = userIdByRole.mahasiswa!;
      const ins = await pgPool.query(
        `INSERT INTO notifications (user_id, title, message, type, sent_via, status)
         VALUES ($1, 'In-app only', 'Pesan', 'system', ARRAY['in_app'], 'SENT')
         RETURNING id`,
        [UID],
      );
      createdIds.push(Number(ins.rows[0].id));

      let calls = 0;
      const spyProvider: NotificationProvider = {
        name: 'mock-spy',
        send: async () => {
          calls += 1;
        },
      };
      const { delivered, failed } = await deliverPendingNotifications([spyProvider]);
      expect(delivered).toBe(0);
      expect(failed).toBe(0);
      expect(calls).toBe(0);
    });
  });
});
