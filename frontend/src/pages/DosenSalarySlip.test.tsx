import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSalarySlip } from './DosenSalarySlip';
import * as api from '../lib/api';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 4, username: 'dosen.TI1' }, booting: false, logout: vi.fn() }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getMySalarySlips: vi.fn(),
    downloadSalarySlipPdf: vi.fn(),
  };
});

const mockedGet = vi.mocked(api.getMySalarySlips);
const mockedDownload = vi.mocked(api.downloadSalarySlipPdf);

const SLIPS = {
  items: [
    {
      id: 1,
      lecturerId: 2,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      baseSalary: 5000000,
      honorPerMeeting: 100000,
      totalMeetings: 8,
      totalHonor: 800000,
      deductions: 250000,
      netAmount: 5550000,
      status: 'paid' as const,
    },
    {
      id: 2,
      lecturerId: 2,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      baseSalary: 5000000,
      honorPerMeeting: 100000,
      totalMeetings: 6,
      totalHonor: 600000,
      deductions: 250000,
      netAmount: 5350000,
      status: 'paid' as const,
    },
  ],
};

describe('DosenSalarySlip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(SLIPS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('render tabel slip gaji dengan periode & rupiah', async () => {
    render(<DosenSalarySlip />);
    expect(await screen.findByText('Agustus 2026')).toBeInTheDocument();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
    // Rupiah format (muncul di 2 baris: gaji pokok Agustus & September)
    expect(screen.getAllByText('Rp 5.000.000').length).toBe(2);
    // Status badge — dosen hanya melihat payroll paid (backend memfilter)
    expect(screen.getAllByText('Dibayar').length).toBe(2);
    // Total footer
    expect(screen.getByText('Rp 10.900.000')).toBeInTheDocument();
  });

  it('kosong → pesan "Belum Ada Data"', async () => {
    mockedGet.mockResolvedValue({ items: [] });
    render(<DosenSalarySlip />);
    expect(await screen.findByText('Belum Ada Data')).toBeInTheDocument();
  });

  it('error API → pesan "Belum Ada Data" (bukan error kasar)', async () => {
    mockedGet.mockRejectedValue(new Error('404'));
    render(<DosenSalarySlip />);
    expect(await screen.findByText('Belum Ada Data')).toBeInTheDocument();
  });

  it('filter bulan memanggil API dengan rentang periode bulan itu', async () => {
    const user = userEvent.setup();
    render(<DosenSalarySlip />);
    await screen.findByText('Agustus 2026');
    await user.selectOptions(screen.getByLabelText('Bulan'), 'Agustus');
    // Setelah filter, API dipanggil ulang dgn periode Agustus 2026 (tahun default = tahun berjalan)
    const calls = mockedGet.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toMatch(/-08-01$/);
    expect(lastCall[1]).toMatch(/-08-(29|30|31)$/);
  });

  it('tombol Download PDF disabled saat kosong, terpanggil saat ada data', async () => {
    const user = userEvent.setup();
    mockedDownload.mockResolvedValue(undefined);
    render(<DosenSalarySlip />);
    const btn = await screen.findByRole('button', { name: /Download PDF/ });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(mockedDownload).toHaveBeenCalledTimes(1);
    expect(mockedDownload.mock.calls[0][0]).toMatch(/01-01$/);
    expect(mockedDownload.mock.calls[0][1]).toMatch(/12-31$/);
  });

  it('tombol Download PDF disabled ketika tidak ada slip', async () => {
    mockedGet.mockResolvedValue({ items: [] });
    render(<DosenSalarySlip />);
    await screen.findByText('Belum Ada Data');
    expect(screen.getByRole('button', { name: /Download PDF/ })).toBeDisabled();
  });
});
