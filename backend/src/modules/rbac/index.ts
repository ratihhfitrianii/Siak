import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';
import { permissionsFor, ROLE_CODES } from '../../lib/policy';

/**
 * Modul User & RBAC — T1.4 (F-09, S-05, AC-10).
 * Endpoints:
 *   GET  /users/me          — profil + menu RBAC (semua peran)
 *   PUT  /users/me/contact  — edit kontak (mahasiswa, admin_sistem)
 *   GET  /users             — list + filter role (admin_sistem)
 *   POST /users             — create user (admin_sistem)
 *   PUT  /users/:id/role    — update role + is_wali (admin_sistem)
 */

const BCRYPT_ROUNDS = 12;

const updateContactSchema = z.object({
  fullName: z.string().min(2, 'Nama minimal 2 karakter').optional(),
  email: z.string().email('Email tidak valid').optional(),
  password: z.string().min(8, 'Password minimal 8 karakter').optional(),
});

const createUserSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  fullName: z.string().min(2, 'Nama minimal 2 karakter'),
  roleCode: z.enum(['mahasiswa', 'dosen', 'admin_akademik', 'admin_keuangan', 'admin_sistem']),
  isWali: z.boolean().default(false),
});

const updateRoleSchema = z.object({
  roleCode: z.enum(['mahasiswa', 'dosen', 'admin_akademik', 'admin_keuangan', 'admin_sistem']),
  isWali: z.boolean().default(false),
});

