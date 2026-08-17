import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinancePaymentsPage } from './FinancePaymentsPage';

// Mock auth — FinancePaymentsPage tidak pakai useAuth
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

/** Backend snake_case shape — normalisasi oleh normalizePayment di api.ts */
const PAYMENT_ROW = {
  id: 1,
  student_id: 10,
  nim: '20240001',
  full_name: 'Andi',
  prodi_id: 1,
  prodi_name: 'Teknik Informatika',
  semester_id: 3,
  semester_code: '2024/2025-1',
  semester_name: 'Ganjil 2024/2025',
  total_amount: 4000000,
  paid_amount: 0,
  status: 'belum_lunas',
  due_date: '2026-02-15T00:00:00Z',
  is_waived: false,
  waived_reason: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  items: [],
};

const LIST_RESPONSE = {
  success: true,
  data: { items: [PAYMENT_ROW], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
};

const SEMESTERS = [
  { id: 5, code: '2025/2026-1', name: 'Ganjil 2025/2026' },
  { id: 3, code: '2024/2025-1', name: 'Ganjil 2024/2025' },
];

const fetchMock = (url: string) => {
  if (url.includes('/semesters')) {
    return Promise.resolve(jsonResponse({ success: true, data: SEMESTERS }));
  }
  if (url.includes('/update')) {
    return Promise.resolve(jsonResponse({ success: true, data: { id: 1 } }));
  }
  return Promise.resolve(jsonResponse(LIST_RESPONSE));
};

describe('FinancePaymentsPage (T2.6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan daftar tagihan + filter semester/status', async () => {
    vi.stubGlobal('fetch', vi.fn(fetchMock));
    render(<FinancePaymentsPage />);

    expect(await screen.findByText('Kelola Tagihan')).toBeInTheDocument();
    expect(screen.getByText('20240001')).toBeInTheDocument();
    expect(screen.getByText('Andi')).toBeInTheDocument();
    expect(screen.getAllByText('Belum Lunas').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\.000\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /Generate Tagihan/i })).toBeInTheDocument();
    // Keluhan #15/#16: opsi semester dari API (bukan hardcoded)
    expect(
      await screen.findByRole('option', { name: 'Ganjil 2024/2025 (2024/2025-1)' }),
    ).toBeInTheDocument();
  });

  it('update status bayar via modal → POST + refresh', async () => {
    const fetchCalls: string[] = [];
    const fetchSpy = vi.fn((url: string) => {
      fetchCalls.push(url);
      return fetchMock(url);
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('alert', vi.fn());
    render(<FinancePaymentsPage />);

    const updateBtn = await screen.findByRole('button', { name: /Update/i });
    updateBtn.click();

    // Modal terbuka — isi jumlah
    await waitFor(() => expect(screen.getByText('Update Pembayaran')).toBeInTheDocument());
    const amountInput = screen.getByPlaceholderText('Masukkan jumlah');
    // Simulate user typing
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    nativeInputValueSetter.call(amountInput, '2000000');
    amountInput.dispatchEvent(new Event('input', { bubbles: true }));
    amountInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Click Simpan
    const simpanBtn = screen.getByRole('button', { name: /Simpan/i });
    simpanBtn.click();

    await waitFor(() => {
      expect(fetchCalls.some((u) => u.includes('/payments/1/update'))).toBe(true);
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('generate tagihan tanpa memilih semester → tombol disabled (guard)', async () => {
    vi.stubGlobal('fetch', vi.fn(fetchMock));
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    render(<FinancePaymentsPage />);

    const generateBtn = await screen.findByRole('button', { name: /Generate Tagihan/i });
    // Tanpa semester terpilih, tombol disabled (guard di JSX) → handler tak jalan
    expect(generateBtn).toBeDisabled();
    generateBtn.click();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('generate tagihan dengan semester terpilih → POST generate + refresh', async () => {
    const fetchCalls: string[] = [];
    const fetchSpy = vi.fn((url: string) => {
      fetchCalls.push(url);
      if (url.includes('/generate')) {
        return Promise.resolve(jsonResponse({ success: true, data: { message: 'ok' } }));
      }
      return fetchMock(url);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    render(<FinancePaymentsPage />);

    // Tunggu opsi semester dari API, lalu pilih (select pertama = filter semester)
    await screen.findByRole('option', { name: 'Ganjil 2024/2025 (2024/2025-1)' });
    const semesterSelect = (await screen.findAllByRole('combobox'))[0] as HTMLSelectElement;
    semesterSelect.value = '3';
    semesterSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const generateBtn = await screen.findByRole('button', { name: /Generate Tagihan/i });
    expect(generateBtn).not.toBeDisabled();
    generateBtn.click();

    await waitFor(() => {
      expect(fetchCalls.some((u) => u.includes('/generate'))).toBe(true);
    });
    expect(alertSpy).toHaveBeenCalledWith('Tagihan berhasil di-generate untuk semester ini');
  });

  it('update dengan jumlah tidak valid → alert', async () => {
    vi.stubGlobal('fetch', vi.fn(fetchMock));
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    render(<FinancePaymentsPage />);

    const updateBtn = await screen.findByRole('button', { name: /Update/i });
    updateBtn.click();

    // Modal terbuka — isi jumlah invalid
    await waitFor(() => expect(screen.getByText('Update Pembayaran')).toBeInTheDocument());
    const amountInput = screen.getByPlaceholderText('Masukkan jumlah');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    nativeInputValueSetter.call(amountInput, '-100');
    amountInput.dispatchEvent(new Event('input', { bubbles: true }));
    amountInput.dispatchEvent(new Event('change', { bubbles: true }));

    const simpanBtn = screen.getByRole('button', { name: /Simpan/i });
    simpanBtn.click();

    expect(alertSpy).toHaveBeenCalledWith('Jumlah tidak valid');
  });

  it('tidak ada data → empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/semesters')) {
          return Promise.resolve(jsonResponse({ success: true, data: SEMESTERS }));
        }
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
          }),
        );
      }),
    );
    render(<FinancePaymentsPage />);
    expect(await screen.findByText('Tidak ada data tagihan untuk filter ini')).toBeInTheDocument();
  });

  it('error → pesan error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat daftar tagihan' },
          },
          500,
        ),
      ),
    );
    render(<FinancePaymentsPage />);
    expect(await screen.findByText('Gagal memuat daftar tagihan')).toBeInTheDocument();
  });

  it('detail modal — klik Detail → fetch /payments/:id → tampilkan rincian items', async () => {
    const detailRow = {
      ...PAYMENT_ROW,
      items: [
        {
          id: 1,
          type: 'spp',
          description: 'SPP Ganjil 2024/2025',
          amount: 2750000,
          is_mandatory: true,
        },
        {
          id: 2,
          type: 'biaya_dev',
          description: 'Biaya Pengembangan',
          amount: 500000,
          is_mandatory: true,
        },
      ],
    };
    const fetchSpy = vi.fn((url: string) => {
      if (url.includes('/payments/1')) {
        return Promise.resolve(jsonResponse({ success: true, data: detailRow }));
      }
      if (url.includes('/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: SEMESTERS }));
      }
      return Promise.resolve(jsonResponse(LIST_RESPONSE));
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('alert', vi.fn());
    render(<FinancePaymentsPage />);

    const detailBtn = await screen.findByRole('button', { name: /Detail/i });
    detailBtn.click();

    expect(await screen.findByText(/Rincian Tagihan: 20240001 - Andi/)).toBeInTheDocument();
    expect(screen.getByText('SPP Ganjil 2024/2025')).toBeInTheDocument();
    expect(screen.getByText('Biaya Pengembangan')).toBeInTheDocument();
    expect(screen.getAllByText(/2\.750\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/500\.000/).length).toBeGreaterThan(0);

    // Tutup modal (tombol silang & tombol "Tutup" di bawah)
    const closeBtns = screen.getAllByRole('button', { name: /Tutup/i });
    closeBtns[0].click();
    await waitFor(() => {
      expect(screen.queryByText(/Rincian Tagihan/)).not.toBeInTheDocument();
    });
  });
});
