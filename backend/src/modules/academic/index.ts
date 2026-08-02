import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';

/**
 * Modul Akademik — T1.7 (F-07b, F-07c, F-22).
 * Struktur Organisasi (Fakultas, Prodi, Departemen) + Kurikulum + MK.
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

export function createAcademicRouter(): Router {
  const router = Router();

  // --- FAKULTAS ---
  router.get(
    '/faculties',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query('SELECT * FROM faculties WHERE is_active ORDER BY code');
        res.json({ success: true, data: { items: result.rows } });
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
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- PRODI ---
  router.get('/prodis', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pgPool.query(`
        SELECT p.*, f.name as faculty_name 
        FROM prodis p 
        JOIN faculties f ON f.id = p.faculty_id 
        WHERE p.is_active ORDER BY p.code
      `);
      res.json({ success: true, data: { items: result.rows } });
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
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- MATA KULIAH (COURSES) ---
  router.get('/courses', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pgPool.query('SELECT * FROM courses WHERE is_active ORDER BY code');
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

  return router;
}