const listQuerySchema = z.object({
  role: z.string().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createRbacRouter(): Router {
  const router = Router();

  // GET /users/me — profil + menu RBAC (semua peran, AC-10: UI membaca menu dari sini)
  router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const menu = permissionsFor(user.roleCode);

      const result = await pgPool.query(
        `SELECT u.id, u.email, u.full_name, u.is_active, u.must_change_password, u.created_at,
                r.code AS role_code, r.name AS role_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [user.id],
      );

      if (result.rows.length === 0) {
        throw new AppError('UNAUTHORIZED', 'User tidak ditemukan', 401);
      }

      const row = result.rows[0];
      res.json({
        success: true,
        data: {
          id: Number(row.id), // BIGSERIAL int8 → string dari pg; normalize ke number
          email: row.email,
          fullName: row.full_name,
          role: row.role_code,
          roleName: row.role_name,
          isWali: user.isWali,
          isActive: row.is_active,
          mustChangePassword: row.must_change_password === true,
          createdAt: row.created_at,
          menu,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /users/me/contact — edit kontak (mahasiswa, admin_sistem per §6.1)
  router.put(
    '/me/contact',
    authenticate,
    authorize('user.edit_contact'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = updateContactSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data kontak tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }

        const user = req.user!;
        const { fullName, email, password } = parsed.data;

        if (email && email !== user.email) {
          const dup = await pgPool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [
            email,
            user.id,
          ]);
          if (dup.rows.length > 0) {
            throw new AppError('VALIDATION_ERROR', 'Email sudah digunakan', 409);
          }
        }

        const passwordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : undefined;

        const result = await pgPool.query(
          `UPDATE users
         SET full_name = COALESCE($1, full_name),
             email = COALESCE($2, email),
             password_hash = COALESCE($3, password_hash),
             updated_at = now()
         WHERE id = $4
         RETURNING id, email, full_name, updated_at`,
          [fullName ?? null, email ?? null, passwordHash ?? null, user.id],
        );

        // Audit trail (F-13, S-06, S-07) — password TIDAK pernah dicatat (S-04)
        await auditFromRequest(req.user!, req, {
          tableName: 'users',
          recordId: user.id,
          action: 'UPDATE',
          oldValues: { fullName: user.fullName, email: user.email },
          newValues: {
            fullName: fullName ?? null,
            email: email ?? null,
            passwordChanged: password ? true : false,
          },
        });

        res.json({
          success: true,
          data: { ...result.rows[0], message: 'Kontak berhasil diperbarui' },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /users — list + filter (admin_sistem)
  router.get(
    '/',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = listQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }

        const { role, search, page, limit } = q.data;
        const where: string[] = [];
        const params: unknown[] = [];

        if (role) {
          params.push(role);
          where.push(`r.code = $${params.length}`);
        }
        if (search) {
          params.push(`%${search}%`);
          where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (page - 1) * limit;

        const countResult = await pgPool.query(
          `SELECT count(*)::int AS total
         FROM users u JOIN roles r ON u.role_id = r.id
         ${whereSql}`,
          params,
        );

        const listResult = await pgPool.query(
          `SELECT u.id, u.email, u.full_name, u.is_wali, u.is_active, u.last_login_at, u.created_at,
                r.code AS role_code, r.name AS role_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         ${whereSql}
         ORDER BY u.id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );

        const items = listResult.rows.map((row) => ({ ...row, id: Number(row.id) }));

        res.json({
          success: true,
          data: {
            items,
            pagination: { page, limit, total: countResult.rows[0].total },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /users — create user + role (admin_sistem)
  router.post(
    '/',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = createUserSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data user tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }

        const { email, password, fullName, roleCode, isWali } = parsed.data;

        const dup = await pgPool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (dup.rows.length > 0) {
          throw new AppError('VALIDATION_ERROR', 'Email sudah digunakan', 409);
        }

        const roleResult = await pgPool.query('SELECT id FROM roles WHERE code = $1', [roleCode]);
        if (roleResult.rows.length === 0) {
          throw new AppError('VALIDATION_ERROR', 'Role tidak ditemukan', 400);
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const result = await pgPool.query(
          `INSERT INTO users (email, password_hash, full_name, role_id, is_wali, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, email, full_name, is_wali, created_at`,
          [
            email,
            passwordHash,
            fullName,
            roleResult.rows[0].id,
            roleCode === 'dosen' ? isWali : false,
          ],
        );

        // Audit trail (F-13, S-06, S-07) — password TIDAK pernah dicatat (S-04)
        await auditFromRequest(req.user!, req, {
          tableName: 'users',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: { email, fullName, roleCode, isWali: roleCode === 'dosen' ? isWali : false },
        });

        res.status(201).json({
          success: true,
          data: {
            ...result.rows[0],
            id: Number(result.rows[0].id),
            message: 'User berhasil dibuat',
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /users/:id/role — update role + is_wali (admin_sistem)
  router.put(
    '/:id/role',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID user tidak valid', 400);
        }

        const parsed = updateRoleSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data role tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }

        const { roleCode, isWali } = parsed.data;
        const actor = req.user!;

        // Keamanan: tidak boleh mengubah role diri sendiri (anti self-lockout)
        if (targetId === actor.id) {
          throw new AppError('VALIDATION_ERROR', 'Tidak dapat mengubah role akun sendiri', 400);
        }

        const roleResult = await pgPool.query('SELECT id FROM roles WHERE code = $1', [roleCode]);
        if (roleResult.rows.length === 0) {
          throw new AppError('VALIDATION_ERROR', 'Role tidak ditemukan', 400);
        }

        const target = await pgPool.query(
          `SELECT u.id, u.email, u.full_name, r.code AS role_code, u.is_wali
           FROM users u
           JOIN roles r ON u.role_id = r.id
           WHERE u.id = $1`,
          [targetId],
        );
        if (target.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'User tidak ditemukan', 404);
        }

        const result = await pgPool.query(
          `UPDATE users
         SET role_id = $1, is_wali = $2, updated_at = now()
         WHERE id = $3
         RETURNING id, email, full_name, is_wali`,
          [roleResult.rows[0].id, roleCode === 'dosen' ? isWali : false, targetId],
        );

        // Audit trail (F-13, S-06, S-07) — perubahan RBAC paling penting dicatat
        await auditFromRequest(req.user!, req, {
          tableName: 'users',
          recordId: targetId,
          action: 'UPDATE',
          oldValues: { roleCode: target.rows[0].role_code, isWali: target.rows[0].is_wali },
          newValues: { roleCode, isWali: roleCode === 'dosen' ? isWali : false },
        });

        res.json({
          success: true,
          data: {
            ...result.rows[0],
            id: Number(result.rows[0].id),
            role: roleCode,
            message: 'Role berhasil diperbarui',
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export { ROLE_CODES };
