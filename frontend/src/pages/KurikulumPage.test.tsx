import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('klik ikon urutkan → dropdown → urutan berubah (sort)', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: mockItems });
    render(<KurikulumPage />);
    await screen.findByText('Algoritma');

    // Buka menu urutkan, pilih SKS → asc urut 3,3,4 (TI101, TI102, TI210)
    fireEvent.click(screen.getByRole('button', { name: /Urutkan/ }));
    fireEvent.click(screen.getByRole('option', { name: /^SKS/ }));
    const codes = screen.getAllByText(/^TI\d+$/).map((el) => el.textContent);
    expect(codes).toEqual(['TI101', 'TI102', 'TI210']);
    // Toggle lagi (item aktif pilihan ulang) → desc: 4 (TI210) pertama
    fireEvent.click(screen.getByRole('button', { name: /Urutkan/ }));
    fireEvent.click(screen.getByRole('option', { name: /^SKS/ }));
    const codesDesc = screen.getAllByText(/^TI\d+$/).map((el) => el.textContent);
    expect(codesDesc[0]).toBe('TI210');
  });

  it('ketik query → hanya baris cocok (search)', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: mockItems });
    render(<KurikulumPage />);
    await screen.findByText('Algoritma');

    fireEvent.change(screen.getByPlaceholderText('Cari semua kolom...'), {
      target: { value: 'Basis' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Cari semua kolom...'), { key: 'Enter' });
    expect(screen.getByText('Basis Data')).toBeInTheDocument();
    expect(screen.queryByText('Algoritma')).not.toBeInTheDocument();
    expect(screen.queryByText('Struktur Data')).not.toBeInTheDocument();
    // Ringkasan ikut memakai data terfilter
    expect(screen.getByText('1 MK')).toBeInTheDocument();
  });

  it('klik semua opsi urutkan di dropdown → sort berfungsi tanpa error', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: mockItems });
    render(<KurikulumPage />);
    await screen.findByText('Algoritma');

    const headers = ['Semester Kurikulum', 'Kode MK', 'Mata Kuliah', 'SKS', 'Dosen Pengampu'];
    for (const h of headers) {
      fireEvent.click(screen.getByRole('button', { name: /Urutkan/ }));
      fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${h}`) }));
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    }
  });
});
