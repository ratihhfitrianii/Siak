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

const createUserSchema = z
  .object({
    email: z.string().email('Email tidak valid').optional(),
    password: z.string().min(8, 'Password minimal 8 karakter').optional(),
    fullName: z.string().min(2, 'Nama minimal 2 karakter').optional(),
    roleCode: z.enum(['mahasiswa', 'dosen', 'admin_akademik', 'admin_keuangan', 'admin_sistem']),
    isWali: z.boolean().default(false),
    // Flow NIM/NIK (keluhan: buat user cukup peran + NIM/NIK; sisanya auto + readonly):
    //   mahasiswa → nim (lookup students), dosen → nik (lookup lecturers).
    //   Password awal = NIM/NIK, must_change_password = true.
    nim: z.string().min(1, 'NIM wajib diisi').max(20).optional(),
    nik: z.string().min(1, 'NIK wajib diisi').max(20).optional(),
  })
  .superRefine((val, ctx) => {
    const hasNimNik = !!val.nim || !!val.nik;
    if (val.nim && val.roleCode !== 'mahasiswa') {
      ctx.addIssue({ code: 'custom', message: 'NIM hanya untuk peran Mahasiswa' });
    }
    if (val.nik && val.roleCode !== 'dosen') {
      ctx.addIssue({ code: 'custom', message: 'NIK hanya untuk peran Dosen' });
    }
    if (hasNimNik && (val.email || val.password || val.fullName)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pilih salah satu: NIM/NIK (auto-generate) ATAU email+password+nama (manual)',
      });
    }
    if (!hasNimNik && !(val.email && val.password && val.fullName)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Lengkapi NIM/NIK (mahasiswa/dosen) atau email + password + nama (peran lain)',
      });
    }
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

