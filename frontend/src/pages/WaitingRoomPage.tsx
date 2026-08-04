import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  clearWaitingToken,
  getWaitingRoomStatus,
  getWaitingToken,
} from '../lib/api';

/**
 * Halaman Waiting Room — T1.13 (F-17, NF-05, K-09).
 *
 * Alur (docs/02 §7.1):
 * 1. Request kena 429 RATE_LIMITED → api.ts menyimpan token antrean (sessionStorage)
 *    dan mengarahkan ke /tunggu.
 * 2. Halaman ini mencoba WebSocket (socket.io /waiting-room?token=...) untuk
 *    push real-time; jika gagal/tidak tersedia → polling fallback setiap 15 detik.
 * 3. Status 'enter' (slot bebas) → token dihapus → kembali ke '/'.
 *
 * UI estetik sesuai konvensi: kartu rounded-2xl, Tailwind, teks informatif.
 */

const POLL_INTERVAL_MS = 15_000;

interface SocketLike {
  on: (event: string, cb: (data?: unknown) => void) => SocketLike;
  disconnect: () => void;
}

export function WaitingRoomPage() {
  const navigate = useNavigate();
  const tokenRef = useRef<string | null>(null);
  const socketRef = useRef<SocketLike | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Masuk aplikasi: hapus token + kembali ke dashboard.
  const enter = () => {
    clearWaitingToken();
    navigate('/', { replace: true });
  };

  useEffect(() => {
    const token = getWaitingToken();
    if (!token) {
      // Tidak ada antrean tersimpan — kemungkinan akses langsung. Kembali ke dashboard.
      navigate('/', { replace: true });
      return;
    }
    tokenRef.current = token;

    let disposed = false;

    // Fallback polling (K-09) — berjalan selalu; idempoten terhadap push WebSocket.
    const poll = async () => {
      try {
        const status = await getWaitingRoomStatus(token);
        if (disposed) return;
        if (status.status === 'enter') {
          enter();
          return;
        }
        setPosition(status.status === 'waiting' ? status.position : null);
        setError(null);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Gagal memeriksa status antrean');
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

    // Push real-time via WebSocket — lazy import agar bundle utama tetap kecil.
    void import('socket.io-client')
      .then(({ io }) => {
        if (disposed) return;
        const socket = io('/waiting-room', {
          path: '/socket.io',
          query: { token },
        }) as unknown as SocketLike;
        socketRef.current = socket;
        socket.on('waiting:enter_now', () => {
          if (!disposed) {
            enter();
          }
        });
        socket.on('connect_error', () => {
          // WebSocket gagal → polling fallback tetap berjalan. Tenang saja.
        });
      })
      .catch(() => {
        // socket.io-client tak termuat (offline bundle?) → polling tetap jalan.
      });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div
          className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600"
          aria-hidden
        />
        <h1 className="mt-6 text-lg font-bold text-slate-900">Menunggu slot masuk</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sistem sedang ramai. Anda akan masuk otomatis saat ada slot kosong —{' '}
          <strong>jangan tutup halaman ini</strong>.
        </p>

        {position !== null && (
          <div className="mt-6 rounded-xl bg-primary-50 px-4 py-3">
            <p className="text-sm text-slate-600">Posisi Anda di antrean</p>
            <p className="text-3xl font-extrabold text-primary-700">{position}</p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {error} — mencoba lagi secara otomatis…
          </p>
        )}

        <p className="mt-6 text-xs text-slate-400">
          Halaman ini menyegarkan status secara otomatis. Anda juga dapat membuka
          aplikasi di tab lain setelah posisi Anda mencapai 1.
        </p>
      </div>
    </div>
  );
}

/** Di-expose untuk test: konstanta polling. */
export { POLL_INTERVAL_MS };
