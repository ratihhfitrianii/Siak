import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminKrsPage } from './AdminKrsPage';
import type { AdminKrsItem } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const PENDING: AdminKrsItem[] = [
  {
    id: 1,
    nim: '2024001',
    studentName: 'Budi Santoso',
    prodiCode: 'IF',
    submittedAt: '2026-08-01T08:30:00.000Z',
    itemCount: 6,
    totalCredits: 20,
  },
  {
    id: 2,
    nim: '2024002',
    studentName: 'Siti Aminah',
    prodiCode: 'SI',
    submittedAt: '2026-08-01T09:00:00.000Z',
    itemCount: 5,
    totalCredits: 18,
  },
];

interface AdminMocks {
  pending?: AdminKrsItem[];
  pendingStatus?: number;
  approveBody?: (body: unknown) => void;
  rejectBody?: (body: unknown) => void;
  failApprove?: boolean;
}

/** Mock fetch yang merutekan endpoint admin KRS; POST approve/reject dicatat untuk asersi. */
function mockAdminRoutes({
  pending = PENDING,
  pendingStatus = 200,
  approveBody,
  rejectBody,
  failApprove = false,
}: AdminMocks = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const u = String(url);
    if (method === 'POST' && u.includes('/approve')) {
      approveBody?.(JSON.parse(String(init?.body ?? '{}')));
      if (failApprove) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'KRS_NOT_PENDING', message: 'KRS sudah diproses' } },
            409,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({ success: true, data: { id: 1, status: 'approved', approvedBy: 3 } }),
      );
    }
    if (method === 'POST' && u.includes('/reject')) {
      rejectBody?.(JSON.parse(String(init?.body)));
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { id: 1, status: 'rejected', rejectionReason: 'Alasan penolakan' },
        }),
      );
    }
    if (u.includes('/krs/admin/pending')) {
      return Promise.resolve(
        jsonResponse(
          pendingStatus === 200
            ? { success: true, data: { items: pending } }
            : { success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat' } },
          pendingStatus,
        ),
      );
    }
    return Promise.resolve(jsonResponse({ success: true, data: null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AdminKrsPage (T1.11c)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan daftar pengajuan menunggu persetujuan', async () => {
    mockAdminRoutes();
    render(<AdminKrsPage />);

    expect(await screen.findByText('Persetujuan KRS')).toBeInTheDocument();
    expect(screen.getByText('2 pengajuan menunggu keputusan Anda.')).toBeInTheDocument();
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('2024001')).toBeInTheDocument();
    expect(screen.getByText('Siti Aminah')).toBeInTheDocument();
    // kolom SKS per baris
    expect(screen.getAllByRole('button', { name: 'Setujui' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Tolak' })).toHaveLength(2);
  });

  it('menampilkan state kosong bila tidak ada pengajuan', async () => {
    mockAdminRoutes({ pending: [] });
    render(<AdminKrsPage />);

    expect(await screen.findByText('Semua pengajuan KRS sudah diproses. 🎉')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('menampilkan error dan bisa Coba lagi', async () => {
    const fetchMock = mockAdminRoutes({ pendingStatus: 500 });
    render(<AdminKrsPage />);

    expect(await screen.findByText('Gagal memuat')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Coba lagi' });
    // perbaiki mock → pending kembali
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/krs/admin/pending')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: PENDING } }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });
    await userEvent.setup().click(retry);
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
  });

  it('Setujui → POST /admin/:id/approve lalu list dimuat ulang', async () => {
    const user = userEvent.setup();
    const approveBody = vi.fn();
    const fetchMock = mockAdminRoutes({ approveBody });
    let calls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      if (method === 'POST' && u.includes('/approve')) {
        approveBody?.(JSON.parse(String(init?.body ?? '{}')));
        return Promise.resolve(
          jsonResponse({ success: true, data: { id: 1, status: 'approved', approvedBy: 3 } }),
        );
      }
      if (u.includes('/krs/admin/pending')) {
        calls += 1;
        // setelah approve: daftar tinggal 1 item
        const remaining = calls >= 2 ? [PENDING[1]] : PENDING;
        return Promise.resolve(jsonResponse({ success: true, data: { items: remaining } }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    render(<AdminKrsPage />);
    await screen.findByText('Budi Santoso');

    const approveButtons = screen.getAllByRole('button', { name: 'Setujui' });
    await user.click(approveButtons[0]);

    await vi.waitFor(() => expect(approveBody).toHaveBeenCalledTimes(1));
    expect(approveBody).toHaveBeenCalledWith({});
    // list dimuat ulang → Budi hilang
    await vi.waitFor(() => expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument());
    expect(screen.getByText('1 pengajuan menunggu keputusan Anda.')).toBeInTheDocument();
  });

  it('approve gagal (409) → pesan error inline', async () => {
    const user = userEvent.setup();
    mockAdminRoutes({ failApprove: true });
    render(<AdminKrsPage />);

    await screen.findByText('Budi Santoso');
    const approveButtons = screen.getAllByRole('button', { name: 'Setujui' });
    await user.click(approveButtons[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('KRS sudah diproses');
  });

  it('Tolak → dialog alasan (validasi min 5) → POST /admin/:id/reject', async () => {
    const user = userEvent.setup();
    const rejectBody = vi.fn();
    const fetchMock = mockAdminRoutes({ rejectBody });
    let calls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      if (method === 'POST' && u.includes('/reject')) {
        rejectBody?.(JSON.parse(String(init?.body)));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { id: 1, status: 'rejected', rejectionReason: 'SKS melebihi batas' },
          }),
        );
      }
      if (u.includes('/krs/admin/pending')) {
        calls += 1;
        const remaining = calls >= 2 ? [PENDING[1]] : PENDING;
        return Promise.resolve(jsonResponse({ success: true, data: { items: remaining } }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    render(<AdminKrsPage />);
    await screen.findByText('Budi Santoso');

    const rejectButtons = screen.getAllByRole('button', { name: 'Tolak' });
    await user.click(rejectButtons[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Tolak KRS' });
    const submitBtn = within(dialog).getByRole('button', { name: 'Tolak KRS' });
    expect(submitBtn).toBeDisabled(); // alasan masih kosong

    await user.type(within(dialog).getByPlaceholderText(/Contoh:/), 'SKS melebihi batas');
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    await vi.waitFor(() => expect(rejectBody).toHaveBeenCalledTimes(1));
    expect(rejectBody).toHaveBeenCalledWith({ reason: 'SKS melebihi batas' });
    await vi.waitFor(() => expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Tolak → Batal → dialog tertutup tanpa POST', async () => {
    const user = userEvent.setup();
    const rejectBody = vi.fn();
    mockAdminRoutes({ rejectBody });
    render(<AdminKrsPage />);

    await screen.findByText('Budi Santoso');
    const rejectButtons = screen.getAllByRole('button', { name: 'Tolak' });
    await user.click(rejectButtons[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Tolak KRS' });
    await user.click(within(dialog).getByRole('button', { name: 'Batal' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rejectBody).not.toHaveBeenCalled();
  });

  it('Tolak → alasan < 5 karakter → tombol Tolak KRS disabled', async () => {
    const user = userEvent.setup();
    const rejectBody = vi.fn();
    mockAdminRoutes({ rejectBody });
    render(<AdminKrsPage />);

    await screen.findByText('Budi Santoso');
    const rejectButtons = screen.getAllByRole('button', { name: 'Tolak' });
    await user.click(rejectButtons[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Tolak KRS' });
    const submitBtn = within(dialog).getByRole('button', { name: 'Tolak KRS' });
    await user.type(within(dialog).getByPlaceholderText(/Contoh:/), 'ABC'); // < 5
    expect(submitBtn).toBeDisabled();
    await user.type(within(dialog).getByPlaceholderText(/Contoh:/), 'ABCD'); // = 5
    expect(submitBtn).toBeEnabled();
  });

  it('error approve (non-409) → pesan error generic', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAdminRoutes();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      if (method === 'POST' && u.includes('/approve')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'INTERNAL_ERROR', message: 'Server error' } },
            500,
          ),
        );
      }
      if (u.includes('/krs/admin/pending')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: PENDING } }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    render(<AdminKrsPage />);
    await screen.findByText('Budi Santoso');
    const approveButtons = screen.getAllByRole('button', { name: 'Setujui' });
    await user.click(approveButtons[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  });
});
