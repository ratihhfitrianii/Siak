import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { createHealthRouter, type HealthDependencies } from './modules/health/health.routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createAuthRouter } from './modules/auth';
import { createRbacRouter } from './modules/rbac';
import { createKrsRouter } from './modules/krs';
import { createAcademicRouter } from './modules/academic';
import { createFinanceRouter } from './modules/finance';
import { createDosenRouter } from './modules/dosen';
import { createAuditRouter } from './modules/audit';
import { createNotificationRouter } from './modules/notification';
import { createImportRouter } from './modules/import';

/**
 * Membangun aplikasi Express (monolith modular — DL-07).
 * Modul di luar health masih stub (diisi per task Iterasi 1: T1.3+).
 */
export function createApp(healthDeps: HealthDependencies = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ autoLogging: false }));

  app.use('/api/v1', createHealthRouter(healthDeps));

  // Stub modul — diimplementasikan pada task Iterasi 1 (lihat docs/03).
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/users', createRbacRouter());
  app.use('/api/v1/krs', createKrsRouter());
  app.use('/api/v1', createAcademicRouter());
  app.use('/api/v1', createFinanceRouter());
  app.use('/api/v1', createDosenRouter());
  app.use('/api/v1', createAuditRouter());
  app.use('/api/v1', createNotificationRouter());
  app.use('/api/v1', createImportRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
