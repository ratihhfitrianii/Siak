/**
 * Metrics module — Prometheus metrics for Siak backend.
 * Exposes /metrics endpoint for Prometheus scraping.
 */

import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response, NextFunction } from 'express';

export const register = new Registry();

// Enable default metrics (process, memory, CPU, etc.)
collectDefaultMetrics({ register, prefix: 'siak_' });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'siak_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'siak_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const activeConnections = new Gauge({
  name: 'siak_active_connections',
  help: 'Number of active connections',
  labelNames: ['type'], // 'http' | 'websocket'
  registers: [register],
});

export const waitingRoomQueueSize = new Gauge({
  name: 'siak_waiting_room_queue_size',
  help: 'Current waiting room queue size',
  registers: [register],
});

export const waitingRoomActiveUsers = new Gauge({
  name: 'siak_waiting_room_active_users',
  help: 'Current waiting room active users',
  registers: [register],
});

export const databasePoolUsage = new Gauge({
  name: 'siak_database_pool_usage',
  help: 'Database pool usage (active/total)',
  labelNames: ['state'], // 'active' | 'idle' | 'total'
  registers: [register],
});

export const krsSubmissionsTotal = new Counter({
  name: 'siak_krs_submissions_total',
  help: 'Total KRS submissions',
  labelNames: ['status'], // 'success' | 'failed' | 'class_full'
  registers: [register],
});

export const paymentTransactionsTotal = new Counter({
  name: 'siak_payment_transactions_total',
  help: 'Total payment transactions',
  labelNames: ['gateway', 'status'], // 'mock' | 'midtrans' | 'xendit', 'success' | 'failed' | 'pending'
  registers: [register],
});

export const pddiktiSyncTotal = new Counter({
  name: 'siak_pddikti_sync_total',
  help: 'Total PDDikti sync operations',
  labelNames: ['entity', 'status'], // 'mahasiswa' | 'dosen' | 'nilai', 'success' | 'failed' | 'skipped'
  registers: [register],
});

export const payrollGeneratedTotal = new Counter({
  name: 'siak_payroll_generated_total',
  help: 'Total payroll records generated',
  labelNames: ['status'], // 'draft' | 'approved' | 'paid'
  registers: [register],
});

/**
 * Express middleware to collect HTTP metrics.
 * Usage: app.use(metricsMiddleware);
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  // Capture original end to hook response finish
  const originalEnd = res.end;
  res.end = function (chunk?: unknown, encoding?: unknown): Response {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    // Get route pattern (from express router)
    const route = (req as { route?: { path: string } }).route?.path ?? req.path ?? 'unknown';
    const method = req.method;
    const statusCode = res.statusCode;

    httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
    httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationMs / 1000,
    );

    return originalEnd.call(this, chunk, encoding as BufferEncoding);
  };

  next();
}

/**
 * Metrics endpoint handler.
 * Usage: app.get('/metrics', metricsHandler);
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch {
    res.status(500).send('Failed to collect metrics');
  }
}
