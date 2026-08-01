import { Router, type Request, type Response } from 'express';

/**
 * Health check (T1.1 — fondasi).
 * - GET /health        : liveness — proses hidup (selalu 200 jika server berjalan).
 * - GET /health/ready  : readiness — koneksi DB + Redis (200 jika siap / belum dikonfigurasi,
 *                        503 jika dependensi yang dikonfigurasi tidak dapat dijangkau).
 * Redis down → graceful degradation: waiting room off + cache bypass (docs/02 §9.3).
 */
export interface DependencyStatus {
  db: 'up' | 'down' | 'not_configured';
  redis: 'up' | 'down' | 'not_configured';
}

export interface HealthDependencies {
  /** Fungsi ping PostgreSQL; opsional bila DATABASE_URL tidak dikonfigurasi. */
  pingDb?: () => Promise<void>;
  /** Fungsi ping Redis; opsional bila REDIS_URL tidak dikonfigurasi. */
  pingRedis?: () => Promise<void>;
}

export async function checkDependencies(deps: HealthDependencies = {}): Promise<DependencyStatus> {
  const status: DependencyStatus = { db: 'not_configured', redis: 'not_configured' };

  if (deps.pingDb) {
    try {
      await deps.pingDb();
      status.db = 'up';
    } catch {
      status.db = 'down';
    }
  }

  if (deps.pingRedis) {
    try {
      await deps.pingRedis();
      status.redis = 'up';
    } catch {
      status.redis = 'down';
    }
  }

  return status;
}

export function createHealthRouter(deps: HealthDependencies = {}): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'siak-backend',
        version: process.env.npm_package_version ?? '0.1.0',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  router.get('/health/ready', async (_req: Request, res: Response) => {
    const depsStatus = await checkDependencies(deps);
    // Siap jika tidak ada dependensi yang dikonfigurasi dalam status 'down'.
    // Misconfig production ditangkap fail-fast oleh validasi env (env.ts).
    const ready = depsStatus.db !== 'down' && depsStatus.redis !== 'down';

    res.status(ready ? 200 : 503).json({
      success: ready,
      data: {
        status: ready ? 'ready' : 'not_ready',
        dependencies: depsStatus,
      },
    });
  });

  return router;
}
