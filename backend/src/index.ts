import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { closeRedis, getRedis } from './lib/redis';
import { Pool } from 'pg';
import { createWaitingRoomService, WR_DEFAULT_OPTIONS } from './modules/waiting-room';
import { attachWaitingRoomSocket } from './modules/waiting-room/waiting-room.socket';

/**
 * Entry point backend Siak.
 * - Graceful shutdown: SIGTERM/SIGINT → stop menerima request → tutup koneksi (docs/02 §7.3).
 * - DB/Redis bersifat opsional pada T1.1 (health check menangani status not_configured/down).
 * - T1.13: HTTP server + Socket.io waiting room + sweeper sesi kadaluarsa.
 */

let pool: Pool | undefined;

function buildHealthDeps() {
  const deps: { pingDb?: () => Promise<void>; pingRedis?: () => Promise<void> } = {};

  if (env.DATABASE_URL) {
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    deps.pingDb = async () => {
      await pool!.query('SELECT 1');
    };
  }

  const redis = getRedis();
  if (redis) {
    deps.pingRedis = async () => {
      await redis.ping();
    };
  }

  return deps;
}

const app = createApp(buildHealthDeps());

// T1.13: server HTTP nyata (bukan app.listen) agar Socket.io bisa menempel.
const server = http.createServer(app);
const waitingRoom = createWaitingRoomService(WR_DEFAULT_OPTIONS);
const waitingRoomSocket = attachWaitingRoomSocket(server);

server.listen(env.PORT, () => {
  logger.info(`listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Scheduler dasar AC-04d (T1.6): ingatkan mahasiswa yang belum mengisi KRS periode aktif.
// Idempotent (sekali per mahasiswa per periode); disabled di test. Interval via env
// KRS_REMINDER_INTERVAL_MS (default 6 jam), tick pertama 1 menit setelah start.
const reminderIntervalMs = Number(process.env.KRS_REMINDER_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
if (env.NODE_ENV !== 'test' && Number.isFinite(reminderIntervalMs) && reminderIntervalMs > 0) {
  const tick = () => {
    void import('./modules/notification/index.js')
      .then(({ remindUnfilledStudents }) => remindUnfilledStudents())
      .then((notified) => {
        if (notified > 0) logger.info({ notified }, 'reminder KRS terkirim');
      })
      .catch((err: unknown) => logger.error({ err }, 'reminder KRS gagal'));
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, reminderIntervalMs).unref();
  logger.info(
    `scheduler KRS reminder aktif (interval ${Math.round(reminderIntervalMs / 60_000)} menit)`,
  );
}

// T2.5: delivery antrean notifikasi email (PENDING → SENT/FAILED, retry 3×).
// Interval via env NOTIF_DELIVERY_INTERVAL_MS (default 5 menit); disabled di test.
const notifDeliveryIntervalMs = Number(process.env.NOTIF_DELIVERY_INTERVAL_MS ?? 5 * 60 * 1000);
if (
  env.NODE_ENV !== 'test' &&
  Number.isFinite(notifDeliveryIntervalMs) &&
  notifDeliveryIntervalMs > 0
) {
  const deliveryTick = () => {
    void import('./modules/notification/index.js')
      .then(({ deliverPendingNotifications }) => deliverPendingNotifications())
      .then(({ delivered, failed }) => {
        if (delivered > 0 || failed > 0) {
          logger.info({ delivered, failed }, 'delivery notifikasi email selesai');
        }
      })
      .catch((err: unknown) => logger.error({ err }, 'delivery notifikasi email gagal'));
  };
  deliveryTick();
  setInterval(deliveryTick, notifDeliveryIntervalMs).unref();
  logger.info(
    `scheduler delivery notifikasi aktif (interval ${Math.round(notifDeliveryIntervalMs / 60_000)} menit)`,
  );
}

// T1.13: sweeper sesi waiting room kadaluarsa → bebaskan slot → promosikan antrean.
// Sesi TTL 15 menit (docs/02 §7.1); tick tiap 60 detik, unref agar tidak menahan exit.
const wrSweepIntervalMs = 60_000;
const wrSweeper = setInterval(() => {
  void waitingRoom
    .sweepExpired()
    .then((promoted) => {
      if (promoted > 0) logger.info({ promoted }, 'waiting room: slot terbebas + promosi');
    })
    .catch((err: unknown) => logger.warn({ err }, 'waiting room sweeper error'));
}, wrSweepIntervalMs);
if (env.NODE_ENV !== 'test') wrSweeper.unref();

async function shutdown(signal: string): Promise<void> {
  logger.info(`menerima ${signal} — graceful shutdown dimulai`);

  server.close(async () => {
    try {
      clearInterval(wrSweeper);
      waitingRoomSocket.io.close();
      if (pool) await pool.end();
      await closeRedis();
    } catch (err) {
      logger.error({ err }, 'error saat menutup koneksi');
    } finally {
      process.exit(0);
    }
  });

  // Jaring pengaman: paksa exit jika koneksi macet.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
