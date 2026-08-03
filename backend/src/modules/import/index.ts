import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';

/**
 * Modul Impor — T1.10 (F-18, K-08).
 * Impor data massal Excel/CSV: mahasiswa (upsert NIM), dosen (upsert NIDN),
 * mata kuliah (upsert kode). Kolom per docs/02 §6.6:
 *   - students : nim, full_name, prodi_code, angkatan, [kontak=email]
 *   - lecturers: nidn, full_name, prodi_code, [kontak=email]
 *   - courses  : kode, nama, sks
 * RBAC: hanya Admin Sistem (import.data).
 * - Validasi schema per baris (zod) → baris gagal dilaporkan + alasan (DoD).
 * - Upsert NIM/NIDN existing (K-08): update profil, tidak duplikat.
 * - Password default akun baru: IMPORT_DEFAULT_PASSWORD (default 'Siak123!'),
 *   wajib diganti saat login pertama (must_change_password=true, spec §6.3).
 * - Satu transaksi per file + SAVEPOINT per baris (baris gagal tidak
 *   menggagalkan baris lain); jejak audit action=IMPORT atomik dengan mutasi.
 */

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const DEFAULT_PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD ?? 'Siak123!';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

type RawRow = Record<string, string>;
type ImportKind = 'students' | 'lecturers' | 'courses';

interface ImportFailure {
  row: number; // nomor baris di file (1 = header)
  reason: string;
}

interface ImportResult {
  inserted: number;
  updated: number;
  failed: ImportFailure[];
}

/** Alias kolom yang diterima per field kanonik (case-insensitive via lowercase). */
const COLUMN_ALIASES: Record<string, string[]> = {
  nim: ['nim', 'npm'],
  full_name: ['full_name', 'nama', 'nama_lengkap', 'name'],
  prodi_code: ['prodi_code', 'kode_prodi', 'prodi'],
  angkatan: ['angkatan', 'tahun_angkatan', 'academic_year', 'ta'],
  kontak: ['kontak', 'email', 'kontak_email'],
  nidn: ['nidn', 'nik', 'nip'],
  kode: ['kode', 'code', 'kode_mk'],
  nama: ['nama', 'name', 'nama_mk'],
  sks: ['sks', 'credits'],
};

const REQUIRED_COLUMNS: Record<ImportKind, string[]> = {
  students: ['nim', 'full_name', 'prodi_code', 'angkatan'],
  lecturers: ['nidn', 'full_name', 'prodi_code'],
  courses: ['kode', 'nama', 'sks'],
};

const studentRowSchema = z.object({
  nim: z.string().min(3).max(20),
  full_name: z.string().min(1).max(150),
  prodi_code: z.string().min(1).max(10),
  angkatan: z.string().min(1).max(9),
  kontak: z.string().email().max(255).optional(),
});

const lecturerRowSchema = z.object({
  nidn: z.string().min(1).max(20),
  full_name: z.string().min(1).max(150),
  prodi_code: z.string().min(1).max(10),
  kontak: z.string().email().max(255).optional(),
});

const courseRowSchema = z.object({
  kode: z.string().min(1).max(20),
  nama: z.string().min(1).max(150),
  sks: z.coerce.number().int().min(1).max(6),
});

class RowError extends Error {}

function zodMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue ? `${issue.path.join('.')}: ${issue.message}` : 'Data tidak valid';
}

/** Petakan baris mentah → field kanonik via alias; kolom tak dikenal diabaikan. */
function mapColumns(row: RawRow): Record<string, string> {
  const canonical: Record<string, string> = {};
  for (const canon of Object.keys(COLUMN_ALIASES)) {
    const aliases = COLUMN_ALIASES[canon] ?? [];
    const hit = aliases.find((a) => row[a] !== undefined && row[a] !== '');
    if (hit !== undefined) canonical[canon] = row[hit] ?? '';
  }
  return canonical;
}

/** Pastikan semua kolom wajib ada di header (baris pertama file). */
function assertHeaders(row: RawRow | undefined, kind: ImportKind): void {
  if (!row || Object.keys(row).length === 0) {
    throw new AppError('INVALID_HEADERS', 'File tidak memiliki baris header', 400);
  }
  const missing = REQUIRED_COLUMNS[kind].filter(
    (c) => !(COLUMN_ALIASES[c] ?? []).some((a) => row[a] !== undefined && row[a] !== ''),
  );
  if (missing.length > 0) {
    throw new AppError(
      'INVALID_HEADERS',
      `Kolom wajib tidak ditemukan: ${missing.join(', ')}. Kolom yang diterima: ${Object.keys(row).join(', ')}`,
      400,
    );
  }
}

function parseCsv(buffer: Buffer): RawRow[] {
  try {
    // String input (BOM manual) menghindari mismatch tipe Buffer @types/node vs csv-parse
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    return parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as RawRow[];
  } catch (e) {
    throw new AppError('PARSE_ERROR', `Gagal mem-parsing CSV: ${(e as Error).message}`, 400);
  }
}

type ExcelJsLoadInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

async function parseXlsx(buffer: Buffer): Promise<RawRow[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJsLoadInput);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError('EMPTY_FILE', 'File Excel tidak memiliki worksheet', 400);

    const rows: RawRow[] = [];
    let headers: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = (row.values as unknown[])
        .slice(1)
        .map((v) => (v == null ? '' : String(v).trim()));
      if (rowNumber === 1) {
        headers = values;
        return;
      }
      if (values.every((v) => v === '')) return;
      const obj: RawRow = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = values[i] ?? '';
      });
      rows.push(obj);
    });
    return rows;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('PARSE_ERROR', `Gagal mem-parsing Excel: ${(e as Error).message}`, 400);
  }
}

async function parseFile(buffer: Buffer, ext: string): Promise<RawRow[]> {
  if (ext === 'csv') return parseCsv(buffer);
  return parseXlsx(buffer);
}

async function upsertStudents(rows: RawRow[], req: Request): Promise<ImportResult> {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const result: ImportResult = { inserted: 0, updated: 0, failed: [] };
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const parsed = studentRowSchema.safeParse(mapColumns(row));
      if (!parsed.success) {
        result.failed.push({ row: i + 2, reason: zodMessage(parsed.error) });
        continue;
      }
      const { nim, full_name, prodi_code, angkatan, kontak } = parsed.data;
      await client.query('SAVEPOINT sp_import');
      try {
        const prodi = await client.query('SELECT id FROM prodis WHERE code = $1 AND is_active', [
          prodi_code,
        ]);
        if (prodi.rowCount === 0) throw new RowError(`Prodi "${prodi_code}" tidak ditemukan`);
        const ay = await client.query(
          'SELECT id FROM academic_years WHERE code = $1 AND is_active',
          [angkatan],
        );
        if (ay.rowCount === 0) throw new RowError(`Angkatan "${angkatan}" tidak ditemukan`);
        const email = (kontak ?? `${nim}@student.siak.local`).toLowerCase();

        const existing = await client.query('SELECT user_id FROM students WHERE nim = $1', [nim]);
        if ((existing.rowCount ?? 0) > 0) {
          // K-08: NIM existing → update profil, jangan duplikat
          await client.query(
            'UPDATE users SET full_name = $1, is_active = true, updated_at = now() WHERE id = $2',
            [full_name, existing.rows[0].user_id],
          );
          await client.query(
            `UPDATE students SET prodi_id = $1, academic_year_id = $2, entry_type = 'Impor',
             is_active = true, status = 'aktif', updated_at = now() WHERE nim = $3`,
            [prodi.rows[0].id, ay.rows[0].id, nim],
          );
          result.updated += 1;
        } else {
          const user = await client.query(
            `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
             VALUES ($1, $2, $3, (SELECT id FROM roles WHERE code = 'mahasiswa'), true, true)
             ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = true
             RETURNING id`,
            [email, passwordHash, full_name],
          );
          await client.query(
            `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
             VALUES ($1, $2, $3, $4, 'Impor', true, 'aktif')`,
            [user.rows[0].id, nim, prodi.rows[0].id, ay.rows[0].id],
          );
          result.inserted += 1;
        }
        await client.query('RELEASE SAVEPOINT sp_import');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_import');
        result.failed.push({
          row: i + 2,
          reason: e instanceof RowError ? e.message : `Kesalahan database: ${(e as Error).message}`,
        });
      }
    }
    await auditFromRequest(
      req.user!,
      req,
      {
        tableName: 'students',
        recordId: 0, // import bulk: record_id tidak bermakna per-baris; ringkasan di newValues
        action: 'IMPORT',
        newValues: {
          filename: req.file?.originalname,
          total: rows.length,
          inserted: result.inserted,
          updated: result.updated,
          failedCount: result.failed.length,
        },
      },
      client,
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return result;
}

