import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';

/**
 * Modul Akademik — T1.7 (F-07b, F-07c, F-22).
 * Struktur Organisasi (Fakultas, Prodi, Departemen) + Kurikulum + MK.
 * Tahun Akademik (Academic Years) — GET /academic-years untuk dropdown transkrip (keluhan lama #45).
 */

const facultySchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(3).max(100),
});

const prodiSchema = z.object({
  facultyId: z.number().int().positive(),
  code: z.string().min(2).max(10),
  name: z.string().min(3).max(100),
  degree: z.enum(['S1', 'S2', 'D3', 'D4']),
  accreditation: z.string().optional(),
});

const departemenSchema = z.object({
  prodiId: z.number().int().positive(),
  code: z.string().min(2).max(20),
  name: z.string().min(3).max(100),
});

const courseSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(3).max(150),
  credits: z.number().int().min(1).max(6),
  description: z.string().optional(),
});

const prodiQuerySchema = z.object({
  search: z.string().max(100).optional(),
  facultyId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const facultyQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createAcademicRouter(): Router {
  const router = Router();

  // --- FAKULTAS ---
  router.get(
    '/faculties',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = facultyQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }
        const { search, page, limit } = q.data;
        const where: string[] = ['is_active'];
        const params: unknown[] = [];

        if (search) {
          params.push(`%${search}%`);
          where.push(`(code ILIKE $${params.length} OR name ILIKE $${params.length})`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (page - 1) * limit;

        const countResult = await pgPool.query(
          `SELECT count(*)::int AS total FROM faculties ${whereSql}`,
          params,
        );

        const listResult = await pgPool.query(
          `SELECT * FROM faculties ${whereSql} ORDER BY code LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );

        res.json({
          success: true,
          data: {
            items: listResult.rows,
            pagination: {
              page,
              limit,
              total: countResult.rows[0].total,
            },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/faculties',
    authenticate,
    authorize('academic.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = facultySchema.parse(req.body);
        const result = await pgPool.query(
          'INSERT INTO faculties (code, name) VALUES ($1, $2) RETURNING *',
          [data.code, data.name],
        );
        // Audit trail (F-13, S-06, S-07)
        await auditFromRequest(req.user!, req, {
          tableName: 'faculties',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: { code: data.code, name: data.name },
        });
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- PRODI ---
  router.get('/prodis', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = prodiQuerySchema.safeParse(req.query);
      if (!q.success) {
        throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
      }
      const { search, facultyId, page, limit } = q.data;
      const where: string[] = ['p.is_active'];
      const params: unknown[] = [];

      if (search) {
        params.push(`%${search}%`);
        where.push(`(p.code ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
      }
      if (facultyId) {
        params.push(facultyId);
        where.push(`p.faculty_id = $${params.length}`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const offset = (page - 1) * limit;

      const countResult = await pgPool.query(
        `SELECT count(*)::int AS total FROM prodis p JOIN faculties f ON f.id = p.faculty_id ${whereSql}`,
        params,
      );

      const listResult = await pgPool.query(
        `SELECT p.*, f.name as faculty_name FROM prodis p JOIN faculties f ON f.id = p.faculty_id ${whereSql} ORDER BY p.code LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );

      res.json({
        success: true,
        data: {
          items: listResult.rows,
          pagination: {
            page,
            limit,
            total: countResult.rows[0].total,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/prodis',
    authenticate,
    authorize('academic.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = prodiSchema.parse(req.body);
        const result = await pgPool.query(
          'INSERT INTO prodis (faculty_id, code, name, degree, accreditation) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [data.facultyId, data.code, data.name, data.degree, data.accreditation ?? null],
        );
        // Audit trail (F-13, S-06, S-07)
        await auditFromRequest(req.user!, req, {
          tableName: 'prodis',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: {
            facultyId: data.facultyId,
            code: data.code,
            name: data.name,
            degree: data.degree,
          },
        });
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- DEPARTEMEN ---
  router.get(
    '/departemens',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query(`
        SELECT d.*, p.name as prodi_name 
        FROM departemens d 
        JOIN prodis p ON p.id = d.prodi_id 
        WHERE d.is_active ORDER BY d.code
      `);
        res.json({ success: true, data: { items: result.rows } });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/departemens',
    authenticate,
    authorize('academic.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = departemenSchema.parse(req.body);
        const result = await pgPool.query(
          'INSERT INTO departemens (prodi_id, code, name) VALUES ($1, $2, $3) RETURNING *',
          [data.prodiId, data.code, data.name],
        );
        // Audit trail (F-13, S-06, S-07)
        await auditFromRequest(req.user!, req, {
          tableName: 'departemens',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: { prodiId: data.prodiId, code: data.code, name: data.name },
        });
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- CLASSES BY CURRICULUM ---
  router.get('/classes', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { curriculum_id } = req.query;
      if (!curriculum_id) {
        return res.status(400).json({ success: false, error: 'curriculum_id required' });
      }
      const curId = Number(curriculum_id);
      const result = await pgPool.query(
        `SELECT cl.*, cur.semester_id, co.code as course_code, co.name as course_name
           FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           JOIN courses co ON co.id = cur.course_id
           WHERE cl.curriculum_id = $1 AND cl.is_active
           ORDER BY cl.class_code`,
        [curId],
      );
      res.json({ success: true, data: { items: result.rows } });
    } catch (err) {
      next(err);
    }
  });

  // --- MATA KULIAH (COURSES) ---
  router.get('/courses', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, facultyId } = req.query;
      let query = `
        SELECT DISTINCT c.id, c.code, c.name, c.credits, c.description, c.is_active,
               c.created_at, c.updated_at,
               p.id AS prodi_id, p.name AS prodi_name, p.code AS prodi_code,
               f.id AS faculty_id, f.name AS faculty_name, f.code AS faculty_code
        FROM courses c
        LEFT JOIN curricula cur ON cur.course_id = c.id
        LEFT JOIN prodis p ON p.id = cur.prodi_id
        LEFT JOIN faculties f ON f.id = p.faculty_id
        WHERE c.is_active = true
      `;
      const params: (string | number)[] = [];

      if (facultyId) {
        params.push(Number(facultyId));
        query += ` AND f.id = $${params.length}`;
      }

      if (search && typeof search === 'string') {
        params.push(`%${search}%`);
        query += ` AND (c.code ILIKE $${params.length} OR c.name ILIKE $${params.length})`;
      }

      query += ' ORDER BY p.name, c.code';

      const result = await pgPool.query(query, params);
      res.json({ success: true, data: { items: result.rows } });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/courses',
    authenticate,
    authorize('course.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = courseSchema.parse(req.body);
        const result = await pgPool.query(
          'INSERT INTO courses (code, name, credits, description) VALUES ($1, $2, $3, $4) RETURNING *',
          [data.code, data.name, data.credits, data.description ?? null],
        );
        // Audit trail (F-13, S-06, S-07)
        await auditFromRequest(req.user!, req, {
          tableName: 'courses',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: { code: data.code, name: data.name, credits: data.credits },
        });
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- KURIKULUM (CURRICULA) ---
  router.get(
    '/curricula',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { prodiId, semesterId } = req.query;
        let query = `
        SELECT cur.*, c.code as course_code, c.name as course_name, c.credits, p.name as prodi_name
        FROM curricula cur
        JOIN courses c ON c.id = cur.course_id
        JOIN prodis p ON p.id = cur.prodi_id
        WHERE 1=1
      `;
        const params: (number | string)[] = [];
        if (prodiId) {
          params.push(Number(prodiId));
          query += ` AND cur.prodi_id = $${params.length}`;
        }
        if (semesterId) {
          params.push(Number(semesterId));
          query += ` AND cur.semester_id = $${params.length}`;
        }
        query += ' ORDER BY cur.semester_number, c.code';

        const result = await pgPool.query(query, params);
        res.json({ success: true, data: { items: result.rows } });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- TAHUN AKADEMIK (ACADEMIC YEARS) ---
  router.get(
    '/academic-years',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query(
          'SELECT id, code FROM academic_years WHERE is_active ORDER BY id',
        );
        res.json({ success: true, data: { items: result.rows } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
