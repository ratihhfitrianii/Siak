import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { pgPool } from '../../lib/db';
// import { AppError } from '../../lib/errors';
import { z } from 'zod';

export const createExamRouter = () => {
  const router = Router();

  // --- ADMIN SISTEM: Exam Periods ---

  router.get(
    '/periods',
    authenticate,
    authorize('exam.period.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query('SELECT * FROM exam_periods ORDER BY start_date DESC');
        res.json({ success: true, data: result.rows });
      } catch (err) {
        next(err);
      }
    },
  );

  const periodSchema = z.object({
    name: z.string().min(3),
    semester_id: z.string().min(5),
    start_date: z.string(),
    end_date: z.string(),
    is_active: z.boolean().optional(),
    can_input_questions: z.boolean().optional(),
  });

  router.post(
    '/periods',
    authenticate,
    authorize('exam.period.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = periodSchema.parse(req.body);
        const result = await pgPool.query(
          `INSERT INTO exam_periods (name, semester_id, start_date, end_date, is_active, can_input_questions)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            parsed.name,
            parsed.semester_id,
            parsed.start_date,
            parsed.end_date,
            parsed.is_active ?? true,
            parsed.can_input_questions ?? true,
          ],
        );
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
