import { env } from '../../config/env';
import { getRedis } from '../../lib/redis';
import {
  WaitingRoomService,
  type WaitingRoomOptions,
  type WaitingRoomRedis,
} from './waiting-room.service';

/**
 * Waiting Room module barrel — T1.13 (F-17, NF-05, K-09).
 */

/** Opsi default: ambang dari env (DL-11, default 5.000), TTL sesi 15 menit. */
export const WR_DEFAULT_OPTIONS: WaitingRoomOptions = {
  threshold: env.WAITING_ROOM_THRESHOLD,
  sessionTtlMs: env.SESSION_TIMEOUT_MS,
};

/** Buat service dengan koneksi Redis shared (Redis down → bypass, allow semua). */
export function createWaitingRoomService(
  options: WaitingRoomOptions = WR_DEFAULT_OPTIONS,
): WaitingRoomService {
  return new WaitingRoomService(getRedis() as WaitingRoomRedis | undefined, options);
}

export { WaitingRoomService } from './waiting-room.service';
export type { WaitingRoomEntry, WaitingRoomStatus } from './waiting-room.service';
export { waitingRoomEvents } from './waiting-room.service';
