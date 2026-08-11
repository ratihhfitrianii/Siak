import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdminMasterPage } from './AdminMasterPage';
import * as api from '../lib/api';

// Mock module API — hindari fetch asli di test
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    listMasterStudents: vi.fn(),
    listMasterLecturers: vi.fn(),
    createMasterStudent: vi.fn(),
    createMasterLecturer: vi.fn(),
    importMasterCsv: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

const STUDENTS = [
  {
    id: 1,
    nim: '2412345678',
    fullName: 'Budi Santoso',
    email: 'budi@student.siak.local',
    userActive: true,
    prodiCode: 'TI',
    prodiName: 'Teknik Informatika',
    angkatan: '2024/2025',
    status: 'aktif',
  },
  {
    id: 2,
    nim: '2412345679',
    fullName: 'Siti Aminah',
    email: 'siti@student.siak.local',
    userActive: true,
    prodiCode: 'SI',
    prodiName: 'Sistem Informasi',
    angkatan: '2024/2025',
    status: 'aktif',
  },
];

const LECTURERS = [
  {
    id: 1,
    nidn: '1234567890',
    fullName: 'Dr. Ahmad',
    email: 'ahmad@siak.local',
    userActive: true,
    isWali: true,
    prodiCode: 'TI',
    prodiName: 'Teknik Informatika',
    employmentType: 'tetap',
  },
];

function studentListResponse(items = STUDENTS, total = items.length) {
  return { items, pagination: { page: 1, limit: 20, total } };
}

function lecturerListResponse(items = LECTURERS, total = items.length) {
  return { items, pagination: { page: 1, limit: 20, total } };
}

describe('AdminMasterPage (keluhan #16)', () => {
  beforeAll(() => {
    // Polyfill fetch untuk dropdown prodi (dipakai langsung via fetch, bukan api.*)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [
              { code: 'TI', name: 'Teknik Informatika' },
              { code: 'SI', name: 'Sistem Informasi' },
            ],
          },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan list master mahasiswa (tab default) dengan NIM, prodi, angkatan', async () => {
    mockedApi.listMasterStudents.mockResolvedValue(studentListResponse());
    render(<AdminMasterPage />);

    expect(await screen.findByText('Master Data')).toBeInTheDocument();
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('2412345678')).toBeInTheDocument();
    // "TI — Teknik Informatika" muncul di tabel (dan dropdown prodi) → gunakan getAllByText
    expect(screen.getAllByText('TI — Teknik Informatika').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2024/2025').length).toBeGreaterThan(0);
    expect(mockedApi.listMasterStudents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('ganti tab ke Master Dosen → list dosen (NIDN, wali)', async () => {
    mockedApi.listMasterStudents.mockResolvedValue(studentListResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturerListResponse());
    render(<AdminMasterPage />);

    await screen.findByText('Budi Santoso');
    fireEvent.click(screen.getByRole('tab', { name: 'Master Dosen' }));

    expect(await screen.findByText('Dr. Ahmad')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
    expect(screen.getByText('Ya')).toBeInTheDocument();
    expect(mockedApi.listMasterLecturers).toHaveBeenCalled();
  });

  it('search → memanggil list dengan parameter search (debounce 300ms)', async () => {
    mockedApi.listMasterStudents.mockResolvedValue(studentListResponse());
    render(<AdminMasterPage />);

    await screen.findByText('Budi Santoso');
    const searchBox = screen.getByLabelText('Cari master data');
    fireEvent.change(searchBox, { target: { value: 'budi' } });

    await waitFor(
      () => {
        expect(mockedApi.listMasterStudents).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: 'budi' }),
        );
      },
      { timeout: 2000 },
    );
  });

  it('tambah mahasiswa manual → modal + submit → createMasterStudent dipanggil + sukses', async () => {
    mockedApi.listMasterStudents.mockResolvedValue(studentListResponse());
    mockedApi.createMasterStudent.mockResolvedValue({
      id: 3,
      nim: '2412345699',
      message: 'Mahasiswa berhasil dibuat',
    });
    render(<AdminMasterPage />);

    await screen.findByText('Budi Santoso');
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah Manual' }));

    const dialog = await screen.findByRole('dialog', { name: 'Tambah mahasiswa' });
    fireEvent.change(within(dialog).getByLabelText('NIM'), {
      target: { value: '2412345699' },
    });
    fireEvent.change(within(dialog).getByLabelText('Nama Lengkap'), {
      target: { value: 'Andi Baru' },
    });
    fireEvent.change(within(dialog).getByLabelText('Prodi'), { target: { value: 'TI' } });
    fireEvent.change(within(dialog).getByLabelText('Angkatan'), {
      target: { value: '2024/2025' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      expect(mockedApi.createMasterStudent).toHaveBeenCalledWith({
        nim: '2412345699',
        fullName: 'Andi Baru',
        prodiCode: 'TI',
        angkatan: '2024/2025',
        email: undefined,
      });
    });
    expect(await screen.findByText(/Mahasiswa 2412345699 berhasil dibuat/)).toBeInTheDocument();
  });

  it('tambah dosen manual di tab dosen → createMasterLecturer dipanggil', async () => {
    mockedApi.listMasterStudents.mockResolvedValue(studentListResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturerListResponse());
    mockedApi.createMasterLecturer.mockResolvedValue({
      id: 2,
      nidn: '9876543210',
      message: 'Dosen berhasil dibuat',
    });
    render(<AdminMasterPage />);

    await screen.findByText('Budi Santoso');
    fireEvent.click(screen.getByRole('tab', { name: 'Master Dosen' }));
    await screen.findByText('Dr. Ahmad');

    fireEvent.click(screen.getByRole('button', { name: '+ Tambah Manual' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tambah dosen' });
    fireEvent.change(within(dialog).getByLabelText('NIDN'), {
      target: { value: '9876543210' },
    });
    fireEvent.change(within(dialog).getByLabelText('Nama Lengkap'), {
      target: { value: 'Dr. Baru' },
    });
    fireEvent.change(within(dialog).getByLabelText('Prodi'), { target: { value: 'TI' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      expect(mockedApi.createMasterLecturer).toHaveBeenCalledWith({
        nidn: '9876543210',
        fullName: 'Dr. Baru',
        prodiCode: 'TI',
        email: undefined,
      });
    });
  });

  it('import CSV → importMasterCsv dipanggil + ringkasan hasil ditampilkan', async () => {
    mockedApi.listMasterStudents.mockResolvedValue(studentListResponse());
    mockedApi.importMasterCsv.mockResolvedValue({
      filename: 'mahasiswa.csv',
      total: 2,
      inserted: 2,
      updated: 0,
      failed: [{ row: 3, reason: 'NIM duplikat' }],
    });
    render(<AdminMasterPage />);

    await screen.findByText('Budi Santoso');

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const file = new File(['nim,nama\n123,Test'], 'mahasiswa.csv', { type: 'text/csv' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockedApi.importMasterCsv).toHaveBeenCalledWith('students', file);
    });
    expect(await screen.findByText(/Import mahasiswa.csv selesai/)).toBeInTheDocument();
    expect(screen.getByText(/1 baris gagal diproses/)).toBeInTheDocument();
  });
});
