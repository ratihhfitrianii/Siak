import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancePayrollPage } from './FinancePayrollPage';
import * as api from '../lib/api';

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

const PAYROLLS = {
  items: [
    {
      id: 11,
      lecturerId: 94,
      lecturerName: 'Dosen TI 1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      baseSalary: 5000000,
      honorPerMeeting: 100000,
      totalMeetings: 8,
      totalHonor: 800000,
      deductions: 0,
      netAmount: 5800000,
      status: 'draft' as const,
    },
    {
      id: 12,
      lecturerId: 95,
      lecturerName: 'Dosen TI 2',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      baseSalary: 4500000,
      honorPerMeeting: 100000,
      totalMeetings: 6,
      totalHonor: 600000,
      deductions: 250000,
      netAmount: 4850000,
      status: 'approved' as const,
    },
    {
      id: 13,
      lecturerId: 96,
      lecturerName: 'Dosen TI 3',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      baseSalary: 4000000,
      honorPerMeeting: 100000,
      totalMeetings: 4,
      totalHonor: 400000,
      deductions: 0,
      netAmount: 4400000,
      status: 'paid' as const,
    },
  ],
  total: 3,
  page: 1,
  limit: 100,
  totalPages: 1,
};

describe('FinancePayrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(PAYROLLS);
    mockedProdis.mockResolvedValue(PRODIS as unknown as Awaited<ReturnType<typeof api.listProdis>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('render tabel payroll dengan nama dosen, rupiah, dan status badge', async () => {
    render(<FinancePayrollPage />);
    expect(await screen.findByText('Dosen TI 1')).toBeInTheDocument();
    expect(screen.getByText('Dosen TI 2')).toBeInTheDocument();
    expect(screen.getByText('Rp 5.800.000')).toBeInTheDocument();
    expect(screen.getAllByText('Draft').length).toBe(1);
    expect(screen.getAllByText('Disetujui').length).toBe(1);
    expect(screen.getAllByText('Dibayar').length).toBe(1);
  });

  it('aksi per status: draft→Approve, approved→Tandai Dibayar, paid→tanpa tombol', async () => {
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen TI 1');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockedApprove).toHaveBeenCalledWith(11);

    await user.click(screen.getByRole('button', { name: /Tandai Dibayar/ }));
    expect(mockedPay).toHaveBeenCalledWith(12);

    // Paid → tidak ada tombol aksi (hanya teks)
    expect(screen.getByText('Selesai ✓')).toBeInTheDocument();
    expect(mockedApprove).toHaveBeenCalledTimes(1);
  });

  it('tombol Generate memanggil API dgn periode bulan terpilih lalu reload', async () => {
    const user = userEvent.setup();
    mockedGenerate.mockResolvedValue('Payroll generated untuk 3 dosen');
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen TI 1');

    await user.click(screen.getByRole('button', { name: /Generate Payroll/ }));
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    const [start, end] = mockedGenerate.mock.calls[0];
    expect(start).toMatch(/-01$/);
    expect(end).toMatch(/-(28|29|30|31)$/);
    expect(await screen.findByRole('status')).toHaveTextContent(/3 dosen/);
  });

  it('kosong → pesan ajak generate', async () => {
    mockedGet.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    render(<FinancePayrollPage />);
    expect(await screen.findByText(/Belum ada payroll untuk/)).toBeInTheDocument();
  });

  it('error load → pesan gagal memuat', async () => {
    mockedGet.mockRejectedValue(new Error('500'));
    render(<FinancePayrollPage />);
    expect(await screen.findByText('Gagal memuat data payroll')).toBeInTheDocument();
  });

  it('dropdown prodi terisi dari listProdis + pilih prodi → getPayrolls dengan prodi_id', async () => {
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen TI 1');

    await user.selectOptions(screen.getByLabelText('Prodi'), '1');
    let lastCall = mockedGet.mock.calls.at(-1)?.[0];
    expect(lastCall?.prodiId).toBe(1);

    // Kembali ke Semua Prodi
    await user.selectOptions(screen.getByLabelText('Prodi'), '');
    lastCall = mockedGet.mock.calls.at(-1)?.[0];
    expect(lastCall?.prodiId).toBeUndefined();
  });

  it('tombol Cari menerapkan kata kunci pencarian nama/NIDN', async () => {
    const user = userEvent.setup();
    render(<FinancePayrollPage />);
    await screen.findByText('Dosen TI 1');

    // Ketik lalu klik Cari
    await user.type(screen.getByLabelText('Cari Dosen'), 'Dosen TI');
    await user.click(screen.getByRole('button', { name: /Cari/ }));
    let lastCall = mockedGet.mock.calls.at(-1)?.[0];
    expect(lastCall?.q).toBe('Dosen TI');

    // Enter juga menerapkan
    await user.clear(screen.getByLabelText('Cari Dosen'));
    await user.type(screen.getByLabelText('Cari Dosen'), '198001002{Enter}');
    lastCall = mockedGet.mock.calls.at(-1)?.[0];
    expect(lastCall?.q).toBe('198001002');
  });
});
