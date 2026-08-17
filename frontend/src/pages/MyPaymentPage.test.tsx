import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyPaymentPage } from './MyPaymentPage';
import type { MyPayment, KrsAccessResult } from '../lib/types';

// Mock auth — MyPaymentPage tidak pakai useAuth, tapi di-render di ProtectedRoute
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
      {
        id: 1,
        type: 'spp',
        description: 'SPP Ganjil 2024/2025',
        amount: 2750000,
        isMandatory: true,
      },
      {
        id: 2,
        type: 'biaya_dev',
        description: 'Biaya Pengembangan',
        amount: 500000,
        isMandatory: true,
      },
      {
        id: 3,
        type: 'biaya_orientasi',
        description: 'Biaya Orientasi',
        amount: 750000,
        isMandatory: false,
      },
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
    proofUrl: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-10T00:00:00Z',
    items: [
      {
        id: 4,
        type: 'spp',
        description: 'SPP Genap 2023/2024',
        amount: 2500000,
        isMandatory: true,
      },
      {
        id: 5,
        type: 'biaya_dev',
        description: 'Biaya Pengembangan',
        amount: 500000,
        isMandatory: true,
      },
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

const KRS_PERIOD_CLOSED = {
  ...KRS_PERIOD_OPEN,
  status: 'closed',
};

const KRS_OK: KrsAccessResult = {
  canAccess: true,
  payment: {
    status: 'lunas',
    totalAmount: 3000000,
    paidAmount: 3000000,
    dueDate: '2025-08-01T00:00:00Z',
  },
};

/** Konversi fixture camelCase → snake_case: mock fetch harus mencerminkan kontrak backend nyata
 *  (normalisasi snake→camel dilakukan getMyPayments di api.ts). */
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

describe('MyPaymentPage (T2.6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan tagihan mahasiswa + rincian items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) {
          return Promise.resolve(jsonResponse({ data: KRS_PERIOD_OPEN }));
        }
        if (url.includes('/krs-access')) {
          return Promise.resolve(jsonResponse({ success: true, data: KRS_OK }));
        }
        return Promise.resolve(jsonResponse({ success: true, data: PAYMENTS_SNAKE }));
      }),
    );
    render(<MyPaymentPage />);

    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();
    // Tab semester
    expect(screen.getByText('Ganjil 2024/2025 (2024/2025-1)')).toBeInTheDocument();
    expect(screen.getByText('Genap 2023/2024 (2023/2024-2)')).toBeInTheDocument();
    expect(screen.getAllByText(/4\.000\.000/).length).toBeGreaterThan(0);
  });

  it('menampilkan status belum lunas & indikator KRS diblokir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) {
          return Promise.resolve(jsonResponse({ data: KRS_PERIOD_OPEN }));
        }
        if (url.includes('/krs-access'))
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                canAccess: false,
                payment: {
                  status: 'belum_lunas',
                  totalAmount: 4000000,
                  paidAmount: 0,
                  dueDate: '2026-02-15T00:00:00Z',
                },
              },
            }),
          );
        return Promise.resolve(jsonResponse({ success: true, data: PAYMENTS_SNAKE }));
      }),
    );
    render(<MyPaymentPage />);

    expect(await screen.findByText('Belum Lunas')).toBeInTheDocument();
    expect(screen.getByText(/KRS DIBLOKIR/)).toBeInTheDocument();
  });

  it('progress bar untuk status partial', async () => {
    const partial = [
      { ...PAYMENTS[0]!, status: 'partial' as const, paidAmount: 1000000 },
      ...PAYMENTS.slice(1),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) {
          return Promise.resolve(jsonResponse({ data: KRS_PERIOD_OPEN }));
        }
        if (url.includes('/krs-access'))
          return Promise.resolve(jsonResponse({ success: true, data: KRS_OK }));
        return Promise.resolve(jsonResponse({ success: true, data: partial.map(toSnake) }));
      }),
    );
    render(<MyPaymentPage />);

    expect(await screen.findByText('Cicil')).toBeInTheDocument();
    expect(screen.getByText(/Terbayar:/)).toBeInTheDocument();
  });

  it('tidak ada tagihan → empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) {
          return Promise.resolve(jsonResponse({ data: KRS_PERIOD_CLOSED }));
        }
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
        if (url.includes('/krs/period')) {
          return Promise.resolve(jsonResponse({ data: KRS_PERIOD_CLOSED }));
        }
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat tagihan' } },
            500,
          ),
        );
      }),
    );
    render(<MyPaymentPage />);

    expect(await screen.findByText('Gagal memuat tagihan')).toBeInTheDocument();
  });

  it('fetch tagihan HANYA SEKALI — regresi loop flicker (krsPeriod via ref)', async () => {
    let paymentsCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/krs/period')) {
          return Promise.resolve(jsonResponse({ data: KRS_PERIOD_OPEN }));
        }
        if (url.includes('/krs-access')) {
          return Promise.resolve(jsonResponse({ success: true, data: KRS_OK }));
        }
        paymentsCalls += 1;
        return Promise.resolve(jsonResponse({ success: true, data: PAYMENTS_SNAKE }));
      }),
    );
    render(<MyPaymentPage />);

    expect(await screen.findByText('Tagihan Saya')).toBeInTheDocument();
    // Beri waktu beberapa tick: bila ada loop dependency (krsPeriod state), fetch
    // akan berulang tanpa henti — test ini gagal sebelum fix (paymentsCalls >> 1).
    await new Promise((r) => setTimeout(r, 150));
    expect(paymentsCalls).toBe(1);
  });
});
