import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pgPool } from './pg';
import { AppError } from '../middleware/error-handler';
import { can, type Permission } from './policy';

/**
 * User terautentikasi yang dilampirkan ke `req.user` oleh middleware `authenticate`.
 * (Dideklarasikan juga di src/types/express.d.ts)
 */
export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  roleId: number;
  roleCode: string;
  isWali: boolean;
  isKaprodi: boolean;
  isWakilKaprodi: boolean;
  studentId: number | null;
  lecturerId: number | null;
  prodiId: number | null;
  adminFacultyCode: string | null;
}

export interface JwtPayload {
  sub: number;
  email: string;
  roleId: number;
  isWali: boolean;
}

/**
 * Authenticate — verifikasi JWT Bearer + muat user fresh dari DB (S-05).
 * Menolak jika token invalid/kadaluarsa (401) atau akun non-aktif (403).
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Authorization header required', 401);
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;

    // jsonwebtoken mengubah claim `sub` menjadi string saat sign; terima keduanya
    const sub = typeof decoded.sub === 'number' ? decoded.sub : Number(decoded.sub);
    if (!Number.isInteger(sub) || sub <= 0) {
      throw new AppError('UNAUTHORIZED', 'Token tidak valid', 401);
    }

    const result = await pgPool.query(
      `SELECT u.id, u.email, u.full_name, u.role_id, u.is_wali, u.is_active,
              u.admin_faculty_code, u.is_kaprodi, u.is_wakil_kaprodi,
              r.code AS role_code,
              s.id AS student_id,
              l.id AS lecturer_id,
              l.prodi_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN lecturers l ON l.user_id = u.id
       WHERE u.id = $1`,
      [sub],
    );

    if (result.rows.length === 0) {
      throw new AppError('UNAUTHORIZED', 'User tidak ditemukan', 401);
    }

    const row = result.rows[0];
    if (!row.is_active) {
      throw new AppError('FORBIDDEN', 'Akun tidak aktif', 403);
    }

    req.user = {
      id: Number(row.id), // BIGSERIAL int8 → pg mengembalikan string; normalisasi ke number
      email: row.email,
      fullName: row.full_name,
      roleId: row.role_id,
      roleCode: row.role_code,
      isWali: row.is_wali,
      isKaprodi: row.is_kaprodi,
      isWakilKaprodi: row.is_wakil_kaprodi,
      studentId: row.student_id ? Number(row.student_id) : null,
      lecturerId: row.lecturer_id ? Number(row.lecturer_id) : null,
      prodiId: row.prodi_id ? Number(row.prodi_id) : null,
      adminFacultyCode: row.admin_faculty_code ?? null,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    // jwt.verify gagal (expired/signature) atau error lain
    next(new AppError('UNAUTHORIZED', 'Token tidak valid atau kadaluarsa', 401));
  }
}

/**
 * Authorize — periksa permission terhadap matriks RBAC §6.1 (AC-10).
 * Penggunaan: router.get('/x', authenticate, authorize('krs.approve'), handler)
 */
export function authorize(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authenticate required', 401));
      return;
    }
    if (!can(req.user.roleCode, permission)) {
      next(new AppError('FORBIDDEN', 'Akses ditolak: di luar peran Anda', 403));
      return;
    }
    next();
  };
}

/**
 * AuthorizeWali — khusus dosen dengan atribut is_wali (DL-08).
 * Untuk resource binaan (transkrip binaan, bimbingan wali).
 */
export function authorizeWali(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authenticate required', 401));
      return;
    }
    const isDosenWali = req.user.roleCode === 'dosen' && req.user.isWali;
    if (!isDosenWali && !can(req.user.roleCode, permission)) {
      next(new AppError('FORBIDDEN', 'Akses ditolak: hanya dosen Wali', 403));
      return;
    }
    next();
  };
}

/**
 * AuthorizeKaprodi — khusus dosen beratribut is_kaprodi / is_wakil_kaprodi.
 * Untuk resource persetujuan jadwal (review pengajuan jadwal dosen seprodi).
 */
export function authorizeKaprodi() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authenticate required', 401));
      return;
    }
    if (req.user.roleCode !== 'dosen' || (!req.user.isKaprodi && !req.user.isWakilKaprodi)) {
      next(new AppError('FORBIDDEN', 'Akses ditolak: hanya Kaprodi / Wakil Kaprodi', 403));
      return;
    }
    next();
  };
}
