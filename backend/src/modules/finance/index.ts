import { Router, Request, Response, NextFunction } from 'express';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { AppError } from '../../middleware/error-handler';

/** Validasi mahasiswa punya studentId (dari JOIN users→students di authenticate). */
function requireStudent(req: Request): number {
  if (!req.user?.studentId) {
    throw new AppError('FORBIDDEN', 'Akun bukan mahasiswa aktif', 403);
  }
  return req.user.studentId;
}

export function createFinanceRouter(): Router {
  const router = Router();

  // All finance routes require authentication
  router.use(authenticate);

  // ── GET /api/v1/finance/semesters — Daftar semester utk filter (admin keuangan/sistem) ───
  router.get(
    '/semesters',
    authorize('payment.update'),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query(
          `SELECT id, code, name FROM semesters ORDER BY start_date DESC, id DESC`,
        );
        res.json({ success: true, data: result.rows });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── GET /api/v1/finance/payments — List payments (admin keuangan/sistem) ─────────────────
  router.get(
    '/payments',
    authorize('payment.update'), // admin keuangan/sistem can read payments
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { semester_id, status, student_id, prodi_id, page = '1', limit = '20' } = req.query;
        const p = Math.max(1, parseInt(page as string, 10));
        const l = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const offset = (p - 1) * l;

        let where = 'WHERE 1=1';
        const params: (string | number)[] = [];
        let paramIdx = 1;

        if (semester_id) {
          where += ` AND p.semester_id = $${paramIdx++}`;
          params.push(parseInt(semester_id as string, 10));
        }
        if (status) {
          where += ` AND p.status = $${paramIdx++}`;
          params.push(status as string);
        }
        if (student_id) {
          where += ` AND s.id = $${paramIdx++}`;
          params.push(parseInt(student_id as string, 10));
        }
        if (prodi_id) {
          where += ` AND s.prodi_id = $${paramIdx++}`;
          params.push(parseInt(prodi_id as string, 10));
        }

        // Count total
        const countSql = `
          SELECT COUNT(*)
          FROM payments p
          JOIN students s ON s.id = p.student_id
          ${where}
        `;
        const countRes = await pgPool.query(countSql, params);
        const total = parseInt(countRes.rows[0].count, 10);

        // Data
        const dataSql = `
          SELECT p.id, p.student_id, s.nim, u.full_name, s.prodi_id, pr.name as prodi_name,
                 p.semester_id, sem.code as semester_code, sem.name as semester_name,
                 p.total_amount, p.paid_amount, p.status, p.due_date, p.is_waived,
                 p.created_at, p.updated_at,
                 json_agg(json_build_object(
                   'type', pi.type, 'description', pi.description, 'amount', pi.amount, 'is_mandatory', pi.is_mandatory
                 )) FILTER (WHERE pi.id IS NOT NULL) as items
          FROM payments p
          JOIN students s ON s.id = p.student_id
          JOIN users u ON u.id = s.user_id
          JOIN prodis pr ON pr.id = s.prodi_id
          JOIN semesters sem ON sem.id = p.semester_id
          LEFT JOIN payment_items pi ON pi.payment_id = p.id
          ${where}
          GROUP BY p.id, s.nim, u.full_name, s.prodi_id, pr.name, p.semester_id, sem.code, sem.name
          ORDER BY p.created_at DESC
          LIMIT $${paramIdx++} OFFSET $${paramIdx}
        `;
        params.push(l, offset);

        const dataRes = await pgPool.query(dataSql, params);

        res.json({
          success: true,
          data: dataRes.rows.map((r) => ({
            ...r,
            total_amount: parseFloat(r.total_amount),
            paid_amount: parseFloat(r.paid_amount),
            items: r.items || [],
          })),
          pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── GET /api/v1/finance/payments/:id — Payment detail ───────────────────────────────────
  router.get(
    '/payments/:id',
    authorize('payment.update'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = parseInt(req.params.id ?? '', 10);
        if (isNaN(id)) throw new AppError('VALIDATION_ERROR', 'Invalid payment ID', 400);

        const sql = `
          SELECT p.*, s.nim, u.full_name, u.email, s.prodi_id, pr.name as prodi_name,
                 sem.code as semester_code, sem.name as semester_name,
                 json_agg(json_build_object(
                   'id', pi.id, 'type', pi.type, 'description', pi.description, 'amount', pi.amount, 'is_mandatory', pi.is_mandatory
                 )) FILTER (WHERE pi.id IS NOT NULL) as items
          FROM payments p
          JOIN students s ON s.id = p.student_id
          JOIN users u ON u.id = s.user_id
          JOIN prodis pr ON pr.id = s.prodi_id
          JOIN semesters sem ON sem.id = p.semester_id
          LEFT JOIN payment_items pi ON pi.payment_id = p.id
          WHERE p.id = $1
          GROUP BY p.id, s.nim, u.full_name, u.email, s.prodi_id, pr.name, sem.code, sem.name
        `;
        const result = await pgPool.query(sql, [id]);
        if (result.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Payment not found', 404);
        }

        const r = result.rows[0];
        res.json({
          success: true,
          data: {
            ...r,
            total_amount: parseFloat(r.total_amount),
            paid_amount: parseFloat(r.paid_amount),
            items: r.items || [],
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── POST /api/v1/finance/payments/:id/update — Update payment status (admin keuangan) ──
  router.post(
    '/payments/:id/update',
    authorize('payment.update'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const paymentId = parseInt(req.params.id ?? '', 10);
        if (isNaN(paymentId)) throw new AppError('VALIDATION_ERROR', 'Invalid payment ID', 400);

        const { paid_amount } = req.body;
        if (paid_amount === undefined || paid_amount === null) {
          throw new AppError('VALIDATION_ERROR', 'paid_amount is required', 400);
        }
        const paid = parseFloat(paid_amount);
        if (isNaN(paid) || paid < 0) {
          throw new AppError('VALIDATION_ERROR', 'paid_amount must be a non-negative number', 400);
        }

        const adminId = req.user!.id;

        // Call DB function
        await pgPool.query('SELECT update_payment_status($1, $2, $3)', [paymentId, paid, adminId]);

        // Fetch updated
        const sql = `
          SELECT p.*, s.nim, u.full_name, sem.code as semester_code
          FROM payments p
          JOIN students s ON s.id = p.student_id
          JOIN users u ON u.id = s.user_id
          JOIN semesters sem ON sem.id = p.semester_id
          WHERE p.id = $1
        `;
        const result = await pgPool.query(sql, [paymentId]);

        res.json({
          success: true,
          message: 'Payment status updated',
          data: {
            ...result.rows[0],
            total_amount: parseFloat(result.rows[0].total_amount),
            paid_amount: parseFloat(result.rows[0].paid_amount),
          },
        });
      } catch (err) {
        if (err instanceof AppError) return next(err);
        if (err instanceof Error && err.message.includes('Invalid paid amount')) {
          return next(new AppError('VALIDATION_ERROR', 'paid_amount exceeds total_amount', 400));
        }
        if (
          err instanceof Error &&
          err.message.includes('Payment') &&
          err.message.includes('not found')
        ) {
          return next(new AppError('NOT_FOUND', 'Payment not found', 404));
        }
        next(err);
      }
    },
  );

  // ── POST /api/v1/finance/generate — Trigger payment generation for semester (admin) ─────
  router.post(
    '/generate',
    authorize('payment.generate'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { semester_id } = req.body;
        if (!semester_id) throw new AppError('VALIDATION_ERROR', 'semester_id is required', 400);

        const semId = parseInt(semester_id, 10);
        if (isNaN(semId)) throw new AppError('VALIDATION_ERROR', 'Invalid semester_id', 400);

        await pgPool.query('SELECT generate_payments_for_semester($1)', [semId]);

        res.json({ success: true, message: 'Payments generated for semester' });
      } catch (err) {
        if (err instanceof AppError) return next(err);
        if (err instanceof Error && err.message.includes('not found')) {
          return next(new AppError('NOT_FOUND', 'Semester not found', 404));
        }
        next(err);
      }
    },
  );

  // ── GET /api/v1/finance/my-payment — Mahasiswa view own payment ────────────────────────
  router.get(
    '/my-payment',
    authorize('krs.fill'), // mahasiswa can view own payment
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = await requireStudent(req);

        const { semester_id } = req.query;
        let where = 'WHERE p.student_id = $1';
        const params: (string | number)[] = [studentId];
        let paramIdx = 2;

        if (semester_id) {
          where += ` AND p.semester_id = $${paramIdx++}`;
          params.push(parseInt(semester_id as string, 10));
        }

        const sql = `
          SELECT p.*, sem.code as semester_code, sem.name as semester_name, sem.krs_end_date,
                 json_agg(json_build_object(
                   'id', pi.id, 'type', pi.type, 'description', pi.description, 'amount', pi.amount, 'is_mandatory', pi.is_mandatory
                 )) FILTER (WHERE pi.id IS NOT NULL) as items
          FROM payments p
          JOIN semesters sem ON sem.id = p.semester_id
          LEFT JOIN payment_items pi ON pi.payment_id = p.id
          ${where}
          GROUP BY p.id, sem.code, sem.name, sem.krs_end_date
          ORDER BY sem.code DESC
        `;

        const result = await pgPool.query(sql, params);

        res.json({
          success: true,
          data: result.rows.map((r) => ({
            ...r,
            total_amount: parseFloat(r.total_amount),
            paid_amount: parseFloat(r.paid_amount),
            items: r.items || [],
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── GET /api/v1/finance/krs-access — Check if student can access KRS (for gate) ────────
  router.get(
    '/krs-access',
    authorize('krs.fill'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = await requireStudent(req);
        const { semester_id } = req.query;
        if (!semester_id) throw new AppError('VALIDATION_ERROR', 'semester_id is required', 400);

        const semId = parseInt(semester_id as string, 10);
        if (isNaN(semId)) throw new AppError('VALIDATION_ERROR', 'Invalid semester_id', 400);

        const result = await pgPool.query('SELECT can_access_krs($1, $2) as can_access', [
          studentId,
          semId,
        ]);
        const canAccess = result.rows[0].can_access;

        // Get payment status for context
        const paymentSql = `
          SELECT p.status, p.total_amount, p.paid_amount, p.due_date
          FROM payments p
          WHERE p.student_id = $1 AND p.semester_id = $2
        `;
        const paymentRes = await pgPool.query(paymentSql, [studentId, semId]);
        const payment = paymentRes.rows[0] || null;

        res.json({
          success: true,
          data: {
            can_access: canAccess,
            payment: payment
              ? {
                  status: payment.status,
                  total_amount: parseFloat(payment.total_amount),
                  paid_amount: parseFloat(payment.paid_amount),
                  due_date: payment.due_date,
                }
              : null,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
