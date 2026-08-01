import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Custom application error dengan kode & status HTTP.
 * Digunakan untuk error yang di-handle explicit (validasi, auth, not found, dll).
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

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
  // AppError: known error, log warning only
  if (err instanceof AppError) {
    logger.warn(
      {
        trace_id: req.header('x-trace-id') ?? undefined,
        path: req.path,
        code: err.code,
        details: err.details,
      },
      err.message,
    );
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      trace_id: req.header('x-trace-id') ?? undefined,
    });
    return;
  }

  // Unknown error: log full stack
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
