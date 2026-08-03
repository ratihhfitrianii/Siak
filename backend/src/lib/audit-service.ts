import { isIP } from 'node:net';
import type { PoolClient } from 'pg';
import { pgPool } from './pg';
import type { AuthUser } from './auth-middleware';

/**
 * Audit Service — T1.9 (F-13, S-06, S-07, AC-05).
 * Mencatat SEMUA mutasi data ke tabel audit_logs: user, action, old/new JSONB,
 * label atribusi "diinput oleh X (role)" per S-07 & DL-10.
 *
 * Desain (docs/02 §6.5): audit tidak bisa dilewati (A-4) — `writeAuditLog`
 * di-await dalam handler; jika audit gagal, mutasi ikut gagal (tidak ada
 * mutasi "diam-diam" tanpa jejak).
 */

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'IMPORT';

export interface AuditLogParams {
  /** Nama tabel entitas yang dimutasi (mis. 'grades', 'krs_submissions'). */
  tableName: string;
  /** ID record yang dimutasi. */
  recordId: number;
  action: AuditAction;
  /** Nilai lama (null untuk INSERT / LOGIN). */
  oldValues?: Record<string, unknown> | null;
  /** Nilai baru (null untuk DELETE). */
  newValues?: Record<string, unknown> | null;
  changedBy: number;
  /** Label atribusi S-07: "diinput oleh {nama} ({role})". */
  changedByLabel: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Batasi label ke 100 karakter (kolom VARCHAR(100)). */
export function buildChangedByLabel(user: { fullName: string; roleCode: string }): string {
  return `diinput oleh ${user.fullName} (${user.roleCode})`.slice(0, 100);
}

/** INET hanya menerima IP valid — selain itu null (jangan sampai menggagalkan audit). */
export function sanitizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return isIP(ip) > 0 ? ip : null;
}

/**
 * Tulis entri audit.
 * @param client — PoolClient opsional; jika diberikan, insert berjalan dalam
 *                transaksi pemanggil (atomicity dengan mutasi, pola KRS).
 */
export async function writeAuditLog(params: AuditLogParams, client?: PoolClient): Promise<void> {
  const query = `INSERT INTO audit_logs
       (table_name, record_id, action, old_values, new_values,
        changed_by, changed_by_label, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
  const values: unknown[] = [
    params.tableName,
    params.recordId,
    params.action,
    params.oldValues ? JSON.stringify(params.oldValues) : null,
    params.newValues ? JSON.stringify(params.newValues) : null,
    params.changedBy,
    params.changedByLabel,
    sanitizeIp(params.ipAddress),
    params.userAgent ?? null,
  ];
  if (client) {
    await client.query(query, values);
  } else {
    await pgPool.query(query, values);
  }
}

/**
 * Convenience: tulis audit dari request — mengambil user terautentikasi,
 * IP dan user-agent dari request (label atribusi otomatis).
 */
export async function auditFromRequest(
  user: Pick<AuthUser, 'id' | 'fullName' | 'roleCode'>,
  req: { ip?: string; headers?: { 'user-agent'?: string | string[] } },
  params: Omit<AuditLogParams, 'changedBy' | 'changedByLabel' | 'ipAddress' | 'userAgent'>,
  client?: PoolClient,
): Promise<void> {
  const rawUserAgent = req.headers?.['user-agent'];
  await writeAuditLog(
    {
      ...params,
      changedBy: user.id,
      changedByLabel: buildChangedByLabel(user),
      ipAddress: req.ip,
      userAgent: Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent,
    },
    client,
  );
}
