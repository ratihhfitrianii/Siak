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

    // Ringkasan: total SKS (3+3=6) dan IPK
    expect(screen.getByText(/6 SKS/)).toBeInTheDocument();
    expect(screen.getByText(/IPK Kumulatif/)).toBeInTheDocument();
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
});
