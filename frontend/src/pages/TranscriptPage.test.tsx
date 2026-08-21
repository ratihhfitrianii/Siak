import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptPage } from './TranscriptPage';
import type { GradeItem } from '../lib/types';

// Variabel mock (prefix "mock" → boleh dipakai factory vi.mock)
let mockUser: {
  id: number;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  isWali: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  studentId: number | null;
  createdAt: string;
  menu: string[];
};

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, booting: false, logout: vi.fn() }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const MAHASISWA = {
  id: 7,
  email: 'budi@kampus.ac.id',
  fullName: 'Budi',
  role: 'mahasiswa',
  roleName: 'Mahasiswa',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: 7,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['transcript.view_own'],
};

const DOSEN = {
  id: 2,
  email: 'dosen@kampus.ac.id',
  fullName: 'Pak Dosen',
  role: 'dosen',
  roleName: 'Dosen',
  isWali: true,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['transcript.view_own'],
};

const GRADE_ITEMS: GradeItem[] = [
  {
    id: 1,
    krsItemId: 11,
    classId: 101,
    classCode: 'A',
    course: { code: 'MAT1', name: 'Matematika Dasar', credits: 3 },
    period: 'Ganjil 2024/2025',
    semester: '2024/2025-1',
    tugasScore: 90,
    utsScore: 85,
    uasScore: 88,
    finalScore: 87.5,
    gradeLetter: 'A',
    gradePoint: 4.0,
    isRemedial: false,
    remedialScore: null,
    inputBy: 2,
    inputAt: '2025-01-10T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
  },
  {
    id: 2,
    krsItemId: 12,
    classId: 102,
    classCode: 'B',
    course: { code: 'FIS1', name: 'Fisika Dasar', credits: 2 },
    period: 'Ganjil 2024/2025',
    semester: '2024/2025-1',
    tugasScore: 80,
    utsScore: 78,
    uasScore: 75,
    finalScore: 77.5,
    gradeLetter: 'B+',
    gradePoint: 3.3,
    isRemedial: false,
    remedialScore: null,
    inputBy: 2,
    inputAt: '2025-01-10T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
  },
  {
    id: 3,
    krsItemId: 13,
    classId: 201,
    classCode: 'A',
    course: { code: 'KIM1', name: 'Kimia Dasar', credits: 2 },
    period: 'Genap 2023/2024',
    semester: '2023/2024-2',
    tugasScore: null,
    utsScore: null,
    uasScore: null,
    finalScore: null,
    gradeLetter: null,
    gradePoint: null,
    isRemedial: false,
    remedialScore: null,
    inputBy: 2,
    inputAt: '2024-07-01T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
  },
];

describe('TranscriptPage (T1.11b)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mengelompokkan nilai per semester dan menghitung IP/IPK', async () => {
    mockUser = MAHASISWA;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { items: GRADE_ITEMS } })),
    );
    render(<TranscriptPage />);

    expect(await screen.findByText('Semester 2024/2025-1')).toBeInTheDocument();
    expect(screen.getByText('Semester 2023/2024-2')).toBeInTheDocument();

    // IP semester 1 = (3×4.0 + 2×3.3)/5 = 18.6/5 = 3.72
    expect(screen.getByText(/IP: 3\.72/)).toBeInTheDocument();
    // semester 2 belum dinilai → IP '—'
    expect(screen.getByText(/IP: —/)).toBeInTheDocument();

    // IPK total = 18.6/5 (hanya SKS yang sudah dinilai) = 3.72; Total SKS = 7
    expect(screen.getByText('3.72')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('keluhan #5 — detail semester tersembunyi secara default, muncul saat klik Detail', async () => {
    mockUser = MAHASISWA;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { items: GRADE_ITEMS } })),
    );
    render(<TranscriptPage />);

    // Header semester tampil…
    expect(await screen.findByText('Semester 2024/2025-1')).toBeInTheDocument();
    // …tapi detail matkul TIDAK tampil sebelum klik Detail
    expect(screen.queryByText('Matematika Dasar')).not.toBeInTheDocument();
    expect(screen.queryByText('Kimia Dasar')).not.toBeInTheDocument();

    // Klik "Detail" → tabel semester muncul
    const detailButtons = screen.getAllByRole('button', { name: /Detail/i });
    detailButtons[0]!.click();
    expect(await screen.findByText('Matematika Dasar')).toBeInTheDocument();
    expect(screen.getByText('Fisika Dasar')).toBeInTheDocument();
    // Semester lain masih tertutup
    expect(screen.queryByText('Kimia Dasar')).not.toBeInTheDocument();

    // Klik "Sembunyikan Detail" → tabel hilang lagi
    screen.getByRole('button', { name: /Sembunyikan Detail/i }).click();
    await waitFor(() => {
      expect(screen.queryByText('Matematika Dasar')).not.toBeInTheDocument();
    });
  });

  it('akun tanpa studentId → info transkrip tidak tersedia', async () => {
    mockUser = DOSEN;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { items: [] } })),
    );
    render(<TranscriptPage />);

    expect(
      await screen.findByText(
        'Transkrip nilai tersedia untuk akun mahasiswa. Akun ini tidak terhubung ke data mahasiswa.',
      ),
    ).toBeInTheDocument();
    // fetch called for academic-years (new feature)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('error → pesan error ditampilkan', async () => {
    mockUser = MAHASISWA;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
          },
          500,
        ),
      ),
    );
    render(<TranscriptPage />);
    expect(await screen.findByText('Terjadi kesalahan server')).toBeInTheDocument();
  });

  it('tidak ada nilai → empty state', async () => {
    mockUser = MAHASISWA;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { items: [] } })),
    );
    render(<TranscriptPage />);
    expect(await screen.findByText('Belum ada nilai yang tercatat.')).toBeInTheDocument();
  });

  it('tombol Download PDF — memicu fetch PDF + download (T2.4)', async () => {
    mockUser = MAHASISWA;
    localStorage.setItem('siak.access_token', 'test-token'); // token dibutuhkan helper download
    const clickSpy = vi.fn();
    const revokeSpy = vi.fn();
    const blob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/transcript/my/download')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            blob: async () => blob,
          } as Response);
        }
        return Promise.resolve(jsonResponse({ success: true, data: { items: GRADE_ITEMS } }));
      }),
    );
    vi.stubGlobal(
      'URL',
      Object.assign(vi.fn(), {
        createObjectURL: vi.fn(() => 'blob:mock'),
        revokeObjectURL: revokeSpy,
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
    render(<TranscriptPage />);

    const downloadBtn = await screen.findByRole('button', { name: /Download PDF/i });
    expect(downloadBtn).toBeEnabled();
    downloadBtn.click();

    // Tunggu fetch PDF dipanggil
    await vi.waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
    expect(revokeSpy).toHaveBeenCalled();
  });
});
