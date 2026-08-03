import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';

/**
 * Modul Audit — T1.9 (F-13, S-06, S-07, AC-05).
 *   GET /api/v1/audit-logs — lihat audit trail + filter (Admin Akademik/Keuangan/Sistem per §6.1).
 *
 * Pencatatan mutasi dilakukan via audit-service (src/lib/audit-service.ts)
 * di tiap handler mutasi — router ini hanya untuk pembacaan.
 */

const AUDIT_ACTIONS = ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'] as const;

const listQuerySchema = z.object({
  tableName: z.string().max(50).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  changedBy: z.coerce.number().int().positive().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'table_name', 'action', 'id']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export function createAuditRouter(): Router {
  const router = Router();

  // GET /audit-logs — list + filter + pagination (F-13, AC-05)
  router.get(
    '/audit-logs',
    authenticate,
    authorize('audit.view'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = listQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400, {
            fields: q.error.flatten().fieldErrors,
          });
        }

        const { tableName, action, changedBy, from, to, page, limit, sort, order } = q.data;
        const where: string[] = [];
        const params: unknown[] = [];

        if (tableName) {
          params.push(tableName);
          where.push(`al.table_name = $${params.length}`);
        }
        if (action) {
          params.push(action);
          where.push(`al.action = $${params.length}`);
        }
        if (changedBy) {
          params.push(changedBy);
          where.push(`al.changed_by = $${params.length}`);
        }
        if (from) {
          params.push(from);
          where.push(`al.created_at >= $${params.length}`);
        }
        if (to) {
          params.push(to);
          where.push(`al.created_at <= $${params.length}`);
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (page - 1) * limit;
        // sort/order dari enum whitelist — aman dari SQL injection (S-03)
        const orderSql = `ORDER BY al.${sort} ${order}, al.id DESC`;

        const countResult = await pgPool.query(
          `SELECT count(*)::int AS total FROM audit_logs al ${whereSql}`,
          params,
        );

        const listResult = await pgPool.query(
          `SELECT al.id, al.table_name, al.record_id, al.action, al.old_values, al.new_values,
                  al.changed_by, al.changed_by_label, al.ip_address, al.user_agent, al.created_at,
                  u.email AS changed_by_email
           FROM audit_logs al
           LEFT JOIN users u ON u.id = al.changed_by
           ${whereSql}
           ${orderSql}
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );

        const items = listResult.rows.map((row) => ({
          id: Number(row.id), // BIGSERIAL int8 → string dari pg; normalize ke number
          tableName: row.table_name,
          recordId: Number(row.record_id),
          action: row.action,
          oldValues: row.old_values,
          newValues: row.new_values,
          changedBy: Number(row.changed_by),
          changedByEmail: row.changed_by_email,
          changedByLabel: row.changed_by_label,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at,
        }));

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

  return router;
}
