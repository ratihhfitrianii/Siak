import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancePayrollPage } from './FinancePayrollPage';
import * as api from '../lib/api';
import type { SalarySlip } from '../lib/types';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, username: 'keuangan' }, booting: false, logout: vi.fn() }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getPayrolls: vi.fn(),
    generatePayrollBatch: vi.fn(),
    approvePayroll: vi.fn(),
    payPayroll: vi.fn(),
    listProdis: vi.fn(),
  };
});

const mockedGet = vi.mocked(api.getPayrolls);
const mockedGenerate = vi.mocked(api.generatePayrollBatch);
const mockedApprove = vi.mocked(api.approvePayroll);
const mockedPay = vi.mocked(api.payPayroll);
const mockedProdis = vi.mocked(api.listProdis);

const PRODIS = {
  items: [
    { id: 1, code: 'TI', name: 'Teknik Informatika' },
    { id: 2, code: 'SI', name: 'Sistem Informasi' },
  ],
  pagination: { page: 1, limit: 10, total: 2 },
};

/** Generator payroll mock — nama unik agar sort/pagination bisa diuji. id mulai dari 1. */
function makeItem(i: number, status: 'draft' | 'approved' | 'paid'): SalarySlip {
  return {
    id: i + 1,
    lecturerId: 101 + i,
    lecturerName: `Dosen ${String(i + 1).padStart(2, '0')}`,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    baseSalary: 4000000 + i * 100000,
    honorPerMeeting: 100000,
    totalMeetings: 8,
    totalHonor: 800000,
    deductions: 0,
    netAmount: 4800000 + i * 100000,
    status,
  };
}

// 13 item → 2 halaman @10
const PAYROLLS_BANYAK = {
  items: Array.from({ length: 13 }, (_, i) => makeItem(i, i < 5 ? 'draft' : 'paid')),
  total: 13,
  page: 1,
  limit: 100,
  totalPages: 1,
};

const PAYROLLS_CAMPUR = {
  items: [
    makeItem(0, 'draft'),
    { ...makeItem(1, 'approved') },
    { ...makeItem(2, 'paid'), baseSalary: 9999999, netAmount: 10799999 },
  ],
  total: 3,
  page: 1,
  limit: 100,
  totalPages: 1,
};