async function upsertLecturers(rows: RawRow[], req: Request): Promise<ImportResult> {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const result: ImportResult = { inserted: 0, updated: 0, failed: [] };
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const parsed = lecturerRowSchema.safeParse(mapColumns(row));
      if (!parsed.success) {
        result.failed.push({ row: i + 2, reason: zodMessage(parsed.error) });
        continue;
      }
      const { nidn, full_name, prodi_code, kontak } = parsed.data;
      await client.query('SAVEPOINT sp_import');
      try {
        const prodi = await client.query('SELECT id FROM prodis WHERE code = $1 AND is_active', [
          prodi_code,
        ]);
        if (prodi.rowCount === 0) throw new RowError(`Prodi "${prodi_code}" tidak ditemukan`);
        const email = (kontak ?? `${nidn}@siak.local`).toLowerCase();

        const existing = await client.query('SELECT user_id FROM lecturers WHERE nidn = $1', [
          nidn,
        ]);
        if ((existing.rowCount ?? 0) > 0) {
          await client.query(
            'UPDATE users SET full_name = $1, is_active = true, updated_at = now() WHERE id = $2',
            [full_name, existing.rows[0].user_id],
          );
          await client.query(
            `UPDATE lecturers SET prodi_id = $1, employment_type = 'tetap', is_active = true, updated_at = now() WHERE nidn = $2`,
            [prodi.rows[0].id, nidn],
          );
          result.updated += 1;
        } else {
          const user = await client.query(
            `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
             VALUES ($1, $2, $3, (SELECT id FROM roles WHERE code = 'dosen'), true, true)
             ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = true
             RETURNING id`,
            [email, passwordHash, full_name],
          );
          await client.query(
            `INSERT INTO lecturers (user_id, nidn, prodi_id, employment_type, is_active)
             VALUES ($1, $2, $3, 'tetap', true)`,
            [user.rows[0].id, nidn, prodi.rows[0].id],
          );
          result.inserted += 1;
        }
        await client.query('RELEASE SAVEPOINT sp_import');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_import');
        result.failed.push({
          row: i + 2,
          reason: e instanceof RowError ? e.message : `Kesalahan database: ${(e as Error).message}`,
        });
      }
    }
    await auditFromRequest(
      req.user!,
      req,
      {
        tableName: 'lecturers',
        recordId: 0,
        action: 'IMPORT',
        newValues: {
          filename: req.file?.originalname,
          total: rows.length,
          inserted: result.inserted,
          updated: result.updated,
          failedCount: result.failed.length,
        },
      },
      client,
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return result;
}

async function upsertCourses(rows: RawRow[], req: Request): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, failed: [] };
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const parsed = courseRowSchema.safeParse(mapColumns(row));
      if (!parsed.success) {
        result.failed.push({ row: i + 2, reason: zodMessage(parsed.error) });
        continue;
      }
      const { kode, nama, sks } = parsed.data;
      await client.query('SAVEPOINT sp_import');
      try {
        const res = await client.query(
          `INSERT INTO courses (code, name, credits)
           VALUES ($1, $2, $3)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, credits = EXCLUDED.credits,
             is_active = true, updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [kode, nama, sks],
        );
        if (res.rows[0]?.inserted) result.inserted += 1;
        else result.updated += 1;
        await client.query('RELEASE SAVEPOINT sp_import');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_import');
        result.failed.push({ row: i + 2, reason: `Kesalahan database: ${(e as Error).message}` });
      }
    }
    await auditFromRequest(
      req.user!,
      req,
      {
        tableName: 'courses',
        recordId: 0,
        action: 'IMPORT',
        newValues: {
          filename: req.file?.originalname,
          total: rows.length,
          inserted: result.inserted,
          updated: result.updated,
          failedCount: result.failed.length,
        },
      },
      client,
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return result;
}

async function upsertByKind(kind: ImportKind, rows: RawRow[], req: Request): Promise<ImportResult> {
  if (kind === 'students') return upsertStudents(rows, req);
  if (kind === 'lecturers') return upsertLecturers(rows, req);
  return upsertCourses(rows, req);
}

/** Bungkus multer: error LIMIT_FILE_SIZE / lainnya → AppError 400 (bukan 500). */
function uploadSingle(field: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload.single(field)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('FILE_TOO_LARGE', 'Ukuran file maksimal 2MB', 400));
        return;
      }
      next(
        new AppError('INVALID_FILE', err instanceof Error ? err.message : 'File tidak valid', 400),
      );
    });
  };
}

function handleImport(kind: ImportKind) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw new AppError('FILE_REQUIRED', 'File wajib diunggah pada field "file"', 400);
      }
      const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
      if (ext !== 'csv' && ext !== 'xlsx') {
        throw new AppError('UNSUPPORTED_FILE', 'Format file harus .csv atau .xlsx', 400);
      }
      if (file.size === 0) {
        throw new AppError('EMPTY_FILE', 'File kosong', 400);
      }
      const rows = await parseFile(file.buffer, ext);
      if (rows.length === 0) {
        throw new AppError('EMPTY_FILE', 'File tidak berisi data baris', 400);
      }
      assertHeaders(rows[0], kind);
      const result = await upsertByKind(kind, rows, req);
      res.json({
        success: true,
        data: { filename: file.originalname, total: rows.length, ...result },
      });
    } catch (err) {
      next(err);
    }
  };
}

export function createImportRouter(): Router {
  const router = Router();
  router.post(
    '/import/students',
    authenticate,
    authorize('import.data'),
    uploadSingle('file'),
    handleImport('students'),
  );
  router.post(
    '/import/lecturers',
    authenticate,
    authorize('import.data'),
    uploadSingle('file'),
    handleImport('lecturers'),
  );
  router.post(
    '/import/courses',
    authenticate,
    authorize('import.data'),
    uploadSingle('file'),
    handleImport('courses'),
  );
  return router;
}
