import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyPaymentPage } from './MyPaymentPage';
import type { MyPayment, KrsAccessResult } from '../lib/types';

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

const PAYMENTS: MyPayment[] = [
  {
    id: 1,
    studentId: 7,
    nim: '20240001',
    fullName: 'Budi',
    prodiId: 1,
    prodiName: 'Teknik Informatika',
    semesterId: 3,
    semesterCode: '2024/2025-1',
    semesterName: 'Ganjil 2024/2025',
    totalAmount: 4000000,
    paidAmount: 0,
    status: 'belum_lunas',
    dueDate: '2026-02-15T00:00:00Z',
    isWaived: false,
    waivedReason: null,
    proofUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    items: [
      { id: 1, type: 'spp', description: 'SPP Ganjil 2024/2025', amount: 2750000, isMandatory: true },
      { id: 2, type: 'biaya_dev', description: 'Biaya Pengembangan', amount: 500000, isMandatory: true },
      { id: 3, type: 'biaya_orientasi', description: 'Biaya Orientasi', amount: 750000, isMandatory: false },
    ],
  },
  {
    id: 2,
    studentId: 7,
    nim: '20240001',
    fullName: 'Budi',
    prodiId: 1,
    prodiName: 'Teknik Informatika',
    semesterId: 2,
    semesterCode: '2023/2024-2',
    semesterName: 'Genap 2023/2024',
    totalAmount: 3000000,
    paidAmount: 3000000,
    status: 'lunas',
    dueDate: '2025-08-01T00:00:00Z',
    isWaived: false,
    waivedReason: null,
    proofUrl: 'https://example.com/bukti.pdf',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-10T00:00:00Z',
    items: [
      { id: 4, type: 'spp', description: 'SPP Genap 2023/2024', amount: 2500000, isMandatory: true },
      { id: 5, type: 'biaya_dev', description: 'Biaya Pengembangan', amount: 500000, isMandatory: true },
    ],
  },
  {
    id: 3,
    studentId: 7,
    nim: '20240001',
    fullName: 'Budi',
    prodiId: 1,
    prodiName: 'Teknik Informatika',
    semesterId: 4,
    semesterCode: '2024/2025-2',
    semesterName: 'Genap 2024/2025',
    totalAmount: 3500000,
    paidAmount: 1500000,
    status: 'partial',
    dueDate: '2026-08-01T00:00:00Z',
    isWaived: false,
    waivedReason: null,
    proofUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    items: [
      { id: 6, type: 'spp', description: 'SPP Genap 2024/2025', amount: 2500000, isMandatory: true },
      { id: 7, type: 'biaya_dev', description: 'Biaya Pengembangan', amount: 500000, isMandatory: true },
      { id: 8, type: 'asuransi', description: 'Asuransi Kesehatan', amount: 500000, isMandatory: false },
    ],
  },
];

const KRS_PERIOD_OPEN = {
  id: 1,
  semesterId: 3,
  semesterCode: '2024/2025-1',
  name: 'Ganjil 2024/2025',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-06-30T00:00:00Z',
  isRevision: false,
  status: 'open',
};

const KRS_PERIOD_CLOSED = { ...KRS_PERIOD_OPEN, status: 'closed' };

const KRS_OK: KrsAccessResult = {
  canAccess: true,
  payment: { status: 'lunas', totalAmount: 3000000, paidAmount: 3000000, dueDate: '2025-08-01T00:00:00Z' },
};

function toSnake(p: MyPayment): Record<string, unknown> {
  return {
    id: p.id,
    student_id: p.studentId,
    nim: p.nim,
    full_name: p.fullName,
    prodi_id: p.prodiId,
    prodi_name: p.prodiName,
    semester_id: p.semesterId,
    semester_code: p.semesterCode,
    semester_name: p.semesterName,
    total_amount: p.totalAmount,
    paid_amount: p.paidAmount,
    status: p.status,
    due_date: p.dueDate,
    is_waived: p.isWaived,
    waived_reason: p.waivedReason,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    proof_url: p.proofUrl,
    items: p.items.map((it) => ({
      id: it.id,
      type: it.type,
      description: it.description,
      amount: it.amount,
      is_mandatory: it.isMandatory,
    })),
  };
}

const PAYMENTS_SNAKE = PAYMENTS.map(toSnake);

function mockFetch(
  payments: Record<string, unknown>[] = PAYMENTS_SNAKE,
  krsResult: KrsAccessResult = KRS_OK,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.includes('/krs/period')) {
        return Promise.resolve(jsonResponse({ data: KRS_PERIOD_OPEN }));
      }
      if (url.includes('/krs-access')) {
        return Promise.resolve(jsonResponse({ success: true, data: krsResult }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: payments }));
    }),
  );
}