describe('FinancePayrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(PAYROLLS_CAMPUR);
    mockedProdis.mockResolvedValue(PRODIS as unknown as Awaited<ReturnType<typeof api.listProdis>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('render tabel payroll dengan nama dosen, rupiah, dan status badge', async () => {
    render(<FinancePayrollPage />);
    expect(await screen.findByText('Dosen 01')).toBeInTheDocument();
    expect(screen.getByText('Dosen 02')).toBeInTheDocument();
    expect(screen.getByText('Rp 10.799.999')).toBeInTheDocument();
    expect(screen.getAllByText('Draft').length).toBe(1);
    expect(screen.getAllByText('Disetujui').length).toBe(1);
    expect(screen.getAllByText('Dibayar').length).toBe(1);
  });

  it('aksi per status: draft→Approve, approved→Tandai Dibayar, paid→tanpa tombol', async () => {
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockedApprove).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: /Tandai Dibayar/ }));
    expect(mockedPay).toHaveBeenCalledWith(2);
    // Paid → tidak ada tombol aksi (hanya teks)
    expect(screen.getByText('Selesai ✓')).toBeInTheDocument();
    expect(mockedApprove).toHaveBeenCalledTimes(1);
  });

  it('tombol Generate memanggil API dgn periode bulan terpilih lalu reload', async () => {
    const user = userEvent.setup();
    mockedGenerate.mockResolvedValue('Daftar gaji digenerate untuk 3 dosen');
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');

    await user.click(screen.getByRole('button', { name: /Generate Daftar Gaji/ }));
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    const [start, end] = mockedGenerate.mock.calls[0];
    expect(start).toMatch(/-01$/);
    expect(end).toMatch(/-(28|29|30|31)$/);
    expect(await screen.findByRole('status')).toHaveTextContent(/3 dosen/);
  });

  it('kosong → pesan ajak generate', async () => {
    mockedGet.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    render(<FinancePayrollPage />);
    expect(await screen.findByText(/Belum ada daftar gaji untuk/)).toBeInTheDocument();
  });

  it('error load → pesan gagal memuat', async () => {
    mockedGet.mockRejectedValue(new Error('500'));
    render(<FinancePayrollPage />);
    expect(await screen.findByText('Gagal memuat data payroll')).toBeInTheDocument();
  });

  it('search live: >=3 karakter otomatis memicu getPayrolls dgn q (tanpa tombol)', async () => {
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');
    mockedGet.mockClear();

    // 2 karakter → debounce selesai tapi belum mencari
    await user.type(screen.getByLabelText('Cari Dosen'), 'Do');
    await waitFor(() => {
      const callsWith2 = mockedGet.mock.calls.filter((c) => c[0]?.q === 'Do');
      expect(callsWith2.length).toBe(0);
    });

    // karakter ke-3 → setelah debounce ~300ms, cari
    await user.type(screen.getByLabelText('Cari Dosen'), 's');
    await waitFor(() => {
      expect(mockedGet.mock.calls.at(-1)?.[0]?.q).toBe('Dos');
    });

    // hapus semua → reset q
    await user.clear(screen.getByLabelText('Cari Dosen'));
    await waitFor(() => {
      expect(mockedGet.mock.calls.at(-1)?.[0]?.q).toBeUndefined();
    });
  });

  it('dropdown prodi terisi dari listProdis + pilih prodi → getPayrolls dengan prodi_id', async () => {
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');

    await user.selectOptions(screen.getByLabelText('Prodi'), '1');
    let lastCall = mockedGet.mock.calls.at(-1)?.[0];
    expect(lastCall?.prodiId).toBe(1);

    // Kembali ke Semua Prodi
    await user.selectOptions(screen.getByLabelText('Prodi'), '');
    lastCall = mockedGet.mock.calls.at(-1)?.[0];
    expect(lastCall?.prodiId).toBeUndefined();
  });

  it('sort kolom: klik header Dosen toggle asc/desc; klik Total urutkan angka', async () => {
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');

    // Default sort dosen asc → Dosen 01 di atas
    const rows = () => screen.getAllByRole('row').filter((r) => r.textContent?.includes('Dosen 0'));
    expect(rows()[0]).toHaveTextContent('Dosen 01');

    // Klik Dosen → desc → Dosen 03 di atas
    await user.click(screen.getByRole('button', { name: /Urutkan Dosen/ }));
    expect(rows()[0]).toHaveTextContent('Dosen 03');

    // Sort by Total asc → net terkecil duluan (Dosen 01)
    await user.click(screen.getByRole('button', { name: /Urutkan Total/ }));
    expect(rows()[0]).toHaveTextContent('Dosen 01');
    await user.click(screen.getByRole('button', { name: /Urutkan Total/ }));
    expect(rows()[0]).toHaveTextContent('Dosen 03');

    // aria-sort tercermin
    expect(screen.getByRole('button', { name: /Urutkan Total/ }).closest('th')).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('pagination 10/baris: 13 data → halaman 2 berisi 3 sisa data', async () => {
    mockedGet.mockResolvedValue(PAYROLLS_BANYAK);
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');

    // Halaman 1: 10 baris
    expect(screen.getByText(/halaman 1 dari 2/)).toBeInTheDocument();
    expect(screen.queryByText('Dosen 11')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Berikutnya/ }));
    expect(await screen.findByText('Dosen 11')).toBeInTheDocument();
    expect(screen.getByText(/halaman 2 dari 2/)).toBeInTheDocument();
  });

  it('mode Pilih: checkbox muncul, Approve Semua memanggil API utk tiap draft terpilih, Batal mengosongkan', async () => {
    mockedGet.mockResolvedValue(PAYROLLS_BANYAK); // 5 draft di halaman 1
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');

    // Masuk mode pilih → checkbox muncul di kanan kolom aksi
    await user.click(screen.getByRole('button', { name: '☑ Pilih' }));
    const cbs = screen.getAllByRole('checkbox');
    // 10 baris di halaman 1: 5 draft enable, 5 paid disable; +1 checkbox select-all header
    const rowCbs = cbs.filter((c) => c.getAttribute('aria-label')?.startsWith('Pilih payroll'));
    expect(rowCbs.length).toBe(10);
    expect(rowCbs.filter((c) => !(c as HTMLInputElement).disabled).length).toBe(5);

    // Centang 2 draft pertama
    const enabled = rowCbs.filter((c) => !(c as HTMLInputElement).disabled);
    await user.click(enabled[0]);
    await user.click(enabled[1]);
    expect(screen.getByText('2 dipilih')).toBeInTheDocument();

    // Approve Semua
    await user.click(screen.getByRole('button', { name: /Approve Semua \(2\)/ }));
    expect(mockedApprove).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('status')).toHaveTextContent(/2 payroll berhasil disetujui/);
    // Mode pilih keluar otomatis
    expect(screen.getByRole('button', { name: /Pilih$/ })).toBeEnabled();
  });

  it('Batal pada mode pilih menyembunyikan checkbox tanpa approve', async () => {
    mockedGet.mockResolvedValue(PAYROLLS_BANYAK);
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen 01');

    await user.click(screen.getByRole('button', { name: '☑ Pilih' }));
    expect(screen.getByRole('button', { name: /Batal/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Batal/ }));
    expect(mockedApprove).not.toHaveBeenCalled();
    // Mode pilih keluar → checkbox baris lenyap
    expect(screen.queryByRole('checkbox', { name: /Pilih payroll/ })).not.toBeInTheDocument();
  });
});
