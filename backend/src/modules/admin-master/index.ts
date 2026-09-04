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

const facultyQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const prodiQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Schema update mata kuliah (nama/deskripsi/kredit opsional). */
const courseUpdateSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  credits: z.number().int().min(1).max(6).optional(),
  description: z.string().max(2000).nullable().optional(),
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

  // PUT /admin-master/students/:id — update mahasiswa (fullName, prodi, angkatan, email, status)
  router.put(
    '/students/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID mahasiswa tidak valid', 400);
        }
        const parsed = studentCreateSchema.omit({ nim: true }).partial().safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data mahasiswa tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { fullName, prodiCode, angkatan, email } = parsed.data;

        if (
          fullName === undefined &&
          prodiCode === undefined &&
          angkatan === undefined &&
          email === undefined
        ) {
          throw new AppError('VALIDATION_ERROR', 'Tidak ada field yang diupdate', 400);
        }

        const exists = await pgPool.query(
          `SELECT s.id, s.user_id, s.nim, u.email AS current_email
           FROM students s JOIN users u ON u.id = s.user_id
           WHERE s.id = $1`,
          [id],
        );
        if (exists.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Mahasiswa tidak ditemukan', 404);
        }
        const student = exists.rows[0];

        let prodiId: number | undefined;
        if (prodiCode !== undefined) {
          const prodi = await pgPool.query('SELECT id FROM prodis WHERE code = $1 AND is_active', [
            prodiCode,
          ]);
          if (prodi.rowCount === 0) {
            throw new AppError('VALIDATION_ERROR', `Prodi "${prodiCode}" tidak ditemukan`, 400);
          }
          prodiId = Number(prodi.rows[0].id);
        }

        let ayId: number | undefined;
        if (angkatan !== undefined) {
          const ay = await pgPool.query(
            'SELECT id FROM academic_years WHERE code = $1 AND is_active',
            [angkatan],
          );
          if (ay.rowCount === 0) {
            throw new AppError('VALIDATION_ERROR', `Angkatan "${angkatan}" tidak ditemukan`, 400);
          }
          ayId = Number(ay.rows[0].id);
        }

        const mail = email !== undefined ? email.toLowerCase() : undefined;
        if (mail !== undefined && mail !== student.current_email) {
          const dupMail = await pgPool.query('SELECT id FROM users WHERE email = $1', [mail]);
          if ((dupMail.rowCount ?? 0) > 0) {
            throw new AppError('VALIDATION_ERROR', `Email ${mail} sudah digunakan`, 409);
          }
        }

        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          if (fullName !== undefined || mail !== undefined) {
            const uUpdates: string[] = [];
            const uParams: unknown[] = [student.user_id];
            if (fullName !== undefined) {
              uParams.push(fullName);
              uUpdates.push(`full_name = $${uParams.length}`);
            }
            if (mail !== undefined) {
              uParams.push(mail);
              uUpdates.push(`email = $${uParams.length}`);
            }
            uUpdates.push('updated_at = now()');
            await client.query(`UPDATE users SET ${uUpdates.join(', ')} WHERE id = $1`, uParams);
          }
          const sUpdates: string[] = [];
          const sParams: unknown[] = [id];
          if (prodiId !== undefined) {
            sParams.push(prodiId);
            sUpdates.push(`prodi_id = $${sParams.length}`);
          }
          if (ayId !== undefined) {
            sParams.push(ayId);
            sUpdates.push(`academic_year_id = $${sParams.length}`);
          }
          if (sUpdates.length > 0) {
            sUpdates.push('updated_at = now()');
            await client.query(`UPDATE students SET ${sUpdates.join(', ')} WHERE id = $1`, sParams);
          }
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'students',
              recordId: id,
              action: 'UPDATE',
              newValues: { fullName, prodiCode, angkatan, email: mail },
            },
            client,
          );
          await client.query('COMMIT');
          res.json({
            success: true,
            data: {
              id,
              nim: student.nim,
              fullName: fullName ?? student.full_name,
              message: 'Mahasiswa berhasil diupdate',
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

  // PUT /admin-master/lecturers/:id — update dosen (fullName, prodi, email, status)
  router.put(
    '/lecturers/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID dosen tidak valid', 400);
        }
        const parsed = lecturerCreateSchema.omit({ nidn: true }).partial().safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data dosen tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { fullName, prodiCode, email } = parsed.data;

        if (fullName === undefined && prodiCode === undefined && email === undefined) {
          throw new AppError('VALIDATION_ERROR', 'Tidak ada field yang diupdate', 400);
        }

        const exists = await pgPool.query(
          `SELECT l.id, l.user_id, l.nidn, u.email AS current_email
           FROM lecturers l JOIN users u ON u.id = l.user_id
           WHERE l.id = $1`,
          [id],
        );
        if (exists.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Dosen tidak ditemukan', 404);
        }
        const lecturer = exists.rows[0];

        let prodiId: number | undefined;
        if (prodiCode !== undefined) {
          const prodi = await pgPool.query('SELECT id FROM prodis WHERE code = $1 AND is_active', [
            prodiCode,
          ]);
          if (prodi.rowCount === 0) {
            throw new AppError('VALIDATION_ERROR', `Prodi "${prodiCode}" tidak ditemukan`, 400);
          }
          prodiId = Number(prodi.rows[0].id);
        }

        const mail = email !== undefined ? email.toLowerCase() : undefined;
        if (mail !== undefined && mail !== lecturer.current_email) {
          const dupMail = await pgPool.query('SELECT id FROM users WHERE email = $1', [mail]);
          if ((dupMail.rowCount ?? 0) > 0) {
            throw new AppError('VALIDATION_ERROR', `Email ${mail} sudah digunakan`, 409);
          }
        }

        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          if (fullName !== undefined || mail !== undefined) {
            const uUpdates: string[] = [];
            const uParams: unknown[] = [lecturer.user_id];
            if (fullName !== undefined) {
              uParams.push(fullName);
              uUpdates.push(`full_name = $${uParams.length}`);
            }
            if (mail !== undefined) {
              uParams.push(mail);
              uUpdates.push(`email = $${uParams.length}`);
            }
            uUpdates.push('updated_at = now()');
            await client.query(`UPDATE users SET ${uUpdates.join(', ')} WHERE id = $1`, uParams);
          }
          if (prodiId !== undefined) {
            await client.query(
              'UPDATE lecturers SET prodi_id = $1, updated_at = now() WHERE id = $2',
              [prodiId, id],
            );
          }
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'lecturers',
              recordId: id,
              action: 'UPDATE',
              newValues: { fullName, prodiCode, email: mail },
            },
            client,
          );
          await client.query('COMMIT');
          res.json({
            success: true,
            data: {
              id,
              nidn: lecturer.nidn,
              fullName: fullName ?? lecturer.full_name,
              message: 'Dosen berhasil diupdate',
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

  // ===== FAKULTAS (FACULTIES) =====
  const facultySchema = z.object({
    code: z.string().min(1).max(10),
    name: z.string().min(2).max(100),
    isActive: z.boolean().default(true),
  });

  // GET /admin-master/faculties — list fakultas (pagination + search)
  router.get(
    '/faculties',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = facultyQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }
        const { search, page, limit } = q.data;
        const where: string[] = [];
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
          `SELECT id, code, name, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt" FROM faculties ${whereSql} ORDER BY code LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
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

  // POST /admin-master/faculties — buat fakultas
  router.post(
    '/faculties',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = facultySchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data fakultas tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { code, name, isActive } = parsed.data;

        const dup = await pgPool.query('SELECT id FROM faculties WHERE code = $1', [code]);
        if ((dup.rowCount ?? 0) > 0) {
          throw new AppError('VALIDATION_ERROR', `Kode fakultas "${code}" sudah terdaftar`, 409);
        }

        const result = await pgPool.query(
          'INSERT INTO faculties (code, name, is_active) VALUES ($1, $2, $3) RETURNING id, code, name, is_active, created_at, updated_at',
          [code, name, isActive],
        );
        res.status(201).json({
          success: true,
          data: { ...result.rows[0], id: Number(result.rows[0].id) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /admin-master/faculties/:id — update fakultas
  router.put(
    '/faculties/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID fakultas tidak valid', 400);
        }
        const parsed = facultySchema.partial().safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data fakultas tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { code, name, isActive } = parsed.data;

        // cek apakah ada
        const exists = await pgPool.query('SELECT id FROM faculties WHERE id = $1', [id]);
        if (exists.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Fakultas tidak ditemukan', 404);
        }

        // cek unique code jika diubah
        if (code) {
          const dup = await pgPool.query('SELECT id FROM faculties WHERE code = $1 AND id != $2', [
            code,
            id,
          ]);
          if ((dup.rowCount ?? 0) > 0) {
            throw new AppError('VALIDATION_ERROR', `Kode fakultas "${code}" sudah terdaftar`, 409);
          }
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        if (code !== undefined) {
          params.push(code);
          updates.push(`code = $${params.length}`);
        }
        if (name !== undefined) {
          params.push(name);
          updates.push(`name = $${params.length}`);
        }
        if (isActive !== undefined) {
          params.push(isActive);
          updates.push(`is_active = $${params.length}`);
        }
        if (updates.length === 0) {
          throw new AppError('VALIDATION_ERROR', 'Tidak ada field yang diupdate', 400);
        }
        updates.push('updated_at = now()');

        const result = await pgPool.query(
          `UPDATE faculties SET ${updates.join(', ')} WHERE id = $1 RETURNING id, code, name, is_active, created_at, updated_at`,
          params,
        );
        res.json({
          success: true,
          data: { ...result.rows[0], id: Number(result.rows[0].id) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /admin-master/faculties/:id — hapus fakultas (soft delete: is_active=false)
  router.delete(
    '/faculties/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID fakultas tidak valid', 400);
        }

        // cek referensi prodi
        const ref = await pgPool.query(
          'SELECT id FROM prodis WHERE faculty_id = $1 AND is_active',
          [id],
        );
        if ((ref.rowCount ?? 0) > 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Fakultas masih memiliki prodi aktif. Nonaktifkan prodi terlebih dahulu.',
            409,
          );
        }

        await pgPool.query(
          'UPDATE faculties SET is_active = false, updated_at = now() WHERE id = $1',
          [id],
        );
        res.json({ success: true, data: { message: 'Fakultas dinonaktifkan' } });
      } catch (err) {
        next(err);
      }
    },
  );

  // ===== PRODI (PROGRAM STUDI) =====
  const prodiSchema = z.object({
    code: z.string().min(1).max(10),
    name: z.string().min(2).max(100),
    facultyCode: z.string().min(1).max(10),
    degree: z.enum(['S1', 'S2', 'S3', 'D3', 'D4']),
    accreditation: z.string().max(20).optional(),
    isActive: z.boolean().default(true),
  });

  // GET /admin-master/prodis — list prodi (pagination + search)
  router.get(
    '/prodis',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = prodiQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }
        const { search, page, limit } = q.data;
        const where: string[] = [];
        const params: unknown[] = [];

        if (search) {
          params.push(`%${search}%`);
          where.push(`(p.code ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (page - 1) * limit;

        const countResult = await pgPool.query(
          `SELECT count(*)::int AS total FROM prodis p JOIN faculties f ON f.id = p.faculty_id ${whereSql}`,
          params,
        );
        const listResult = await pgPool.query(
          `SELECT p.id, p.code, p.name, p.faculty_id, f.code AS "facultyCode", f.name AS "facultyName",
                  p.degree, p.accreditation, p.is_active AS "isActive", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
           FROM prodis p
           JOIN faculties f ON f.id = p.faculty_id
           ${whereSql}
           ORDER BY f.code, p.code
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        res.json({
          success: true,
          data: {
            items: listResult.rows.map((r) => ({
              ...r,
              id: Number(r.id),
              facultyId: Number(r.faculty_id),
            })),
            pagination: { page, limit, total: countResult.rows[0].total },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /admin-master/prodis — buat prodi
  router.post(
    '/prodis',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = prodiSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data prodi tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { code, name, facultyCode, degree, accreditation, isActive } = parsed.data;

        // resolve faculty
        const fac = await pgPool.query('SELECT id FROM faculties WHERE code = $1 AND is_active', [
          facultyCode,
        ]);
        if (fac.rowCount === 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Fakultas "${facultyCode}" tidak ditemukan atau nonaktif`,
            400,
          );
        }
        const facultyId = fac.rows[0].id;

        const dup = await pgPool.query('SELECT id FROM prodis WHERE code = $1', [code]);
        if ((dup.rowCount ?? 0) > 0) {
          throw new AppError('VALIDATION_ERROR', `Kode prodi "${code}" sudah terdaftar`, 409);
        }

        const result = await pgPool.query(
          `INSERT INTO prodis (code, name, faculty_id, degree, accreditation, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, code, name, faculty_id, degree, accreditation, is_active, created_at, updated_at`,
          [code, name, facultyId, degree, accreditation ?? null, isActive],
        );
        res.status(201).json({
          success: true,
          data: {
            ...result.rows[0],
            id: Number(result.rows[0].id),
            facultyId: Number(result.rows[0].faculty_id),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /admin-master/prodis/:id — update prodi
  router.put(
    '/prodis/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID prodi tidak valid', 400);
        }
        const parsed = prodiSchema.partial().safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data prodi tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { code, name, facultyCode, degree, accreditation, isActive } = parsed.data;

        const exists = await pgPool.query('SELECT id FROM prodis WHERE id = $1', [id]);
        if (exists.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Prodi tidak ditemukan', 404);
        }

        let facultyId: number | undefined;
        if (facultyCode !== undefined) {
          const fac = await pgPool.query('SELECT id FROM faculties WHERE code = $1 AND is_active', [
            facultyCode,
          ]);
          if (fac.rowCount === 0) {
            throw new AppError(
              'VALIDATION_ERROR',
              `Fakultas "${facultyCode}" tidak ditemukan atau nonaktif`,
              400,
            );
          }
          facultyId = fac.rows[0].id;
        }

        if (code !== undefined) {
          const dup = await pgPool.query('SELECT id FROM prodis WHERE code = $1 AND id != $2', [
            code,
            id,
          ]);
          if ((dup.rowCount ?? 0) > 0) {
            throw new AppError('VALIDATION_ERROR', `Kode prodi "${code}" sudah terdaftar`, 409);
          }
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        if (code !== undefined) {
          params.push(code);
          updates.push(`code = $${params.length}`);
        }
        if (name !== undefined) {
          params.push(name);
          updates.push(`name = $${params.length}`);
        }
        if (facultyId !== undefined) {
          params.push(facultyId);
          updates.push(`faculty_id = $${params.length}`);
        }
        if (degree !== undefined) {
          params.push(degree);
          updates.push(`degree = $${params.length}`);
        }
        if (accreditation !== undefined) {
          params.push(accreditation);
          updates.push(`accreditation = $${params.length}`);
        }
        if (isActive !== undefined) {
          params.push(isActive);
          updates.push(`is_active = $${params.length}`);
        }
        if (updates.length === 0) {
          throw new AppError('VALIDATION_ERROR', 'Tidak ada field yang diupdate', 400);
        }
        updates.push('updated_at = now()');

        const result = await pgPool.query(
          `UPDATE prodis SET ${updates.join(', ')} WHERE id = $1 RETURNING id, code, name, faculty_id, degree, accreditation, is_active, created_at, updated_at`,
          params,
        );
        res.json({
          success: true,
          data: {
            ...result.rows[0],
            id: Number(result.rows[0].id),
            facultyId: Number(result.rows[0].faculty_id),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /admin-master/prodis/:id — hapus prodi (soft delete)
  router.delete(
    '/prodis/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID prodi tidak valid', 400);
        }

        // cek referensi students/lecturers
        const refS = await pgPool.query(
          'SELECT id FROM students WHERE prodi_id = $1 AND is_active',
          [id],
        );
        const refL = await pgPool.query(
          'SELECT id FROM lecturers WHERE prodi_id = $1 AND is_active',
          [id],
        );
        if ((refS.rowCount ?? 0) > 0 || (refL.rowCount ?? 0) > 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Prodi masih memiliki mahasiswa/dosen aktif. Nonaktifkan data terkait terlebih dahulu.',
            409,
          );
        }

        await pgPool.query(
          'UPDATE prodis SET is_active = false, updated_at = now() WHERE id = $1',
          [id],
        );
        res.json({ success: true, data: { message: 'Prodi dinonaktifkan' } });
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── RUANGAN (ROOMS) ────────────────────────────────────────────────────────
  const roomCreateSchema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(100),
    capacity: z.number().int().min(0),
    facultyCode: z.string().min(1).max(10),
    isActive: z.boolean().default(true),
  });
  const roomUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    capacity: z.number().int().min(0).optional(),
    facultyCode: z.string().min(1).max(10).optional(),
    isActive: z.boolean().optional(),
  });

  const roomSelect = `SELECT r.id, r.code, r.name, r.capacity, r.faculty_code AS "facultyCode",
    f.id AS "facultyId", f.name AS "facultyName",
    r.is_active AS "isActive",
    r.created_at AS "createdAt", r.updated_at AS "updatedAt"
  FROM rooms r LEFT JOIN faculties f ON f.code = r.faculty_code`;

  // GET /admin-master/rooms — list rooms (filter facultyCode)
  router.get(
    '/rooms',
    authenticate,
    authorize('course.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { facultyCode, facultyId } = req.query;
        let query = roomSelect + ' WHERE 1=1';
        const params: unknown[] = [];
        if (facultyCode) {
          params.push(String(facultyCode));
          query += ` AND r.faculty_code = $${params.length}`;
        } else if (facultyId) {
          params.push(Number(facultyId));
          query += ` AND f.id = $${params.length}`;
        }
        query += ' ORDER BY r.code';
        const result = await pgPool.query(query, params);
        res.json({
          success: true,
          data: {
            items: result.rows,
            pagination: { page: 1, limit: 100, total: result.rowCount ?? 0 },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /admin-master/rooms — buat ruangan baru
  router.post(
    '/rooms',
    authenticate,
    authorize('course.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = roomCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data ruangan tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const data = parsed.data;
        const result = await pgPool.query(
          `INSERT INTO rooms (code, name, capacity, faculty_code, is_active)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [data.code, data.name, data.capacity, data.facultyCode, data.isActive],
        );
        const room = result.rows[0];
        const fRes = await pgPool.query('SELECT id, name FROM faculties WHERE code = $1', [
          data.facultyCode,
        ]);
        await auditFromRequest(req.user!, req, {
          tableName: 'rooms',
          recordId: Number(room.id),
          action: 'INSERT',
          newValues: { code: data.code, name: data.name, capacity: data.capacity },
        });
        res.status(201).json({
          success: true,
          data: {
            id: Number(room.id),
            code: room.code,
            name: room.name,
            capacity: room.capacity,
            facultyCode: room.faculty_code,
            facultyId: fRes.rows[0]?.id ?? null,
            facultyName: fRes.rows[0]?.name ?? null,
            isActive: room.is_active,
            createdAt: room.created_at,
            updatedAt: room.updated_at,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /admin-master/rooms/:id — update ruangan
  router.put(
    '/rooms/:id',
    authenticate,
    authorize('course.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        const parsed = roomUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data ruangan tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const data = parsed.data;
        const result = await pgPool.query(
          `UPDATE rooms SET
            name = COALESCE($1, name), capacity = COALESCE($2, capacity),
            faculty_code = COALESCE($3, faculty_code), is_active = COALESCE($4, is_active),
            updated_at = now()
           WHERE id = $5 RETURNING *`,
          [
            data.name ?? null,
            data.capacity ?? null,
            data.facultyCode ?? null,
            data.isActive ?? null,
            id,
          ],
        );
        if (result.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Ruangan tidak ditemukan', 404);
        }
        const room = result.rows[0];
        const fRes = await pgPool.query('SELECT id, name FROM faculties WHERE code = $1', [
          room.faculty_code,
        ]);
        await auditFromRequest(req.user!, req, {
          tableName: 'rooms',
          recordId: id,
          action: 'UPDATE',
        });
        res.json({
          success: true,
          data: {
            id: Number(room.id),
            code: room.code,
            name: room.name,
            capacity: room.capacity,
            facultyCode: room.faculty_code,
            facultyId: fRes.rows[0]?.id ?? null,
            facultyName: fRes.rows[0]?.name ?? null,
            isActive: room.is_active,
            createdAt: room.created_at,
            updatedAt: room.updated_at,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /admin-master/rooms/:id — nonaktifkan ruangan
  router.delete(
    '/rooms/:id',
    authenticate,
    authorize('course.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        const result = await pgPool.query(
          'UPDATE rooms SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id',
          [id],
        );
        if (result.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Ruangan tidak ditemukan', 404);
        }
        await auditFromRequest(req.user!, req, {
          tableName: 'rooms',
          recordId: id,
          action: 'DELETE',
        });
        res.json({ success: true, data: { message: 'Ruangan dinonaktifkan' } });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /admin-master/courses/:id — update mata kuliah (soft: nama/deskripsi/kredit).
  router.put(
    '/courses/:id',
    authenticate,
    authorize('course.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        const parsed = courseUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data mata kuliah tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const data = parsed.data;
        const result = await pgPool.query(
          `UPDATE courses SET name = COALESCE($1, name), credits = COALESCE($2, credits),
             description = COALESCE($3, description), updated_at = now()
           WHERE id = $4 RETURNING *`,
          [data.name ?? null, data.credits ?? null, data.description ?? null, id],
        );
        if (result.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Mata kuliah tidak ditemukan', 404);
        }
        await auditFromRequest(req.user!, req, {
          tableName: 'courses',
          recordId: id,
          action: 'UPDATE',
        });
        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /admin-master/courses/:id — nonaktifkan mata kuliah (soft delete).
  router.delete(
    '/courses/:id',
    authenticate,
    authorize('course.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        const result = await pgPool.query(
          'UPDATE courses SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id',
          [id],
        );
        if (result.rowCount === 0) {
          throw new AppError('NOT_FOUND', 'Mata kuliah tidak ditemukan', 404);
        }
        await auditFromRequest(req.user!, req, {
          tableName: 'courses',
          recordId: id,
          action: 'DELETE',
        });
        res.json({ success: true, data: { message: 'Mata kuliah dinonaktifkan' } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
