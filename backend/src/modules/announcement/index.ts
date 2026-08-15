import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';

/**
 * Modul Announcements (Informasi Penting) — admin_sistem mengelola informasi yang
 * ditampilkan di dashboard mahasiswa & dosen.
 *
 * - GET  /announcements           — list (admin: semua; mahasiswa/dosen: hanya aktif & target mereka)
 * - GET  /announcements/:id       — detail
 * - POST /announcements           — buat (admin_sistem)
 * - PUT  /announcements/:id       — update (admin_sistem)
 * - DELETE /announcements/:id     — hapus/soft delete (admin_sistem)
 *
 * Target roles: array role codes. Empty array = semua role.
 * Priority: higher = ditampilkan lebih atas.
 */

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  targetRoles: z.array(z.string()).default([]),
  priority: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  publishedAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  activeOnly: z.coerce.boolean().default(false),
});

export function createAnnouncementRouter(): Router {
  const router = Router();

  // GET / — list announcements
  // Admin sistem: semua announcement (filter activeOnly)
  // Mahasiswa/Dosen: hanya yang isActive, publishedAt <= now, (expiresAt IS NULL OR expiresAt > now), targetRoles contains their role OR empty
  router.get(
    '/',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = listQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }
        const { page, limit, activeOnly } = q.data;
        const offset = (page - 1) * limit;

        const userRole = req.user!.roleCode;
        const isAdmin = userRole === 'admin_sistem';

        let where = 'WHERE 1=1';
        const params: unknown[] = [];

        if (activeOnly || !isAdmin) {
          // Hanya yang aktif, sudah published, belum expired, dan target role match
          params.push(new Date().toISOString());
          where += ` AND a.is_active AND (a.published_at IS NULL OR a.published_at <= $${params.length})`;
          params.push(new Date().toISOString());
          where += ` AND (a.expires_at IS NULL OR a.expires_at > $${params.length})`;
          if (!isAdmin) {
            params.push(userRole);
            where += ` AND (a.target_roles = '{}' OR $${params.length} = ANY(a.target_roles))`;
          }
        }

        where += ' ORDER BY a.priority DESC, a.published_at DESC NULLS LAST, a.created_at DESC';

        const countResult = await pgPool.query(
          `SELECT count(*)::int AS total FROM announcements a ${where}`,
          params,
        );

        const listResult = await pgPool.query(
          `SELECT a.id, a.title, a.message, a.target_roles AS "targetRoles", a.priority,
                  a.is_active AS "isActive", a.published_at AS "publishedAt", a.expires_at AS "expiresAt",
                  a.created_by AS "createdBy", a.created_at AS "createdAt", a.updated_at AS "updatedAt"
           FROM announcements a
           ${where}
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );

        res.json({
          success: true,
          data: {
            items: listResult.rows.map((r) => ({ ...r, id: Number(r.id), createdBy: Number(r.createdBy) })),
            pagination: { page, limit, total: countResult.rows[0].total },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /active — active announcements for dashboard (public for authenticated users)
  // Returns announcements that are: active, published, not expired, target role matches
  router.get(
    '/active',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userRole = req.user!.roleCode;

        const result = await pgPool.query(
          `SELECT a.id, a.title, a.message, a.target_roles AS "targetRoles", a.priority,
                  a.is_active AS "isActive", a.published_at AS "publishedAt", a.expires_at AS "expiresAt",
                  a.created_by AS "createdBy", a.created_at AS "createdAt", a.updated_at AS "updatedAt"
           FROM announcements a
           WHERE a.is_active
             AND (a.published_at IS NULL OR a.published_at <= now())
             AND (a.expires_at IS NULL OR a.expires_at > now())
             AND (a.target_roles = '{}' OR $1 = ANY(a.target_roles))
           ORDER BY a.priority DESC, a.published_at DESC NULLS LAST, a.created_at DESC`,
          [userRole],
        );

        res.json({
          success: true,
          data: result.rows.map((r) => ({ ...r, id: Number(r.id), createdBy: Number(r.createdBy) })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /:id — detail
  router.get(
    '/:id',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID announcement tidak valid', 400);
        }

        const userRole = req.user!.roleCode;
        const isAdmin = userRole === 'admin_sistem';

        let where = 'WHERE a.id = $1';
        const params: unknown[] = [id];

        if (!isAdmin) {
          params.push(new Date().toISOString());
          where += ` AND a.is_active AND (a.published_at IS NULL OR a.published_at <= $${params.length})`;
          params.push(new Date().toISOString());
          where += ` AND (a.expires_at IS NULL OR a.expires_at > $${params.length})`;
          params.push(userRole);
          where += ` AND (a.target_roles = '{}' OR $${params.length} = ANY(a.target_roles))`;
        }

        const result = await pgPool.query(
          `SELECT a.id, a.title, a.message, a.target_roles AS "targetRoles", a.priority,
                  a.is_active AS "isActive", a.published_at AS "publishedAt", a.expires_at AS "expiresAt",
                  a.created_by AS "createdBy", a.created_at AS "createdAt", a.updated_at AS "updatedAt"
           FROM announcements a
           ${where}`,
          params,
        );

        if (result.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Announcement tidak ditemukan', 404);
        }

        res.json({
          success: true,
          data: { ...result.rows[0], id: Number(result.rows[0].id), createdBy: Number(result.rows[0].createdBy) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST / — buat announcement (admin_sistem)
  router.post(
    '/',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = announcementSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data announcement tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { title, message, targetRoles, priority, isActive, publishedAt, expiresAt } = parsed.data;

        const result = await pgPool.query(
          `INSERT INTO announcements (title, message, target_roles, priority, is_active, published_at, expires_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, title, message, target_roles, priority, is_active, published_at, expires_at, created_by, created_at, updated_at`,
          [title, message, targetRoles, priority, isActive, publishedAt ?? null, expiresAt ?? null, req.user!.id],
        );

        await auditFromRequest(
          req.user!,
          req,
          {
            tableName: 'announcements',
            recordId: Number(result.rows[0].id),
            action: 'INSERT',
            newValues: { title, message, targetRoles, priority, isActive, publishedAt, expiresAt },
          },
        );

        res.status(201).json({
          success: true,
          data: { ...result.rows[0], id: Number(result.rows[0].id), createdBy: Number(result.rows[0].created_by) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /:id — update announcement (admin_sistem)
  router.put(
    '/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID announcement tidak valid', 400);
        }
        const parsed = announcementSchema.partial().safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data announcement tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { title, message, targetRoles, priority, isActive, publishedAt, expiresAt } = parsed.data;

        const exists = await pgPool.query('SELECT id FROM announcements WHERE id = $1', [id]);
        if (exists.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Announcement tidak ditemukan', 404);
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        if (title !== undefined) {
          params.push(title);
          updates.push(`title = $${params.length}`);
        }
        if (message !== undefined) {
          params.push(message);
          updates.push(`message = $${params.length}`);
        }
        if (targetRoles !== undefined) {
          params.push(targetRoles);
          updates.push(`target_roles = $${params.length}`);
        }
        if (priority !== undefined) {
          params.push(priority);
          updates.push(`priority = $${params.length}`);
        }
        if (isActive !== undefined) {
          params.push(isActive);
          updates.push(`is_active = $${params.length}`);
        }
        if (publishedAt !== undefined) {
          params.push(publishedAt);
          updates.push(`published_at = $${params.length}`);
        }
        if (expiresAt !== undefined) {
          params.push(expiresAt);
          updates.push(`expires_at = $${params.length}`);
        }
        if (updates.length === 0) {
          throw new AppError('VALIDATION_ERROR', 'Tidak ada field yang diupdate', 400);
        }
        updates.push('updated_at = now()');

        const result = await pgPool.query(
          `UPDATE announcements SET ${updates.join(', ')} WHERE id = $1
           RETURNING id, title, message, target_roles, priority, is_active, published_at, expires_at, created_by, created_at, updated_at`,
          params,
        );

        await auditFromRequest(
          req.user!,
          req,
          {
            tableName: 'announcements',
            recordId: id,
            action: 'UPDATE',
            newValues: { title, message, targetRoles, priority, isActive, publishedAt, expiresAt },
          },
        );

        res.json({
          success: true,
          data: { ...result.rows[0], id: Number(result.rows[0].id), createdBy: Number(result.rows[0].created_by) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /:id — hapus announcement (soft delete: is_active=false)
  router.delete(
    '/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID announcement tidak valid', 400);
        }

        await pgPool.query('UPDATE announcements SET is_active = false, updated_at = now() WHERE id = $1', [id]);

        await auditFromRequest(
          req.user!,
          req,
          {
            tableName: 'announcements',
            recordId: id,
            action: 'DELETE',
          },
        );

        res.json({ success: true, data: { message: 'Announcement dinonaktifkan' } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}