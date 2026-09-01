import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KurikulumPage } from './KurikulumPage';
import { apiRequest } from '../lib/api';
import type { CurriculumItem } from '../lib/types';

vi.mock('../lib/api', () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

const mockItems: CurriculumItem[] = [
  {
    courseId: 1,
    code: 'TI101',
    name: 'Algoritma',
    credits: 3,
    semesterKurikulum: 1,
    lecturerName: 'Dr. Andi',
  },
  {
    courseId: 2,
    code: 'TI102',
    name: 'Struktur Data',
    credits: 3,
    semesterKurikulum: 2,
    lecturerName: 'Prof. Budi',
  },
  {
    courseId: 3,
    code: 'TI210',
    name: 'Basis Data',
    credits: 4,
    semesterKurikulum: 1,
    lecturerName: 'Dr. Cici',
  },
];

describe('KurikulumPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan daftar MK yang pernah dikontrak dengan kolom & warna semester', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: mockItems });

    render(<KurikulumPage />);

    // Judul
    expect(await screen.findByText('Mata Kuliah yang Pernah Dikontrak')).toBeInTheDocument();

    // Header kolom
    expect(screen.getAllByText('Semester Kurikulum').length).toBeGreaterThan(0);
    expect(screen.getByText('Kode MK')).toBeInTheDocument();
    expect(screen.getAllByText('Mata Kuliah').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKS').length).toBeGreaterThan(0);
    expect(screen.getByText('Dosen Pengampu')).toBeInTheDocument();

    // Data & badge semester
    expect(screen.getByText('Algoritma')).toBeInTheDocument();
    expect(screen.getByText('Struktur Data')).toBeInTheDocument();
    expect(screen.getByText('Basis Data')).toBeInTheDocument();
    expect(screen.getByText('Dr. Andi')).toBeInTheDocument();
    expect(screen.getByText('Prof. Budi')).toBeInTheDocument();
    expect(screen.getByText('Dr. Cici')).toBeInTheDocument();

    // Badge semester kurikulum
    expect(screen.getAllByText('Semester 1').length).toBe(2);
    expect(screen.getByText('Semester 2')).toBeInTheDocument();

    // Ringkasan: 3 MK, 10 SKS, 2 semester
    expect(screen.getByText('3 MK')).toBeInTheDocument();
    expect(screen.getByText('10 SKS')).toBeInTheDocument();
    expect(screen.getByText('2 semester')).toBeInTheDocument();
  });

  it('menampilkan empty state saat tidak ada MK dikontrak', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [] });

    render(<KurikulumPage />);

    expect(await screen.findByText('Belum ada mata kuliah')).toBeInTheDocument();
  });

  it('menampilkan error saat gagal memuat', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('network'));

    render(<KurikulumPage />);

    expect(await screen.findByText('Gagal memuat kurikulum')).toBeInTheDocument();
  });

  it('menampilkan tanda strip saat dosen pengampu kosong', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      items: [{ ...mockItems[0], lecturerName: '' }],
    });

    render(<KurikulumPage />);

    expect(await screen.findByText('Algoritma')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
