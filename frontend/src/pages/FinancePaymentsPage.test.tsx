import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinancePaymentsPage } from './FinancePaymentsPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getFinancePaymentsGrouped: vi.fn(),
    getStudentPayments: vi.fn(),
    updateFinancePayment: vi.fn(),
    generateFinancePayments: vi.fn(),
    getFinanceSemesters: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

const MOCK_GROUPS = [
  {
    studentId: 1,
    nim: '2021001',
    fullName: 'Budi Santoso',
    prodiId: 1,
    prodiName: 'Teknik Informatika',
    totalSemesters: 2,
    totalPaid: 5000000,
    totalTagihan: 10000000,
    allLunas: false,
  },
  {
    studentId: 2,
    nim: '2021002',
    fullName: 'Ani Wijaya',
    prodiId: 1,
    prodiName: 'Teknik Informatika',
    totalSemesters: 2,
    totalPaid: 10000000,
    totalTagihan: 10000000,
    allLunas: true,
  },
];

const MOCK_PAYMENTS = [
  {
    id: 1,
    studentId: 1,
    nim: '2021001',
    fullName: 'Budi Santoso',
    prodiId: 1,
    prodiName: 'Teknik Informatika',
    semesterId: 1,
    semesterCode: '20211',
    semesterName: 'Ganjil 2021/2022',
    totalAmount: 5000000,
    paidAmount: 5000000,
    status: 'lunas' as const,
    dueDate: '2021-09-01T00:00:00Z',
    isWaived: false,
    waivedReason: null,
    proofUrl: null,
    createdAt: '2021-08-01T00:00:00Z',
    updatedAt: '2021-08-01T00:00:00Z',
    items: [{ id: 1, type: 'SPP', description: 'SPP Ganjil', amount: 5000000, isMandatory: true }],
  },
  {
    id: 2,
    studentId: 1,
    nim: '2021001',
    fullName: 'Budi Santoso',
    prodiId: 1,
    prodiName: 'Teknik Informatika',
    semesterId: 2,
    semesterCode: '20212',
    semesterName: 'Genap 2021/2022',
    totalAmount: 5000000,
    paidAmount: 0,
    status: 'belum_lunas' as const,
    dueDate: '2022-02-01T00:00:00Z',
    isWaived: false,
    waivedReason: null,
    proofUrl: null,
    createdAt: '2022-01-01T00:00:00Z',
    updatedAt: '2022-01-01T00:00:00Z',
    items: [{ id: 2, type: 'SPP', description: 'SPP Genap', amount: 5000000, isMandatory: true }],
  },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('FinancePaymentsPage (grouped)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getFinancePaymentsGrouped.mockResolvedValue({
      items: MOCK_GROUPS,
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    mockedApi.getFinanceSemesters.mockResolvedValue([]);
  });

  it('menampilkan daftar mahasiswa tergroup', async () => {
    render(<FinancePaymentsPage />);
    expect(await screen.findByText('2021001')).toBeInTheDocument();
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('2021002')).toBeInTheDocument();
    expect(screen.getByText('Ani Wijaya')).toBeInTheDocument();
  });

  it('menampilkan status Semua Lunas / Ada Tagihan', async () => {
    render(<FinancePaymentsPage />);
    await screen.findByText('2021001');
    expect(screen.getByText('Ada Tagihan')).toBeInTheDocument();
    expect(screen.getByText('Semua Lunas')).toBeInTheDocument();
  });

  it('klik Detail → buka modal dengan daftar tagihan per semester', async () => {
    mockedApi.getStudentPayments.mockResolvedValue(MOCK_PAYMENTS as any);
    render(<FinancePaymentsPage />);
    await screen.findByText('2021001');

    const detailBtns = screen.getAllByText('Detail');
    fireEvent.click(detailBtns[0]);

    await waitFor(() => expect(mockedApi.getStudentPayments).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Ganjil 2021/2022')).toBeInTheDocument();
    expect(screen.getByText('Genap 2021/2022')).toBeInTheDocument();
  });

  it('tombol Update muncul untuk tagihan belum lunas', async () => {
    mockedApi.getStudentPayments.mockResolvedValue(MOCK_PAYMENTS as any);
    render(<FinancePaymentsPage />);
    await screen.findByText('2021001');

    const detailBtns = screen.getAllByText('Detail');
    fireEvent.click(detailBtns[0]);
    await screen.findByText('Genap 2021/2022');

    expect(screen.getByText('✓ Lunas')).toBeInTheDocument();
    const updateBtns = screen.getAllByText('Update');
    expect(updateBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('search filter memanggil API dengan parameter', async () => {
    render(<FinancePaymentsPage />);
    await screen.findByText('2021001');

    fireEvent.change(screen.getByPlaceholderText('Cari NIM/Nama...'), {
      target: { value: 'Budi' },
    });

    await waitFor(() => {
      expect(mockedApi.getFinancePaymentsGrouped).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Budi' }),
      );
    });
  });

  it('error → tampilkan pesan error', async () => {
    mockedApi.getFinancePaymentsGrouped.mockRejectedValue(new Error('Gagal memuat'));
    render(<FinancePaymentsPage />);
    expect(await screen.findByText(/Gagal memuat/)).toBeInTheDocument();
  });

  it('data kosong → empty state', async () => {
    mockedApi.getFinancePaymentsGrouped.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    render(<FinancePaymentsPage />);
    expect(await screen.findByText('Tidak ada data tagihan')).toBeInTheDocument();
  });
});