const lookupQuerySchema = z.object({
  role: z.enum(['mahasiswa', 'dosen']),
  identifier: z.string().min(1, 'NIM/NIK wajib diisi').max(20),
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
          studentId: user.studentId, // untuk transkrip mandiri (T1.11b); null untuk non-mahasiswa
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

  // GET /users/lookup — cari master data utk form "Buat User" (NIM/NIK → nama/email/prodi,
  // auto-fill + readonly di frontend). Dipanggil saat admin mengetik NIM/NIK.
  router.get(
    '/lookup',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = lookupQuerySchema.safeParse(req.query);
        if (!q.success) {
          throw new AppError('VALIDATION_ERROR', 'Parameter tidak valid', 400);
        }
        const { role, identifier } = q.data;
        const isStudent = role === 'mahasiswa';
        const sql = isStudent
          ? `SELECT u.id, u.full_name, u.email, u.is_active, u.must_change_password,
                    p.code AS prodi_code, p.name AS prodi_name, s.nim
             FROM students s
             JOIN users u ON u.id = s.user_id
             JOIN prodis p ON p.id = s.prodi_id
             WHERE s.nim = $1`
          : `SELECT u.id, u.full_name, u.email, u.is_active, u.must_change_password,
                    p.code AS prodi_code, p.name AS prodi_name, l.nik
             FROM lecturers l
             JOIN users u ON u.id = l.user_id
             JOIN prodis p ON p.id = l.prodi_id
             WHERE l.nik = $1`;
        const r = await pgPool.query(sql, [identifier]);
        if (r.rows.length === 0) {
          res.json({ success: true, data: { found: false } });
          return;
        }
        const row = r.rows[0];
        res.json({
          success: true,
          data: {
            found: true,
            userId: Number(row.id),
            nim: row.nim ?? null,
            nik: row.nik ?? null,
            fullName: row.full_name,
            email: row.email,
            isActive: row.is_active === true,
            mustChangePassword: row.must_change_password === true,
            prodiCode: row.prodi_code,
            prodiName: row.prodi_name,
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

        const { email, password, fullName, roleCode, isWali, nim, nik } = parsed.data;

        // ---- Flow NIM/NIK: buat user cukup peran + NIM/NIK; lookup master data,
        // aktifkan akun + reset password = NIM/NIK (wajib ganti saat login pertama).
        if (nim || nik) {
          const identifier = nim ?? nik!;
          const isStudent = roleCode === 'mahasiswa';
          const lookupSql = isStudent
            ? `SELECT u.id, u.full_name, u.is_active, u.must_change_password,
                      p.code AS prodi_code, p.name AS prodi_name, s.nim
               FROM students s
               JOIN users u ON u.id = s.user_id
               JOIN prodis p ON p.id = s.prodi_id
               WHERE s.nim = $1`
            : `SELECT u.id, u.full_name, u.is_active, u.must_change_password,
                      p.code AS prodi_code, p.name AS prodi_name, l.nik
               FROM lecturers l
               JOIN users u ON u.id = l.user_id
               JOIN prodis p ON p.id = l.prodi_id
               WHERE l.nik = $1`;
          const lookup = await pgPool.query(lookupSql, [identifier]);
          if (lookup.rows.length === 0) {
            const label = isStudent ? 'NIM' : 'NIK';
            throw new AppError(
              'NOT_FOUND',
              `${label} ${identifier} tidak ditemukan di data ${
                isStudent ? 'mahasiswa' : 'dosen'
              }. Impor data atau tambah via Master Data dulu.`,
              404,
            );
          }
          const row = lookup.rows[0];

          const passwordHash = await bcrypt.hash(identifier, BCRYPT_ROUNDS);
          const result = await pgPool.query(
            `UPDATE users
                SET password_hash = $1, must_change_password = true, is_active = true,
                    failed_login_attempts = 0, locked_until = NULL,
                    role_id = (SELECT id FROM roles WHERE code = $2),
                    updated_at = now()
             WHERE id = $3
             RETURNING id, email, full_name, is_wali`,
            [passwordHash, roleCode, row.id],
          );

          // Audit trail (F-13, S-06, S-07) — password TIDAK pernah dicatat (S-04)
          await auditFromRequest(req.user!, req, {
            tableName: 'users',
            recordId: Number(result.rows[0].id),
            action: 'UPDATE',
            oldValues: {
              isActive: row.is_active,
              mustChangePassword: row.must_change_password,
            },
            newValues: {
              isActive: true,
              mustChangePassword: true,
              passwordReset: true,
              roleCode,
              identifierType: isStudent ? 'NIM' : 'NIK',
            },
          });

          res.json({
            success: true,
            data: {
              ...result.rows[0],
              id: Number(result.rows[0].id),
              nim: row.nim ?? null,
              nik: row.nik ?? null,
              prodiCode: row.prodi_code,
              prodiName: row.prodi_name,
              message: `Akun ${row.full_name} diaktifkan — password awal = ${
                isStudent ? 'NIM' : 'NIK'
              } (wajib diganti saat login pertama)`,
            },
          });
          return;
        }

        // ---- Flow manual (peran admin tanpa NIM/NIK, backward-compat) ----
        // superRefine di atas menjamin ketiganya ada saat tanpa nim/nik — narrow utk TS.
        if (!email || !password || !fullName) {
          throw new AppError('VALIDATION_ERROR', 'Email, password, dan nama wajib diisi', 400);
        }

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

  // DELETE /users/:id — nonaktifkan user (admin_sistem; keluhan lama: "hanya admin sistem
  // yang dapat menghapus ... user"). Soft-delete (is_active=false): akun tidak bisa login,
  // data historis (students/lecturers/audit) tetap utuh karena FK.
  router.delete(
    '/:id',
    authenticate,
    authorize('user.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID user tidak valid', 400);
        }
        const actor = req.user!;
        if (targetId === actor.id) {
          throw new AppError('VALIDATION_ERROR', 'Tidak dapat menghapus akun sendiri', 400);
        }

        const target = await pgPool.query(
          `SELECT u.id, u.email, u.full_name, r.code AS role_code, u.is_active
           FROM users u
           JOIN roles r ON u.role_id = r.id
           WHERE u.id = $1`,
          [targetId],
        );
        if (target.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'User tidak ditemukan', 404);
        }
        if (!target.rows[0].is_active) {
          throw new AppError('VALIDATION_ERROR', 'User sudah nonaktif', 409);
        }

        const result = await pgPool.query(
          `UPDATE users SET is_active = false, updated_at = now()
           WHERE id = $1
           RETURNING id, email, full_name`,
          [targetId],
        );

        await auditFromRequest(actor, req, {
          tableName: 'users',
          recordId: targetId,
          action: 'UPDATE',
          oldValues: { isActive: true, roleCode: target.rows[0].role_code },
          newValues: { isActive: false },
        });

        res.json({
          success: true,
          data: {
            ...result.rows[0],
            id: Number(result.rows[0].id),
            message: 'User dinonaktifkan',
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
