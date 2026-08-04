import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { waitingRoomEvents } from './waiting-room.service';

/**
 * Socket.io untuk Waiting Room — T1.13 (K-09, docs/02 §7.1 langkah 4).
 *
 * Namespace `/waiting-room`: client connect dengan `?token=<virtual token>`,
 * join room `wr:<token>`. Saat slot bebas (logout/expiry), service meng-emit
 * 'promoted' → klien pemegang token menerima `waiting:enter_now` → frontend
 * melempar ke halaman tujuan. Fallback polling 30 detik di frontend jika
 * WebSocket gagal (K-09).
 */
export interface WaitingRoomSocket {
  notifyEnter(token: string): void;
  io: Server;
}

export function attachWaitingRoomSocket(httpServer: HttpServer): WaitingRoomSocket {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    serveClient: false,
  });
  const ns = io.of('/waiting-room');

  ns.on('connection', (socket) => {
    const token = String(socket.handshake.query.token ?? '');
    if (!token) {
      socket.disconnect(true);
      return;
    }
    socket.join(`wr:${token}`);
    logger.debug({ token }, 'waiting room socket: client bergabung');
  });

  const notifyEnter = (token: string): void => {
    ns.to(`wr:${token}`).emit('waiting:enter_now', { token });
  };

  // Slot bebas (logout/sesi kadaluarsa) → dorong pemegang token masuk.
  waitingRoomEvents.on('promoted', (promotedToken: string) => {
    notifyEnter(promotedToken);
  });

  return { notifyEnter, io };
}
