import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiwayatStudiPage } from './RiwayatStudiPage';

const mockUser = {
  id: 7,
  email: 'budi@kampus.ac.id',
  fullName: 'Budi',
  role: 'mahasiswa',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: 7,
  createdAt: '2026-01-01T00:00:00Z',
};

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, booting: false }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('RiwayatStudiPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              id: 1,
              krsItemId: 10,
              classId: 20,
              classCode: 'TI-101-A',
              course: { code: 'TI101', name: 'Pemrograman Dasar', credits: 3 },
              semester: '2024/2025-1',
              finalScore: 97.5,
              gradeLetter: 'A',
              gradePoint: 4.0,
              isRemedial: false,
            },
            {
              id: 2,
              krsItemId: 11,
              classId: 21,
              classCode: 'TI-102-A',
              course: { code: 'TI102', name: 'Struktur Data', credits: 3 },
              semester: '2024/2025-2',
              finalScore: 85.0,
              gradeLetter: 'B+',
              gradePoint: 3.3,
              isRemedial: false,
            },
          ],
        },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — menampilkan daftar matkul dari semua semester + ringkasan', async () => {
    render(
      <MemoryRouter>
        <RiwayatStudiPage />
      </MemoryRouter>,
    );

    // Header tabel
    expect(await screen.findByText('Kode MK')).toBeInTheDocument();
    expect(screen.getByText('Mata Kuliah')).toBeInTheDocument();
    expect(screen.getByText('Nilai Angka')).toBeInTheDocument();
    expect(screen.getByText('Semester')).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();

    // Data matkul
    expect(screen.getByText('Pemrograman Dasar')).toBeInTheDocument();
    expect(screen.getByText('Struktur Data')).toBeInTheDocument();

    // Ringkasan: total SKS (3+3=6) dan IPK — di tfoot sejajar kolom
    expect(screen.getByText('Jumlah yang Sudah Ditempuh')).toBeInTheDocument();
    // Nilai SKS total sejajar kolom SKS
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
    expect(screen.getByText(/IPK Kumulatif/)).toBeInTheDocument();
    // IPK 3.65 muncul di tfoot
    expect(screen.getAllByText('3.65').length).toBeGreaterThan(0);
  });

  it('error — menampilkan pesan error saat fetch gagal', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { message: 'Gagal memuat riwayat' } }, 500),
    );
    render(
      <MemoryRouter>
        <RiwayatStudiPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat riwayat');
  });

  it('kosong — menampilkan pesan belum ada matkul', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { items: [] } }));
    render(
      <MemoryRouter>
        <RiwayatStudiPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Belum ada mata kuliah yang tercatat.')).toBeInTheDocument();
  });

  it('render variasi nilai (medium/sedang, rendah, belum dinilai) + label semester', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              id: 3,
              krsItemId: 12,
              classId: 30,
              classCode: 'TI-103-A',
              course: { code: 'TI103', name: 'Algoritma', credits: 3 },
              semester: '2024/2025-2',
              finalScore: 75.0,
              gradeLetter: 'B',
              gradePoint: 3.0,
              isRemedial: false,
            },
            {
              id: 4,
              krsItemId: 13,
              classId: 31,
              classCode: 'TI-104-A',
              course: { code: 'TI104', name: 'Bahasa Inggris', credits: 2 },
              semester: '2023/2024-1',
              finalScore: 60.0,
              gradeLetter: 'C',
              gradePoint: 2.0,
              isRemedial: false,
            },
            {
              id: 5,
              krsItemId: 14,
              classId: 32,
              classCode: 'TI-105-A',
              course: { code: 'TI105', name: 'Kewarganegaraan', credits: 2 },
              semester: '2023/2024-2',
              finalScore: null,
              gradeLetter: null,
              gradePoint: null,
              isRemedial: false,
            },
          ],
        },
      }),
    );
    render(
      <MemoryRouter>
        <RiwayatStudiPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Algoritma')).toBeInTheDocument();
    expect(screen.getByText('Bahasa Inggris')).toBeInTheDocument();
    expect(screen.getByText('Kewarganegaraan')).toBeInTheDocument();
    // Label semester: 'Ganjil' & 'Genap'
    expect(screen.getAllByText('Genap').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ganjil').length).toBeGreaterThan(0);
    // IPK dari 3 matkul ≥2.0: (3*3.0 + 2*2.0)/5 = 13/5 = 2.60
    expect(screen.getByText('2.60')).toBeInTheDocument();
  });

  it('semester label kembalikan kode saat format tidak standar', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              id: 6,
              krsItemId: 15,
              classId: 33,
              classCode: 'TI-106',
              course: { code: 'TI106', name: 'MK Tanpa Semester', credits: 2 },
              semester: 'GANJIL',
              finalScore: 80.0,
              gradeLetter: 'A',
              gradePoint: 4.0,
              isRemedial: false,
            },
          ],
        },
      }),
    );
    render(
      <MemoryRouter>
        <RiwayatStudiPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('MK Tanpa Semester')).toBeInTheDocument();
    // semesterLabel fallback → kode asli; TA fallback → kode asli
    expect(screen.getAllByText('GANJIL').length).toBeGreaterThan(0);
  });
});
