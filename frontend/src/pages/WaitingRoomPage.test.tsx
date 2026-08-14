import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WAITING_TOKEN_KEY } from '../lib/api';
import { WaitingRoomPage } from './WaitingRoomPage';

/** Mini event-emitter untuk fake socket. */
function createFakeSocket() {
  const handlers = new Map<string, Array<(data?: unknown) => void>>();
  const socket = {
    on: vi.fn((event: string, cb: (data?: unknown) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
      return socket;
    }),
    disconnect: vi.fn(),
    emit: (event: string, data?: unknown) => {
      for (const cb of handlers.get(event) ?? []) cb(data);
    },
  };
  return { socket, emit: socket.emit };
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tunggu']}>
      <Routes>
        <Route path="/tunggu" element={<WaitingRoomPage />} />
        <Route path="/" element={<div>HOME-DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function statusResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data: payload }),
  } as unknown as Response;
}

describe('WaitingRoomPage (T1.13)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('tanpa token antrean → langsung kembali ke dashboard', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('HOME-DASHBOARD')).toBeInTheDocument();
    });
  });

  it('menampilkan posisi antrean dari polling status', async () => {
    sessionStorage.setItem(WAITING_TOKEN_KEY, 'wr-pos');
    const fetchMock = vi.fn().mockResolvedValue(statusResponse({ status: 'waiting', position: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    expect(
      await screen.findByText('Menunggu slot masuk', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  it('status enter (slot bebas) → token dihapus + kembali ke dashboard', async () => {
    sessionStorage.setItem(WAITING_TOKEN_KEY, 'wr-enter');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(statusResponse({ status: 'enter' })));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('HOME-DASHBOARD')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem(WAITING_TOKEN_KEY)).toBeNull();
  });

  it('WebSocket waiting:enter_now → langsung masuk (push real-time)', async () => {
    sessionStorage.setItem(WAITING_TOKEN_KEY, 'wr-push');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(statusResponse({ status: 'waiting', position: 2 })),
    );

    const { socket, emit } = createFakeSocket();
    const { io } = await import('socket.io-client');
    vi.mocked(io).mockReturnValue(socket as never);

    renderPage();
    await waitFor(() => {
      expect(socket.on).toHaveBeenCalledWith('waiting:enter_now', expect.any(Function));
    });

    emit('waiting:enter_now', { token: 'wr-push' });
    await waitFor(() => {
      expect(screen.getByText('HOME-DASHBOARD')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem(WAITING_TOKEN_KEY)).toBeNull();

    // Tunggu cleanup useEffect (disconnect dipanggil saat unmount)
    await waitFor(() => {
      expect(socket.disconnect).toHaveBeenCalled();
    });
  });
});
