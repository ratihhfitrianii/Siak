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
import { createGradesRouter } from './modules/grades';
import { createTranscriptRouter } from './modules/transcript';
import { createScheduleRouter } from './modules/schedule';
import { createAttendanceRouter } from './modules/attendance';
import { createGuidanceRouter } from './modules/guidance';
import { createSubstituteRouter } from './modules/substitute';
import { createAdminMasterRouter } from './modules/admin-master';
import { createAnnouncementRouter } from './modules/announcement';
import { createStudentProfileRouter } from './modules/student-profile';
import {
  WaitingRoomService,
  WR_DEFAULT_OPTIONS,
  createWaitingRoomService,
} from './modules/waiting-room';
import { createWaitingRoomRouter } from './modules/waiting-room/waiting-room.routes';
import { createWaitingRoomMiddleware } from './modules/waiting-room/waiting-room.middleware';
import { metricsMiddleware, metricsHandler } from './lib/metrics';

/**
 * Options untuk createApp — injeksi dependensi (healthDeps untuk health check,
 * waitingRoom untuk gate T1.13; default dibuat di sini, test boleh null).
 */
export interface AppOptions {
  waitingRoom?: WaitingRoomService | null;
}

/**
 * Membangun aplikasi Express (monolith modular — DL-07).
 * Modul di luar health masih stub (diisi per task Iterasi 1: T1.3+).
 */
export function createApp(healthDeps: HealthDependencies = {}, options: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  // T1.14: trust proxy — backend hanya terekspos via nginx (infra + compose dev),
  // yang sudah mengirim X-Forwarded-For; tanpa ini req.ip = IP nginx dan
  // waiting room per-IP (userKey) serta IP audit tak pernah akurat.
  app.set('trust proxy', true);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ autoLogging: false }));

  // Prometheus metrics
  app.use(metricsMiddleware);
  app.get('/metrics', metricsHandler);

  // Waiting room service: default nyata di luar test; test bypass kecuali diinjeksi.
  const waitingRoom: WaitingRoomService | null =
    options.waitingRoom ??
    (env.NODE_ENV === 'test' ? null : createWaitingRoomService(WR_DEFAULT_OPTIONS));

  app.use('/api/v1', createHealthRouter(healthDeps));

  // Waiting-room status (fallback polling) TIDAK digate — user dalam antrean harus bisa polling.
  app.use('/api/v1/waiting-room', createWaitingRoomRouter(waitingRoom));

  // Gerbang waiting room (T1.13): semua request /api/v1 lainnya dihitung sebagai user aktif.
  app.use('/api/v1', createWaitingRoomMiddleware(waitingRoom));

  app.use('/api/v1/auth', createAuthRouter(waitingRoom));
  app.use('/api/v1/users', createRbacRouter());
  app.use('/api/v1/krs', createKrsRouter());
  app.use('/api/v1/finance', createFinanceRouter());
  app.use('/api/v1', createAcademicRouter());
  app.use('/api/v1/dosen', createDosenRouter());
  app.use('/api/v1', createAuditRouter());
  app.use('/api/v1', createNotificationRouter());
  app.use('/api/v1/import', createImportRouter());
  app.use('/api/v1/grades', createGradesRouter());
  app.use('/api/v1/transcript', createTranscriptRouter());
  app.use('/api/v1/schedule', createScheduleRouter());
  app.use('/api/v1/attendance', createAttendanceRouter());
  app.use('/api/v1/guidance', createGuidanceRouter());
  app.use('/api/v1/substitute', createSubstituteRouter());
  app.use('/api/v1/admin-master', createAdminMasterRouter());
  app.use('/api/v1/announcements', createAnnouncementRouter());
  app.use('/api/v1/students', createStudentProfileRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
