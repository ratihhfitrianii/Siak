import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { can } from '../../lib/policy';
import { auditFromRequest } from '../../lib/audit-service';
import { AppError } from '../../middleware/error-handler';
import type { Permission } from '../../lib/policy';

/** Authorize — cek apakah user punya SALAH SATU dari permissions. */
function authorizeAny(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authenticate required', 401));
      return;
    }
    if (!permissions.some((p) => can(req.user!.roleCode, p))) {
      next(new AppError('FORBIDDEN', 'Akses ditolak: di luar peran Anda', 403));
      return;
    }
    next();
  };
}

/**
 * Modul Skripsi — proposal & sidang:
 *   POST   /skripsi/proposals       — mahasiswa submit proposal
 *   GET    /skripsi/proposals       — mahasiswa lihat sendiri; dosen lihat yang diampu
 *   PUT    /skripsi/proposals/:id   — dosen/admin update status
 *   GET    /skripsi/supervisors     — list dosen pembimbing per prodi
 *   GET    /skripsi/proposals/:id/statuses — status history
 */

const proposalCreateSchema = z.object({
  title: z.string().min(10).max(500),
  proposalFile: z.string().max(10_000_000).optional(),
  supervisorIds: z.array(z.number().int().positive()).min(1).max(2),
});

const proposalUpdateSchema = z.object({
  status: z.enum([
    'draft',
    'diajukan',
    'dilihat_dosen',
    'disetujui_dosen',
    'ditolak_dosen',
    'disetujui_admin',
    'ditolak_admin',
    'dalam_bimbingan',
    'siap_sidang',
    'lulus',
    'tidak_lulus',
  ]),
  statusNotes: z.string().max(2000).optional(),
});

