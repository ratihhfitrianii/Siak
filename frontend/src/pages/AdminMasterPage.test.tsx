import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminMasterPage } from './AdminMasterPage';
import * as api from '../lib/api';

// Mock module API
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    listFaculties: vi.fn(),
    createFaculty: vi.fn(),
    updateFaculty: vi.fn(),
    deleteFaculty: vi.fn(),
    listProdis: vi.fn(),
    createProdi: vi.fn(),
    updateProdi: vi.fn(),
    deleteProdi: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

const FACULTIES = [
  { id: 1, code: 'FT', name: 'Fakultas Teknik', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 2, code: 'FE', name: 'Fakultas Ekonomi', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

const PRODIS = [
  {
    id: 1,
    code: 'TI',
    name: 'Teknik Informatika',
    facultyId: 1,
    facultyCode: 'FT',
    facultyName: 'Fakultas Teknik',
    degree: 'S1',
    accreditation: 'A',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    code: 'SI',
    name: 'Sistem Informasi',
    facultyId: 1,
    facultyCode: 'FT',
    facultyName: 'Fakultas Teknik',
    degree: 'S1',
    accreditation: 'B',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function facultyResponse(items = FACULTIES) {
  return items;
}

function prodiResponse(items = PRODIS) {
  return items;
}

describe('AdminMasterPage (Fakultas & Prodi)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan tab Fakultas sebagai default + daftar fakultas', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());

    render(<AdminMasterPage />);

    expect(await screen.findByText('Master Data')).toBeInTheDocument();
    expect(await screen.findByText('Fakultas Teknik')).toBeInTheDocument();
    expect(screen.getByText('FT')).toBeInTheDocument();
    // "Aktif" appears in status badges — use container to scope
    expect(screen.getAllByText('Aktif').length).toBeGreaterThanOrEqual(2); // 2 faculties
    expect(mockedApi.listFaculties).toHaveBeenCalled();
    expect(mockedApi.listProdis).toHaveBeenCalled();
  });

  it('ganti tab ke Program Studi → daftar prodi', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));

    expect(await screen.findByText('Teknik Informatika')).toBeInTheDocument();
    expect(screen.getByText('TI')).toBeInTheDocument();
    // S1 appears in dropdown options too — check table cell specifically
    expect(screen.getAllByText('S1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('tambah fakultas baru → createFaculty dipanggil + list refresh', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.createFaculty.mockResolvedValue({ id: 3, code: 'FH', name: 'Fakultas Hukum', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');

    // Klik Tambah Fakultas
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Fakultas' }));

    // Isi form - use label text (with asterisk)
    fireEvent.change(screen.getByLabelText('Kode Fakultas *'), { target: { value: 'FH' } });
    fireEvent.change(screen.getByLabelText('Nama Fakultas *'), { target: { value: 'Fakultas Hukum' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Fakultas' }));

    await waitFor(() => {
      expect(mockedApi.createFaculty).toHaveBeenCalledWith({
        code: 'FH',
        name: 'Fakultas Hukum',
        isActive: true,
      });
    });

    expect(await screen.findByText(/Fakultas berhasil dibuat/)).toBeInTheDocument();
    expect(mockedApi.listFaculties).toHaveBeenCalledTimes(2); // initial + after create
  });

  it('edit fakultas → updateFaculty dipanggil', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.updateFaculty.mockResolvedValue({ id: 1, code: 'FT', name: 'Fakultas Teknik Baru', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');

    // Klik Edit pada fakultas pertama
    fireEvent.click(screen.getAllByText('Edit')[0]);

    // Nama berubah di form
    expect(screen.getByDisplayValue('Fakultas Teknik')).toBeInTheDocument();

    // Ubah nama
    fireEvent.change(screen.getByLabelText('Nama Fakultas *'), { target: { value: 'Fakultas Teknik Baru' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Update Fakultas' }));

    await waitFor(() => {
      expect(mockedApi.updateFaculty).toHaveBeenCalledWith(1, {
        code: 'FT',
        name: 'Fakultas Teknik Baru',
        isActive: true,
      });
    });

    expect(await screen.findByText(/Fakultas berhasil diupdate/)).toBeInTheDocument();
  });

  it('nonaktifkan fakultas → deleteFaculty dipanggil', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.deleteFaculty.mockResolvedValue({ message: 'Fakultas dinonaktifkan' });

    // Stub window.confirm
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');

    // Klik Nonaktifkan pada baris pertama (FT)
    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteFaculty).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/Fakultas dinonaktifkan/)).toBeInTheDocument();
  });

  it('tambah prodi baru → createProdi dipanggil', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.createProdi.mockResolvedValue({
      id: 3,
      code: 'TK',
      name: 'Teknik Kimia',
      facultyId: 1,
      facultyCode: 'FT',
      facultyName: 'Fakultas Teknik',
      degree: 'S1',
      accreditation: '',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));

    await screen.findByText('Teknik Informatika');

    // Klik Tambah Prodi
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Prodi' }));

    // Isi form - use label text (with asterisk)
    fireEvent.change(screen.getByLabelText('Kode Prodi *'), { target: { value: 'TK' } });
    fireEvent.change(screen.getByLabelText('Nama Prodi *'), { target: { value: 'Teknik Kimia' } });
    fireEvent.change(screen.getByLabelText('Fakultas *'), { target: { value: 'FT' } });
    fireEvent.change(screen.getByLabelText('Jenjang *'), { target: { value: 'S1' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Prodi' }));

    await waitFor(() => {
      expect(mockedApi.createProdi).toHaveBeenCalledWith({
        code: 'TK',
        name: 'Teknik Kimia',
        facultyCode: 'FT',
        degree: 'S1',
        accreditation: undefined,
        isActive: true,
      });
    });

    expect(await screen.findByText(/Prodi berhasil dibuat/)).toBeInTheDocument();
  });
});