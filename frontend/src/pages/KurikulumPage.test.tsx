import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KurikulumPage } from './KurikulumPage';
import { apiRequest } from '../lib/api';
import type { GradeItem } from '../lib/types';

vi.mock('../lib/api', () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { studentId: 1 } }),
}));

const mockItems: GradeItem[] = [
  {
    id: 1,
    krsItemId: 1,
    classId: 1,
    classCode: 'TI101-A',
    course: { code: 'TI101', name: 'Algoritma', credits: 3 },
    period: '2025/2026-1',
    semester: 'Ganjil 2025/2026',
    tugasScore: 90,
    utsScore: 85,
    uasScore: 88,
    finalScore: 88,
    gradeLetter: 'A',
    gradePoint: 4,
    isRemedial: false,
    remedialScore: null,
    inputBy: 2,
    inputAt: '2026-01-10',
    updatedBy: 2,
    updatedAt: '2026-01-10',
  },
  {
    id: 2,
    krsItemId: 2,
    classId: 2,
    classCode: 'TI102-A',
    course: { code: 'TI102', name: 'Struktur Data', credits: 3 },
    period: '2025/2026-1',
    semester: 'Ganjil 2025/2026',
    tugasScore: 80,
    utsScore: 75,
    uasScore: 78,
    finalScore: 78,
    gradeLetter: 'B+',
    gradePoint: 3.5,
    isRemedial: false,
    remedialScore: null,
    inputBy: 2,
    inputAt: '2026-01-10',
    updatedBy: 2,
    updatedAt: '2026-01-10',
  },
  {
    id: 3,
    krsItemId: 3,
    classId: 3,
    classCode: 'TI101-B',
    course: { code: 'TI101', name: 'Algoritma', credits: 3 },
    period: '2024/2025-2',
    semester: 'Genap 2024/2025',
    tugasScore: 70,
    utsScore: 65,
    uasScore: 60,
    finalScore: 65,
    gradeLetter: 'C',
    gradePoint: 2,
    isRemedial: true,
    remedialScore: null,
    inputBy: 2,
    inputAt: '2025-07-10',
    updatedBy: 2,
    updatedAt: '2025-07-10',
  },
];

describe('KurikulumPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan daftar MK unik (dedupe per kode — ambil nilai terbaik)', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: mockItems });

    render(<KurikulumPage />);

    // Judul
    expect(await screen.findByText('Mata Kuliah yang Telah Diambil')).toBeInTheDocument();

    // Dedupe: TI101 hanya 1 baris (nilai terbaik A), TI102 1 baris
    expect(screen.getAllByText('Algoritma')).toHaveLength(1);
    expect(screen.getByText('Struktur Data')).toBeInTheDocument();
    expect(screen.getByText('TI101')).toBeInTheDocument();
    expect(screen.getByText('TI102')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B+')).toBeInTheDocument();

    // Ringkasan: 2 MK, 6 SKS, 2 lulus
    expect(screen.getByText('2 MK')).toBeInTheDocument();
    expect(screen.getByText('6 SKS')).toBeInTheDocument();
    expect(screen.getByText('2/2 lulus')).toBeInTheDocument();
  });

  it('menampilkan empty state saat tidak ada MK', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [] });

    render(<KurikulumPage />);

    expect(await screen.findByText('Belum ada mata kuliah')).toBeInTheDocument();
  });

  it('menampilkan error saat gagal memuat', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('network'));

    render(<KurikulumPage />);

    expect(await screen.findByText('Gagal memuat kurikulum')).toBeInTheDocument();
  });
});