export function createSkripsiRouter(): Router {
  const router = Router();

  // ──────────────────────────────────────────────────
  // GET /skripsi/supervisors — list dosen pembimbing per prodi mahasiswa
  // ──────────────────────────────────────────────────
  router.get(
    '/supervisors',
    authenticate,
    authorize('thesis.submit'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Get student's prodi
        const studentRes = await pgPool.query(`SELECT s.prodi_id FROM students s WHERE s.id = $1`, [
          req.user!.studentId,
        ]);
        if (studentRes.rows.length === 0) {
          throw new AppError('FORBIDDEN', 'Akun bukan mahasiswa aktif', 403);
        }
        const prodiId = studentRes.rows[0].prodi_id;

        const result = await pgPool.query(
          `SELECT u.id, u.full_name, l.nidn, l.nik, pr.name as prodi_name
           FROM users u
           JOIN lecturers l ON l.user_id = u.id
           JOIN prodis pr ON pr.id = l.prodi_id
           WHERE l.prodi_id = $1 AND l.is_active = true AND u.is_active = true
           ORDER BY u.full_name`,
          [prodiId],
        );

        res.json({
          success: true,
          data: result.rows.map((r) => ({
            id: Number(r.id),
            fullName: r.full_name,
            nidn: r.nidn,
            nik: r.nik,
            prodiName: r.prodi_name,
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ──────────────────────────────────────────────────
  // POST /skripsi/proposals — mahasiswa submit proposal
  // ──────────────────────────────────────────────────
  router.post(
    '/proposals',
    authenticate,
    authorize('thesis.submit'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.studentId) {
          throw new AppError('FORBIDDEN', 'Akun bukan mahasiswa aktif', 403);
        }
        const parsed = proposalCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data proposal tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const data = parsed.data;

        // Verify all supervisors exist and are active dosen
        const supervisorRes = await pgPool.query(
          `SELECT u.id FROM users u
           JOIN lecturers l ON l.user_id = u.id
           WHERE u.id = ANY($1) AND l.is_active = true AND u.is_active = true`,
          [data.supervisorIds],
        );
        if (supervisorRes.rows.length !== data.supervisorIds.length) {
          throw new AppError('NOT_FOUND', 'Satu atau lebih dosen pembimbing tidak ditemukan', 404);
        }

        const primarySupervisorId = data.supervisorIds[0];

        const result = await pgPool.query(
          `INSERT INTO skripsi_proposals (student_id, supervisor_id, title, proposal_file, status)
           VALUES ($1, $2, $3, $4, 'diajukan')
           RETURNING *`,
          [req.user!.studentId, primarySupervisorId, data.title, data.proposalFile ?? null],
        );

        const proposal = result.rows[0];

        // Insert all supervisors into junction table
        const supervisorValues = data.supervisorIds.map((id, idx) => ({
          proposalId: proposal.id,
          supervisorId: id,
          isPrimary: idx === 0,
        }));
        for (const sv of supervisorValues) {
          await pgPool.query(
            `INSERT INTO skripsi_proposal_supervisors (proposal_id, supervisor_id, is_primary)
             VALUES ($1, $2, $3)`,
            [sv.proposalId, sv.supervisorId, sv.isPrimary],
          );
        }

        // Insert status history
        await pgPool.query(
          `INSERT INTO skripsi_proposal_statuses (proposal_id, status, notes, changed_by)
           VALUES ($1, 'diajukan', 'Proposal diajukan oleh mahasiswa', $2)`,
          [proposal.id, req.user!.id],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'skripsi_proposals',
          recordId: Number(proposal.id),
          action: 'INSERT',
          newValues: { title: data.title, supervisorIds: data.supervisorIds },
        });

        res.status(201).json({ success: true, data: proposal });
      } catch (err) {
        next(err);
      }
    },
  );

  // ──────────────────────────────────────────────────
  // GET /skripsi/proposals — list proposals
  //   mahasiswa: own proposals
  //   dosen: supervised proposals
  //   admin: all proposals
  // ──────────────────────────────────────────────────
  router.get(
    '/proposals',
    authenticate,
    authorizeAny('thesis.submit', 'thesis.review', 'thesis.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { page = '1', limit = '20' } = req.query;
        const p = Math.max(1, parseInt(page as string, 10));
        const l = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const offset = (p - 1) * l;

        const roleCode = req.user!.roleCode;
        const isStudent = roleCode === 'mahasiswa';
        const isLecturer = roleCode === 'dosen';
        const isAdmin = roleCode === 'admin_akademik' || roleCode === 'admin_sistem';

        let where = 'WHERE 1=1';
        const params: (string | number)[] = [];
        let paramIdx = 1;

        if (isStudent) {
          where += ` AND sp.student_id = $${paramIdx++}`;
          params.push(req.user!.studentId!);
        } else if (isLecturer && !isAdmin) {
          where += ` AND EXISTS (
            SELECT 1 FROM skripsi_proposal_supervisors sps
            WHERE sps.proposal_id = sp.id AND sps.supervisor_id = $${paramIdx++}
          )`;
          params.push(req.user!.id);
        }

        const countRes = await pgPool.query(
          `SELECT COUNT(*) FROM skripsi_proposals sp ${where}`,
          params,
        );
        const total = parseInt(countRes.rows[0].count, 10);

        const dataRes = await pgPool.query(
          `SELECT sp.*,
                  st.nim, su.full_name as student_name, su.email as student_email,
                  (
                    SELECT json_agg(json_build_object(
                      'id', u.id,
                      'fullName', u.full_name,
                      'nidn', l.nidn,
                      'nik', l.nik,
                      'prodiName', pr.name,
                      'isPrimary', sps.is_primary
                    ) ORDER BY sps.is_primary DESC, u.full_name)
                    FROM skripsi_proposal_supervisors sps
                    JOIN users u ON u.id = sps.supervisor_id
                    JOIN lecturers l ON l.user_id = u.id
                    JOIN prodis pr ON pr.id = l.prodi_id
                    WHERE sps.proposal_id = sp.id
                  ) as supervisors,
                  prd.name as prodi_name
           FROM skripsi_proposals sp
           JOIN students st ON st.id = sp.student_id
           JOIN users su ON su.id = st.user_id
           JOIN prodis prd ON prd.id = st.prodi_id
           ${where}
           ORDER BY sp.created_at DESC
           LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
          [...params, l, offset],
        );

        res.json({
          success: true,
          data: dataRes.rows.map((r) => ({
            id: Number(r.id),
            studentId: Number(r.student_id),
            supervisorId: Number(r.supervisor_id),
            nim: r.nim,
            studentName: r.student_name,
            studentEmail: r.student_email,
            supervisorName: r.supervisor_name,
            supervisorEmail: r.supervisor_email,
            prodiName: r.prodi_name,
            title: r.title,
            proposalFile: r.proposal_file,
            status: r.status,
            statusNotes: r.status_notes,
            reviewedBy: r.reviewed_by ? Number(r.reviewed_by) : null,
            reviewedAt: r.reviewed_at?.toISOString() ?? null,
            createdAt: r.created_at.toISOString(),
            updatedAt: r.updated_at.toISOString(),
            supervisors: r.supervisors ?? [],
          })),
          pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ──────────────────────────────────────────────────
  // GET /skripsi/proposals/:id/statuses — status history
  // ──────────────────────────────────────────────────
  router.get(
    '/proposals/:id/statuses',
    authenticate,
    authorizeAny('thesis.submit', 'thesis.review', 'thesis.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const proposalId = parseInt(req.params.id ?? '', 10);
        if (isNaN(proposalId)) {
          throw new AppError('VALIDATION_ERROR', 'Invalid proposal ID', 400);
        }

        const result = await pgPool.query(
          `SELECT sps.*, u.full_name as changed_by_name
           FROM skripsi_proposal_statuses sps
           JOIN users u ON u.id = sps.changed_by
           WHERE sps.proposal_id = $1
           ORDER BY sps.changed_at DESC`,
          [proposalId],
        );

        res.json({
          success: true,
          data: result.rows.map((r) => ({
            id: Number(r.id),
            proposalId: Number(r.proposal_id),
            status: r.status,
            notes: r.notes,
            changedBy: Number(r.changed_by),
            changedByName: r.changed_by_name,
            changedAt: r.changed_at.toISOString(),
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ──────────────────────────────────────────────────
  // PUT /skripsi/proposals/:id — dosen/admin update status
  // ──────────────────────────────────────────────────
  router.put(
    '/proposals/:id',
    authenticate,
    authorizeAny('thesis.review', 'thesis.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const proposalId = parseInt(req.params.id ?? '', 10);
        if (isNaN(proposalId)) {
          throw new AppError('VALIDATION_ERROR', 'Invalid proposal ID', 400);
        }
        const parsed = proposalUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data update tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const data = parsed.data;

        // Verify proposal exists
        const existing = await pgPool.query(`SELECT * FROM skripsi_proposals WHERE id = $1`, [
          proposalId,
        ]);
        if (existing.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Proposal tidak ditemukan', 404);
        }

        const result = await pgPool.query(
          `UPDATE skripsi_proposals
           SET status = $1, status_notes = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
           WHERE id = $4 RETURNING *`,
          [data.status, data.statusNotes ?? null, req.user!.id, proposalId],
        );

        // Insert status history
        await pgPool.query(
          `INSERT INTO skripsi_proposal_statuses (proposal_id, status, notes, changed_by)
           VALUES ($1, $2, $3, $4)`,
          [proposalId, data.status, data.statusNotes ?? null, req.user!.id],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'skripsi_proposals',
          recordId: proposalId,
          action: 'UPDATE',
          oldValues: { status: existing.rows[0].status },
          newValues: { status: data.status },
        });

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
