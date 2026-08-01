import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { logger } from '../../lib/logger';
import { AppError } from '../../middleware/error-handler';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_EXPIRY = '15m';
const _REFRESH_EXPIRY = '7d';
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const _BCRYPT_ROUNDS = 12;

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token wajib diisi'),
});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

// In-memory refresh token store (production: Redis dengan TTL)
// Key: tokenHash, Value: { userId, expiresAt, revoked }
const refreshTokenStore = new Map<
  string,
  { userId: number; expiresAt: number; revoked: boolean }
>();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTokens(userId: number, email: string, roleId: number, isWali: boolean) {
  const accessToken = jwt.sign({ sub: userId, email, roleId, isWali }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_EXPIRY,
  });
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const refreshHash = hashToken(refreshToken);

  refreshTokenStore.set(refreshHash, {
    userId,
    expiresAt: Date.now() + REFRESH_EXPIRY_MS,
    revoked: false,
  });

  return { accessToken, refreshToken };
}

function verifyRefreshToken(refreshToken: string) {
  const refreshHash = hashToken(refreshToken);
  const record = refreshTokenStore.get(refreshHash);
  if (!record || record.revoked || record.expiresAt < Date.now()) {
    return null;
  }
  return record;
}

function revokeRefreshToken(refreshToken: string) {
  const refreshHash = hashToken(refreshToken);
  const record = refreshTokenStore.get(refreshHash);
  if (record) {
    record.revoked = true;
  }
}

// Periodic cleanup expired tokens
let cleanupInterval: NodeJS.Timeout;

function startCleanupInterval() {
  cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [key, record] of refreshTokenStore.entries()) {
        if (record.expiresAt < now || record.revoked) {
          refreshTokenStore.delete(key);
        }
      }
    },
    60 * 60 * 1000,
  ); // every hour
}

function stopCleanupInterval() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
}

// Start cleanup on module load (skip in test env)
if (process.env.NODE_ENV !== 'test') {
  startCleanupInterval();

  // Graceful shutdown
  process.on('SIGTERM', stopCleanupInterval);
  process.on('SIGINT', stopCleanupInterval);
}

export function createAuthRouter(): Router {
  const router = Router();

  // POST /api/v1/auth/login
  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Email dan password wajib diisi', 400);
      }

      const { email, password } = parsed.data;

      const result = await pgPool.query(
        `SELECT u.id, u.email, u.password_hash, u.full_name, u.role_id, u.is_wali, u.is_active, u.failed_login_attempts, u.locked_until, r.code as role_code
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.email = $1`,
        [email],
      );

      if (result.rows.length === 0) {
        logger.warn({ email, ip: req.ip }, 'Login attempt: user not found');
        throw new AppError('UNAUTHORIZED', 'Email atau password salah', 401);
      }

      const user = result.rows[0];

      if (!user.is_active) {
        throw new AppError('FORBIDDEN', 'Akun tidak aktif', 403);
      }

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new AppError('TOO_MANY_REQUESTS', 'Akun terkunci, coba lagi nanti', 429);
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        // Increment failed attempts
        const newAttempts = user.failed_login_attempts + 1;
        const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null; // lock 15 menit
        await pgPool.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [newAttempts, lockUntil, user.id],
        );

        logger.warn({ userId: user.id, attempts: newAttempts }, 'Login attempt: invalid password');
        throw new AppError('UNAUTHORIZED', 'Email atau password salah', 401);
      }

      // Reset failed attempts on success
      if (user.failed_login_attempts > 0 || user.locked_until) {
        await pgPool.query(
          'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
          [user.id],
        );
      } else {
        await pgPool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
      }

      const { accessToken, refreshToken } = generateTokens(
        user.id,
        user.email,
        user.role_id,
        user.is_wali,
      );

      logger.info({ userId: user.id, role: user.role_code }, 'User logged in');

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role_code,
            isWali: user.is_wali,
          },
          expiresIn: 15 * 60, // 15 minutes in seconds
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/auth/refresh
  router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Refresh token wajib diisi', 400);
      }

      const { refreshToken } = parsed.data;
      const record = verifyRefreshToken(refreshToken);

      if (!record) {
        throw new AppError('UNAUTHORIZED', 'Refresh token tidak valid atau kadaluarsa', 401);
      }

      // Get fresh user data
      const result = await pgPool.query(
        `SELECT u.id, u.email, u.full_name, u.role_id, u.is_wali, u.is_active, r.code as role_code
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [record.userId],
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        revokeRefreshToken(refreshToken);
        throw new AppError('UNAUTHORIZED', 'User tidak ditemukan atau tidak aktif', 401);
      }

      const user = result.rows[0];

      // Rotate refresh token: revoke old, issue new
      revokeRefreshToken(refreshToken);
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(
        user.id,
        user.email,
        user.role_id,
        user.is_wali,
      );

      logger.info({ userId: user.id }, 'Token refreshed');

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: 15 * 60,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/auth/logout
  router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = logoutSchema.safeParse(req.body);
      if (parsed.success && parsed.data.refreshToken) {
        revokeRefreshToken(parsed.data.refreshToken);
      }
      // If no refreshToken provided, client-side logout only
      res.json({ success: true, data: { message: 'Logged out' } });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/auth/me (get current user from access token)
  router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new AppError('UNAUTHORIZED', 'Authorization header required', 401);
      }

      const token = authHeader.slice(7);
      let payload: { sub: number; email: string; roleId: number; isWali: boolean };

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!);
        if (
          typeof decoded === 'string' ||
          !decoded ||
          (typeof decoded.sub !== 'number' && typeof decoded.sub !== 'string') ||
          typeof decoded.email !== 'string' ||
          (typeof decoded.roleId !== 'number' && typeof decoded.roleId !== 'string') ||
          typeof decoded.isWali !== 'boolean'
        ) {
          throw new Error('Invalid token payload');
        }
        payload = {
          sub: typeof decoded.sub === 'string' ? parseInt(decoded.sub, 10) : decoded.sub,
          email: decoded.email,
          roleId:
            typeof decoded.roleId === 'string' ? parseInt(decoded.roleId, 10) : decoded.roleId,
          isWali: decoded.isWali,
        };
      } catch {
        throw new AppError('UNAUTHORIZED', 'Token tidak valid atau kadaluarsa', 401);
      }

      const result = await pgPool.query(
        `SELECT u.id, u.email, u.full_name, u.role_id, u.is_wali, r.code as role_code
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 AND u.is_active = true`,
        [payload.sub],
      );

      if (result.rows.length === 0) {
        throw new AppError('UNAUTHORIZED', 'User tidak ditemukan', 401);
      }

      const user = result.rows[0];
      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role_code,
          isWali: user.is_wali,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
