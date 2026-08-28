import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagihanPage } from './TagihanPage';
import { getKrsAccess, getKrsPeriod, getMyPayments } from '../lib/api';
import type { MyPayment, KrsAccessResult, KrsPeriod } from '../lib/types';

vi.mock('../lib/api', () => ({
  getKrsAccess: vi.fn(),
  getKrsPeriod: vi.fn(),
  getMyPayments: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

const mockPeriod: KrsPeriod = {
  id: 7,
  semesterId: 7,
  semesterCode: '2026/2027-1',
  name: 'KRS Utama Ganjil 2026/2027',
  startDate: '2026-07-14T17:00:00.000Z',
  endDate: '2026-09-15T16:59:59.000Z',
  isRevision: false,
  status: 'open',
};

const mockPayment: MyPayment = {
  id: 10,
  studentId: 1,
  nim: 'TEST25001',
  fullName: 'Rina Wulandari',
  prodiId: 1,
  prodiName: 'TI',
  semesterId: 7,
  semesterCode: '2026/2027-1',
  semesterName: 'Ganjil 2026/2027',
  totalAmount: 5000000,
  paidAmount: 5000000,
  status: 'lunas',
  dueDate: '2026-08-10',
  isWaived: false,
  waivedReason: null,
  proofUrl: null,
  createdAt: '2026-07-01',
  updatedAt: '2026-07-01',
  items: [
    {
      id: 1,
      type: 'spp',
      description: 'SPP Semester Ganjil 2026/2027',
      amount: 4000000,
      isMandatory: true,
    },
    { id: 2, type: 'praktikum', description: 'Praktikum', amount: 1000000, isMandatory: false },
  ],
};

const mockAccessLunas: KrsAccessResult = {
  canAccess: true,
  payment: { status: 'lunas', totalAmount: 5000000, paidAmount: 5000000, dueDate: '2026-08-10' },
};

describe('TagihanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan tagihan semester berjalan + rincian items', async () => {
    vi.mocked(getKrsPeriod).mockResolvedValue(mockPeriod);
    vi.mocked(getMyPayments).mockResolvedValue([mockPayment]);
    vi.mocked(getKrsAccess).mockResolvedValue(mockAccessLunas);

    render(<TagihanPage />);

    expect(await screen.findByText(/Tagihan Ganjil 2026\/2027/)).toBeInTheDocument();
    // Badge Lunas + teks info; dua-duanya muncul
    expect(screen.getAllByText('Lunas').length).toBeGreaterThanOrEqual(1);
    // Rincian item
    expect(await screen.findByText('SPP Semester Ganjil 2026/2027')).toBeInTheDocument();
    expect(screen.getByText('Praktikum')).toBeInTheDocument();
    // KRS access indicator — lunas
    expect(screen.getByText(/Anda dapat mengisi KRS/)).toBeInTheDocument();
  });

  it('menampilkan pesan belum ada tagihan saat payment kosong (kebijakan: tanpa tagihan = boleh akses)', async () => {
    vi.mocked(getKrsPeriod).mockResolvedValue(mockPeriod);
    vi.mocked(getMyPayments).mockResolvedValue([]);

    render(<TagihanPage />);

    expect(await screen.findByText('Belum ada tagihan')).toBeInTheDocument();
    expect(screen.getByText(/Tidak ada tagihan untuk/)).toBeInTheDocument();
  });

  it('menampilkan error saat gagal memuat', async () => {
    vi.mocked(getKrsPeriod).mockRejectedValue(new Error('network'));
    vi.mocked(getMyPayments).mockRejectedValue(new Error('network'));

    render(<TagihanPage />);

    expect(await screen.findByText('Gagal memuat tagihan')).toBeInTheDocument();
  });
});
