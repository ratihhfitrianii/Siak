import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';

/**
 * Modul Admin Master Data — keluhan lama #16.
 * Admin sistem dapat melihat Master Mahasiswa & Master Dosen, input dari sistem
 * (form manual) maupun dari CSV (endpoint import terpisah: POST /import/*).
 *
 * - GET  /admin-master/students  — list mahasiswa (NIM, nama, prodi, angkatan, email, status)
 * - GET  /admin-master/lecturers — list dosen (NIDN, nama, prodi, email, status)
 * - POST /admin-master/students  — buat mahasiswa manual (NIM + data profil)
 * - POST /admin-master/lecturers — buat dosen manual (NIDN + data profil)
 *
 * RBAC: user.manage (hanya Admin Sistem).
 * Password default = NIM/NIDN (keputusan login: mahasiswa NIM, dosen NIK/NIDN),
 * flag must_change_password=true (spec §6.3).
 * Audit trail action=INSERT untuk setiap pembuatan.
 */

const BCRYPT_ROUNDS = 10;

const studentCreateSchema = z.object({
  nim: z.string().min(3).max(20),
  fullName: z.string().min(2).max(150),
  prodiCode: z.string().min(1).max(10),
  angkatan: z.string().min(1).max(9),
  email: z.string().email().max(255).optional(),
});

const lecturerCreateSchema = z.object({
  nidn: z.string().min(3).max(20),
  fullName: z.string().min(2).max(150),
  prodiCode: z.string().min(1).max(10),
  email: z.string().email().max(255).optional(),
});

