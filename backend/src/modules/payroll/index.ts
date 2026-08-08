/**
 * Payroll Routes — T4.4 (F-26, K-05).
 * Admin keuangan: generate, approve, pay, list, detail.
 * Dosen: view own payroll.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { AppError } from '../../middleware/error-handler';
import { 
  generatePayroll, 
  getPayrollDetail, 
  listPayrolls, 
  approvePayroll, 
  payPayroll,
  batchGeneratePayroll,
  DEFAULT_PAYROLL_CONFIG,
  type PayrollConfig 
} from './payroll.service';

export function createPayrollRouter(): Router {
  const router = Router();
  
  // All routes require authentication
  router.use(authenticate);
  
  // ── POST /api/v1/payroll/generate — Batch generate untuk semua dosen (admin keuangan) ─────
  router.post(
    '/generate',
    authorize('payroll.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { period_start, period_end, config } = req.body;
        if (!period_start || !period_end) {
          throw new AppError('VALIDATION_ERROR', 'period_start dan period_end wajib diisi (YYYY-MM-DD)', 400);
        }
        
        // Merge config with defaults
        const payrollConfig: PayrollConfig = { ...DEFAULT_PAYROLL_CONFIG, ...config };
        
        const results = await batchGeneratePayroll(period_start, period_end, req.user!.id, payrollConfig);
        
        res.json({
          success: true,
          message: `Payroll generated untuk ${results.length} dosen`,
          data: results,
        });
      } catch (err) {
        next(err);
      }
    }
  );
  
  // ── POST /api/v1/payroll/generate/:lecturerId — Generate single dosen (admin keuangan) ────
  router.post(
    '/generate/:lecturerId',
    authorize('payroll.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const lecturerId = parseInt(req.params.lecturerId ?? '', 10);
        if (isNaN(lecturerId)) throw new AppError('VALIDATION_ERROR', 'Invalid lecturer ID', 400);
        
        const { period_start, period_end, config } = req.body;
        if (!period_start || !period_end) {
          throw new AppError('VALIDATION_ERROR', 'period_start dan period_end wajib diisi (YYYY-MM-DD)', 400);
        }
        
        const payrollConfig: PayrollConfig = { ...DEFAULT_PAYROLL_CONFIG, ...config };
        
        const payroll = await generatePayroll(lecturerId, period_start, period_end, req.user!.id, payrollConfig);
        
        res.json({
          success: true,
          message: 'Payroll generated',
          data: payroll,
        });
      } catch (err) {
        next(err);
      }
    }
  );
  
  // ── GET /api/v1/payroll — List payroll (admin keuangan/sistem) ───────────────────────────
  router.get(
    '/',
    authorize('payroll.view'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { lecturer_id, period_start, period_end, status, page = '1', limit = '20' } = req.query;
        
        const filters = {
          lecturerId: lecturer_id ? parseInt(lecturer_id as string, 10) : undefined,
          periodStart: period_start as string,
          periodEnd: period_end as string,
          status: status as string,
          page: parseInt(page as string, 10),
          limit: parseInt(limit as string, 10),
        };
        
        const result = await listPayrolls(filters);
        
        res.json({
          success: true,
          data: result.items,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );
  
  // ── GET /api/v1/payroll/my — Dosen lihat payroll sendiri ─────────────────────────────────
  router.get(
    '/my',
    authorize('payroll.view'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Find lecturer_id for current user
        const lecturerRes = await pgPool.query(
          `SELECT id FROM lecturers WHERE user_id = $1 AND is_active = true`,
          [req.user!.id]
        );
        if (lecturerRes.rows.length === 0) {
          throw new AppError('FORBIDDEN', 'Akun tidak terhubung ke data dosen aktif', 403);
        }
        const lecturerId = lecturerRes.rows[0].id;
        
        const { period_start, period_end, status, page = '1', limit = '20' } = req.query;
        
        const filters = {
          lecturerId,
          periodStart: period_start as string,
          periodEnd: period_end as string,
          status: status as string,
          page: parseInt(page as string, 10),
          limit: parseInt(limit as string, 10),
        };
        
        const result = await listPayrolls(filters);
        
        res.json({
          success: true,
          data: result.items,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );
  
  // ── GET /api/v1/payroll/:id — Detail payroll dengan breakdown ────────────────────────────
  router.get(
    '/:id',
    authorize('payroll.view'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = parseInt(req.params.id ?? '', 10);
        if (isNaN(id)) throw new AppError('VALIDATION_ERROR', 'Invalid payroll ID', 400);
        
        const payroll = await getPayrollDetail(id);
        if (!payroll) {
          throw new AppError('NOT_FOUND', 'Payroll not found', 404);
        }
        
        // Dosen hanya bisa lihat payroll sendiri
        if (req.user!.roleCode === 'dosen') {
          const lecturerRes = await pgPool.query(
            `SELECT id FROM lecturers WHERE user_id = $1`,
            [req.user!.id]
          );
          if (lecturerRes.rows.length === 0 || lecturerRes.rows[0].id !== payroll.lecturerId) {
            throw new AppError('FORBIDDEN', 'Tidak bisa akses payroll dosen lain', 403);
          }
        }
        
        res.json({ success: true, data: payroll });
      } catch (err) {
        next(err);
      }
    }
  );
  
  // ── POST /api/v1/payroll/:id/approve — Approve payroll (admin keuangan) ──────────────────
  router.post(
    '/:id/approve',
    authorize('payroll.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = parseInt(req.params.id ?? '', 10);
        if (isNaN(id)) throw new AppError('VALIDATION_ERROR', 'Invalid payroll ID', 400);
        
        const payroll = await approvePayroll(id, req.user!.id);
        
        res.json({
          success: true,
          message: 'Payroll approved',
          data: payroll,
        });
      } catch (err) {
        next(err);
      }
    }
  );
  
  // ── POST /api/v1/payroll/:id/pay — Mark payroll as paid (admin keuangan) ─────────────────
  router.post(
    '/:id/pay',
    authorize('payroll.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = parseInt(req.params.id ?? '', 10);
        if (isNaN(id)) throw new AppError('VALIDATION_ERROR', 'Invalid payroll ID', 400);
        
        const payroll = await payPayroll(id);
        
        res.json({
          success: true,
          message: 'Payroll marked as paid',
          data: payroll,
        });
      } catch (err) {
        next(err);
      }
    }
  );
  
  return router;
}