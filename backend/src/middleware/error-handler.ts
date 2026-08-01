import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * 404 handler — resource tidak ditemukan (docs/02 §9.1: NOT_FOUND).
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint tidak ditemukan: ${req.method} ${req.path}`,
    },
    trace_id: req.header('x-trace-id') ?? undefined,
  });
}

/**
 * Error handler terpusat (docs/02 §9.1: INTERNAL_ERROR).
 * Detail error hanya di log; klien menerima pesan umum + trace_id.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error(
    {
      trace_id: req.header('x-trace-id') ?? undefined,
      path: req.path,
      err: err,
    },
    'Unhandled error',
  );

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan internal. Silakan coba lagi.',
    },
    trace_id: req.header('x-trace-id') ?? undefined,
  });
}