const listQuerySchema = z.object({
  search: z.string().max(100).optional(),
  prodi: z.string().max(10).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createAdminMasterRouter(): Router {
  const router = Router();

  // GET /admin-master/students — list master mahasiswa (pagination + filter)
  router.get(
    '/students',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = listQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }
        const { search, prodi, page, limit } = q.data;
        const where: string[] = ['u.is_active'];
        const params: unknown[] = [];

        if (search) {
          params.push(`%${search}%`);
          where.push(`(s.nim ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
        }
        if (prodi) {
          params.push(prodi);
          where.push(`p.code = $${params.length}`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (page - 1) * limit;

        const countResult = await pgPool.query(
          `SELECT count(*)::int AS total
           FROM students s
           JOIN users u ON u.id = s.user_id
           JOIN prodis p ON p.id = s.prodi_id
           JOIN academic_years ay ON ay.id = s.academic_year_id
           ${whereSql}`,
          params,
        );

        const listResult = await pgPool.query(
          `SELECT s.id, s.nim, u.full_name AS "fullName", u.email, u.is_active AS "userActive",
                  p.code AS "prodiCode", p.name AS "prodiName",
                  ay.code AS angkatan, s.status
           FROM students s
           JOIN users u ON u.id = s.user_id
           JOIN prodis p ON p.id = s.prodi_id
           JOIN academic_years ay ON ay.id = s.academic_year_id
           ${whereSql}
           ORDER BY s.nim
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );

        res.json({
          success: true,
          data: {
            items: listResult.rows.map((r) => ({ ...r, id: Number(r.id) })),
            pagination: { page, limit, total: countResult.rows[0].total },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /admin-master/lecturers — list master dosen (pagination + filter)
  router.get(
    '/lecturers',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = listQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }
        const { search, prodi, page, limit } = q.data;
        const where: string[] = ['u.is_active'];
        const params: unknown[] = [];

        if (search) {
          params.push(`%${search}%`);
          where.push(`(l.nidn ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
        }
        if (prodi) {
          params.push(prodi);
          where.push(`p.code = $${params.length}`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (page - 1) * limit;

        const countResult = await pgPool.query(
          `SELECT count(*)::int AS total
           FROM lecturers l
           JOIN users u ON u.id = l.user_id
           JOIN prodis p ON p.id = l.prodi_id
           ${whereSql}`,
          params,
        );

        const listResult = await pgPool.query(
          `SELECT l.id, l.nidn, u.full_name AS "fullName", u.email, u.is_active AS "userActive", u.is_wali AS "isWali",
                  p.code AS "prodiCode", p.name AS "prodiName", l.employment_type
           FROM lecturers l
           JOIN users u ON u.id = l.user_id
           JOIN prodis p ON p.id = l.prodi_id
           ${whereSql}
           ORDER BY l.nidn
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );

        res.json({
          success: true,
          data: {
            items: listResult.rows.map((r) => ({ ...r, id: Number(r.id) })),
            pagination: { page, limit, total: countResult.rows[0].total },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /admin-master/students — buat mahasiswa manual (password default = NIM)
  router.post(
    '/students',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = studentCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data mahasiswa tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { nim, fullName, prodiCode, angkatan, email } = parsed.data;

        const prodi = await pgPool.query('SELECT id FROM prodis WHERE code = $1 AND is_active', [
          prodiCode,
        ]);
        if (prodi.rowCount === 0) {
          throw new AppError('VALIDATION_ERROR', `Prodi "${prodiCode}" tidak ditemukan`, 400);
        }
        const ay = await pgPool.query(
          'SELECT id FROM academic_years WHERE code = $1 AND is_active',
          [angkatan],
        );
        if (ay.rowCount === 0) {
          throw new AppError('VALIDATION_ERROR', `Angkatan "${angkatan}" tidak ditemukan`, 400);
        }
        const dupNim = await pgPool.query('SELECT id FROM students WHERE nim = $1', [nim]);
        if ((dupNim.rowCount ?? 0) > 0) {
          throw new AppError('VALIDATION_ERROR', `NIM ${nim} sudah terdaftar`, 409);
        }
        const mail = (email ?? `${nim}@student.siak.local`).toLowerCase();
        const dupMail = await pgPool.query('SELECT id FROM users WHERE email = $1', [mail]);
        if ((dupMail.rowCount ?? 0) > 0) {
          throw new AppError('VALIDATION_ERROR', `Email ${mail} sudah digunakan`, 409);
        }

        const passwordHash = await bcrypt.hash(nim, BCRYPT_ROUNDS);
        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          const user = await client.query(
            `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
             VALUES ($1, $2, $3, (SELECT id FROM roles WHERE code = 'mahasiswa'), true, true)
             RETURNING id`,
            [mail, passwordHash, fullName],
          );
          const student = await client.query(
            `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
             VALUES ($1, $2, $3, $4, 'Manual', true, 'aktif')
             RETURNING id`,
            [user.rows[0].id, nim, prodi.rows[0].id, ay.rows[0].id],
          );
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'students',
              recordId: Number(student.rows[0].id),
              action: 'INSERT',
              newValues: { nim, fullName, prodiCode, angkatan, email: mail },
            },
            client,
          );
          await client.query('COMMIT');
          res.status(201).json({
            success: true,
            data: {
              id: Number(student.rows[0].id),
              nim,
              fullName,
              message: 'Mahasiswa berhasil dibuat',
            },
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /admin-master/lecturers — buat dosen manual (password default = NIDN)
  router.post(
    '/lecturers',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = lecturerCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data dosen tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { nidn, fullName, prodiCode, email } = parsed.data;

        const prodi = await pgPool.query('SELECT id FROM prodis WHERE code = $1 AND is_active', [
          prodiCode,
        ]);
        if (prodi.rowCount === 0) {
          throw new AppError('VALIDATION_ERROR', `Prodi "${prodiCode}" tidak ditemukan`, 400);
        }
        const dupNidn = await pgPool.query('SELECT id FROM lecturers WHERE nidn = $1', [nidn]);
        if ((dupNidn.rowCount ?? 0) > 0) {
          throw new AppError('VALIDATION_ERROR', `NIDN ${nidn} sudah terdaftar`, 409);
        }
        const mail = (email ?? `${nidn}@siak.local`).toLowerCase();
        const dupMail = await pgPool.query('SELECT id FROM users WHERE email = $1', [mail]);
        if ((dupMail.rowCount ?? 0) > 0) {
          throw new AppError('VALIDATION_ERROR', `Email ${mail} sudah digunakan`, 409);
        }

        const passwordHash = await bcrypt.hash(nidn, BCRYPT_ROUNDS);
        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          const user = await client.query(
            `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
             VALUES ($1, $2, $3, (SELECT id FROM roles WHERE code = 'dosen'), true, true)
             RETURNING id`,
            [mail, passwordHash, fullName],
          );
          const lecturer = await client.query(
            `INSERT INTO lecturers (user_id, nidn, prodi_id, employment_type, is_active)
             VALUES ($1, $2, $3, 'tetap', true)
             RETURNING id`,
            [user.rows[0].id, nidn, prodi.rows[0].id],
          );
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'lecturers',
              recordId: Number(lecturer.rows[0].id),
              action: 'INSERT',
              newValues: { nidn, fullName, prodiCode, email: mail },
            },
            client,
          );
          await client.query('COMMIT');
          res.status(201).json({
            success: true,
            data: {
              id: Number(lecturer.rows[0].id),
              nidn,
              fullName,
              message: 'Dosen berhasil dibuat',
            },
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
