import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsPage } from './NotificationsPage';
import type { AppNotification } from '../lib/types';

// Mock auth — halaman tidak memakai useAuth langsung (route guard yang memanggil)
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, booting: false, logout: vi.fn() }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const NOTIFS: AppNotification[] = [
  {
    id: 1,
    title: 'Ingat: isi KRS',
    message: 'Anda belum mengisi KRS pada periode KRS Utama.',
    type: 'krs_reminder',
    isRead: false,
    createdAt: '2026-08-05T07:00:00Z',
  },
  {
    id: 2,
    title: 'KRS Disetujui',
    message: 'KRS Anda telah disetujui.',
    type: 'krs_approved',
    isRead: true,
    createdAt: '2026-08-04T07:00:00Z',
  },
];

describe('NotificationsPage (T2.5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan daftar notifikasi + badge unread count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { items: NOTIFS } })),
    );
    render(<NotificationsPage />);

    expect(await screen.findByText('Notifikasi')).toBeInTheDocument();
    expect(screen.getByText('Ingat: isi KRS')).toBeInTheDocument();
    // "KRS Disetujui" muncul 2× (badge tipe + judul notifikasi)
    expect(screen.getAllByText('KRS Disetujui').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Pengingat KRS')).toBeInTheDocument();
    expect(screen.getByText('1 belum dibaca')).toBeInTheDocument();
  });

  it('tandai dibaca → PUT + badge berkurang', async () => {
    const fetchCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        fetchCalls.push(url);
        if (url.includes('/read')) {
          return Promise.resolve(jsonResponse({ success: true, data: { id: 1, isRead: true } }));
        }
        return Promise.resolve(jsonResponse({ success: true, data: { items: NOTIFS } }));
      }),
    );
    render(<NotificationsPage />);

    const markBtn = await screen.findByRole('button', { name: /Tandai dibaca/i });
    markBtn.click();

    await waitFor(() => {
      expect(fetchCalls.some((u) => u.includes('/notifications/1/read'))).toBe(true);
    });
    // Setelah dibaca optimistik → tombol hilang, badge 0
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Tandai dibaca/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/belum dibaca/)).not.toBeInTheDocument();
  });

  it('tandai semua dibaca → PUT read-all + semua item isRead + badge hilang', async () => {
    const fetchCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        fetchCalls.push(url);
        if (url.includes('/read-all')) {
          return Promise.resolve(jsonResponse({ success: true, data: { marked: 1 } }));
        }
        return Promise.resolve(jsonResponse({ success: true, data: { items: NOTIFS } }));
      }),
    );
    render(<NotificationsPage />);

    const markAllBtn = await screen.findByRole('button', { name: /Tandai semua dibaca/i });
    markAllBtn.click();

    await waitFor(() => {
      expect(fetchCalls.some((u) => u.includes('/notifications/read-all'))).toBe(true);
    });
    // Semua item jadi isRead → tombol per-item & badge unread hilang
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /Tandai semua dibaca/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Tandai dibaca/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/belum dibaca/)).not.toBeInTheDocument();
  });

  it('tidak ada notifikasi → empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { items: [] } })),
    );
    render(<NotificationsPage />);
    expect(await screen.findByText('Belum ada notifikasi.')).toBeInTheDocument();
  });

  it('error → pesan error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat notifikasi' },
          },
          500,
        ),
      ),
    );
    render(<NotificationsPage />);
    expect(await screen.findByText('Gagal memuat notifikasi')).toBeInTheDocument();
  });
});