describe('MyPaymentPage (T2.6) - All semesters table', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan semua tagihan dalam tabel', async () => {
    mockFetch();
    render(<MyPaymentPage />);

    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();
    expect(screen.getByText('Ganjil 2024/2025 (2024/2025-1)')).toBeInTheDocument();
    expect(screen.getByText('Genap 2023/2024 (2023/2024-2)')).toBeInTheDocument();
    expect(screen.getAllByText('Belum Lunas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lunas').length).toBeGreaterThan(0);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('menampilkan status belum lunas & indikator KRS diblokir', async () => {
    mockFetch(PAYMENTS_SNAKE, {
      canAccess: false,
      payment: { status: 'belum_lunas', totalAmount: 4000000, paidAmount: 0, dueDate: '2026-02-15T00:00:00Z' },
    });
    render(<MyPaymentPage />);

    expect(await screen.findByText('Belum Lunas')).toBeInTheDocument();
    expect(screen.getByText(/KRS DIBLOKIR/)).toBeInTheDocument();
  });

  it('tidak ada tagihan → empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) return Promise.resolve(jsonResponse({ data: KRS_PERIOD_CLOSED }));
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }),
    );
    render(<MyPaymentPage />);
    expect(await screen.findByText('Belum ada tagihan')).toBeInTheDocument();
  });

  it('error → pesan error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) return Promise.resolve(jsonResponse({ data: KRS_PERIOD_CLOSED }));
        return Promise.resolve(
          jsonResponse({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat tagihan' } }, 500),
        );
      }),
    );
    render(<MyPaymentPage />);
    expect(await screen.findByText('Gagal memuat tagihan')).toBeInTheDocument();
  });

  it('fetch tagihan HANYA SEKALI — regresi loop flicker', async () => {
    let paymentsCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) return Promise.resolve(jsonResponse({ data: KRS_PERIOD_OPEN }));
        if (url.includes('/krs-access')) return Promise.resolve(jsonResponse({ success: true, data: KRS_OK }));
        paymentsCalls += 1;
        return Promise.resolve(jsonResponse({ success: true, data: PAYMENTS_SNAKE }));
      }),
    );
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 150));
    expect(paymentsCalls).toBe(1);
  });

  it('klik Detail → buka modal rincian tagihan', async () => {
    mockFetch();
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();

    // Klik tombol Detail pertama
    const detailButtons = screen.getAllByText('Detail');
    fireEvent.click(detailButtons[0]);

    // Modal muncul
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Rincian Tagihan')).toBeInTheDocument();
    // Items muncul di modal
    expect(screen.getByText('SPP')).toBeInTheDocument();
  });

  it('modal: tutup pakai tombol ×', async () => {
    mockFetch();
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Detail')[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Tutup'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('modal: tutup pakai klik overlay', async () => {
    mockFetch();
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Detail')[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog); // click overlay
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('modal: tutup pakai tombol Tutup di footer', async () => {
    mockFetch();
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Detail')[0]);
    fireEvent.click(screen.getByText('Tutup', { selector: 'button' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('modal lunas → tampilkan link bukti pembayaran', async () => {
    mockFetch();
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();

    // Klik Detail pada baris lunas (Genap 2023/2024)
    const detailButtons = screen.getAllByText('Detail');
    fireEvent.click(detailButtons[1]);

    expect(screen.getByText('Bukti Pembayaran')).toBeInTheDocument();
    expect(screen.getByText('Lihat Bukti Pembayaran →')).toHaveAttribute('href', 'https://example.com/bukti.pdf');
  });

  it('modal partial → tampilkan progress bar', async () => {
    mockFetch();
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();

    // Klik Detail pada baris partial (Genap 2024/2025, index 2)
    const detailButtons = screen.getAllByText('Detail');
    fireEvent.click(detailButtons[2]);

    // Modal muncul dengan progress bar
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Terbayar:/)).toBeInTheDocument();
    expect(screen.getByText(/Sisa:/)).toBeInTheDocument();
  });

  it('tabel menampilkan kolom Bukti — link untuk lunas, — untuk lainnya', async () => {
    mockFetch();
    render(<MyPaymentPage />);
    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();

    // Link "Lihat" untuk lunas
    expect(screen.getByText('Lihat')).toHaveAttribute('href', 'https://example.com/bukti.pdf');
    // "—" untuk belum lunas
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
