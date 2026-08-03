// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';

// Import app AFTER env is set
import { createApp } from '../app';
import { pgPool } from '../lib/pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { authorize, authorizeWali } from '../lib/auth-middleware';
import { can, isWaliRole, isSuperuser, permissionsFor } from '../lib/policy';
import { AppError } from '../middleware/error-handler';
import type { Request, Response } from 'express';

const app = createApp();

describe('Auth Middleware — edge cases (coverage branches)', () => {
  const testEmail = 'rbac-edge@siak.local';
  const testPassword = 'TestPass123!';
  let activeUserId: number;
  let inactiveUserId: number;
  let validToken: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash(testPassword, 12);
    const roleRes = await pgPool.query("SELECT id FROM roles WHERE code = 'mahasiswa'");
    const roleId = roleRes.rows[0].id;

    const active = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Edge Active', $3, true) RETURNING id`,
      [testEmail, hash, roleId],
    );
    activeUserId = Number(active.rows[0].id);

    const inactive = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Edge Inactive', $3, false) RETURNING id`,
      ['rbac-edge-inactive@siak.local', hash, roleId],
    );
    inactiveUserId = Number(inactive.rows[0].id);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    validToken = login.body.data.accessToken;
    expect(validToken).toBeTruthy(); // gunakan variabel agar tidak "unused"
  });

  afterAll(async () => {
    await pgPool.query('DELETE FROM users WHERE email IN ($1, $2)', [
      testEmail,
      'rbac-edge-inactive@siak.local',
    ]);
    // T1.9: pgPool.end() dihapus — pool dibagikan antar suite (race; jest forceExit: true).
  });

  it('invalid/expired token → 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token untuk user yang tidak ada → 401', async () => {
    const ghostToken = jwt.sign({ sub: 99999999 }, process.env.JWT_SECRET!, { expiresIn: '5m' });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${ghostToken}`)
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('akun non-aktif → 403 FORBIDDEN', async () => {
    const inactiveToken = jwt.sign({ sub: inactiveUserId }, process.env.JWT_SECRET!, {
      expiresIn: '5m',
    });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('token sub non-number (string) tetap diterima', async () => {
    const stringSubToken = jwt.sign({ sub: String(activeUserId) }, process.env.JWT_SECRET!, {
      expiresIn: '5m',
    });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${stringSubToken}`)
      .expect(200);
    expect(res.body.data.id).toBe(activeUserId);
  });

  it('token tanpa sub → 401', async () => {
    const noSubToken = jwt.sign({ email: 'x@x.com' }, process.env.JWT_SECRET!, { expiresIn: '5m' });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${noSubToken}`)
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('authorize tanpa req.user → 401 (unit)', async () => {
    const req = { user: undefined } as unknown as Request;
    const next = jest.fn((err?: unknown) => err);
    authorize('user.manage')(req, {} as Response, next as never);
    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('authorize di luar peran → 403 (unit)', async () => {
    const req = {
      user: { roleCode: 'mahasiswa', id: 1 },
    } as unknown as Request;
    const next = jest.fn((err?: unknown) => err);
    authorize('user.manage')(req, {} as Response, next as never);
    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it('authorizeWali: dosen non-wali ditolak → 403', async () => {
    const req = { user: { roleCode: 'dosen', isWali: false } } as unknown as Request;
    const next = jest.fn((err?: unknown) => err);
    authorizeWali('guidance.manage')(req, {} as Response, next as never);
    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it('authorizeWali: dosen wali diizinkan (unit)', async () => {
    const req = { user: { roleCode: 'dosen', isWali: true } } as unknown as Request;
    const next = jest.fn();
    authorizeWali('guidance.manage')(req, {} as Response, next as never);
    expect(next).toHaveBeenCalledWith();
  });

  it('authorizeWali: non-dosen dengan permission tetap diizinkan (unit)', async () => {
    const req = { user: { roleCode: 'admin_akademik', isWali: false } } as unknown as Request;
    const next = jest.fn();
    authorizeWali('guidance.manage')(req, {} as Response, next as never);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('Policy Service — edge cases', () => {
  it('role tidak dikenal → false (bukan throw)', () => {
    expect(can('unknown_role' as never, 'krs.fill')).toBe(false);
  });

  it('isSuperuser hanya admin_sistem', () => {
    expect(isSuperuser('admin_sistem')).toBe(true);
    expect(isSuperuser('dosen')).toBe(false);
  });

  it('isWaliRole hanya bermakna untuk dosen', () => {
    expect(isWaliRole('dosen', true)).toBe(true);
    expect(isWaliRole('dosen', false)).toBe(false);
    expect(isWaliRole('mahasiswa', true)).toBe(false);
    expect(isWaliRole('admin_sistem', true)).toBe(false);
  });

  it('permissionsFor role tak dikenal → empty', () => {
    expect(permissionsFor('unknown_role' as never)).toEqual([]);
  });

  it('semua PERMISSIONS valid (no undefined cells)', () => {
    const { PERMISSIONS } = require('../lib/policy') as typeof import('../lib/policy');
    for (const p of PERMISSIONS) {
      expect(can('admin_sistem', p)).toBe(true);
    }
  });
});
