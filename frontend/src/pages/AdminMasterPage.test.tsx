import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    listMasterStudents: vi.fn(),
    listMasterLecturers: vi.fn(),
    createMasterStudent: vi.fn(),
    createMasterLecturer: vi.fn(),
    updateMasterStudent: vi.fn(),
    updateMasterLecturer: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

const FACULTIES = [
  {
    id: 1,
    code: 'FT',
    name: 'Fakultas Teknik',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    code: 'FE',
    name: 'Fakultas Ekonomi',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
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

const STUDENTS = [
  {
    id: 1,
    nim: '20240001',
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
    nim: '20240002',
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
    nidn: '198001001',
    fullName: 'Dr. Andi Wijaya',
    email: 'andi@siak.local',
    userActive: true,
    isWali: true,
    prodiCode: 'TI',
    prodiName: 'Teknik Informatika',
    employmentType: 'PNS',
  },
  {
    id: 2,
    nidn: '198001002',
    fullName: 'Dr. Siti Rahayu',
    email: 'siti.rahayu@siak.local',
    userActive: true,
    isWali: false,
    prodiCode: 'SI',
    prodiName: 'Sistem Informasi',
    employmentType: 'Kontrak',
  },
];

function studentsResponse(items = STUDENTS) {
  return { items, pagination: { page: 1, limit: 100, total: items.length } };
}

function lecturersResponse(items = LECTURERS) {
  return { items, pagination: { page: 1, limit: 100, total: items.length } };
}

function mockAllLists() {
  mockedApi.listFaculties.mockResolvedValue(facultyResponse());
  mockedApi.listProdis.mockResolvedValue(prodiResponse());
  mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
  mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());
}

describe('AdminMasterPage (Fakultas & Prodi)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan tab Fakultas sebagai default + daftar fakultas', async () => {
    mockAllLists();

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
    mockAllLists();

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
    mockAllLists();
    mockedApi.createFaculty.mockResolvedValue({
      id: 3,
      code: 'FH',
      name: 'Fakultas Hukum',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');

    // Klik Tambah Fakultas
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Fakultas' }));

    // Isi form - use label text (with asterisk)
    fireEvent.change(screen.getByLabelText('Kode Fakultas *'), { target: { value: 'FH' } });
    fireEvent.change(screen.getByLabelText('Nama Fakultas *'), {
      target: { value: 'Fakultas Hukum' },
    });

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
    mockAllLists();
    mockedApi.updateFaculty.mockResolvedValue({
      id: 1,
      code: 'FT',
      name: 'Fakultas Teknik Baru',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');

    // Klik Edit pada fakultas pertama
    fireEvent.click(screen.getAllByText('Edit')[0]);

    // Nama berubah di form
    expect(screen.getByDisplayValue('Fakultas Teknik')).toBeInTheDocument();

    // Ubah nama
    fireEvent.change(screen.getByLabelText('Nama Fakultas *'), {
      target: { value: 'Fakultas Teknik Baru' },
    });

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
    mockAllLists();
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
    mockAllLists();
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

  it('tab Mahasiswa → menampilkan daftar mahasiswa', async () => {
    mockAllLists();

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mahasiswa' }));

    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('20240001')).toBeInTheDocument();
    expect(screen.getByText('Siti Aminah')).toBeInTheDocument();
    expect(mockedApi.listMasterStudents).toHaveBeenCalledWith({ limit: 100 });
  });

  it('tab Dosen → menampilkan daftar dosen', async () => {
    mockAllLists();

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));

    expect(await screen.findByText('Dr. Andi Wijaya')).toBeInTheDocument();
    expect(screen.getByText('198001001')).toBeInTheDocument();
    expect(screen.getByText('Dr. Siti Rahayu')).toBeInTheDocument();
    expect(mockedApi.listMasterLecturers).toHaveBeenCalledWith({ limit: 100 });
  });

  it('tab Dosen → badge status nonaktif + wali', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(
      lecturersResponse([{ ...LECTURERS[0], userActive: false, isWali: false }]),
    );

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));

    expect(await screen.findByText('Dr. Andi Wijaya')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Nonaktif')).toBeInTheDocument();
    expect(within(table).getByText('Tidak')).toBeInTheDocument();
  });

  it('tab Mahasiswa kosong → pesan empty state', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse([]));
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mahasiswa' }));

    expect(await screen.findByText('Belum ada data mahasiswa.')).toBeInTheDocument();
  });

  it('tab Dosen kosong → pesan empty state', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse([]));

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));

    expect(await screen.findByText('Belum ada data dosen.')).toBeInTheDocument();
  });

  it('tambah mahasiswa → createMasterStudent dipanggil + list refresh', async () => {
    mockAllLists();
    mockedApi.createMasterStudent.mockResolvedValue({
      id: 3,
      nim: '20240003',
      message: 'Mahasiswa berhasil dibuat',
    });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mahasiswa' }));
    await screen.findByText('Budi Santoso');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Mahasiswa' }));
    fireEvent.change(screen.getByLabelText('NIM *'), { target: { value: '20240003' } });
    fireEvent.change(screen.getByLabelText('Nama Lengkap *'), {
      target: { value: 'Candra Kirana' },
    });
    fireEvent.change(screen.getByLabelText('Program Studi *'), { target: { value: 'TI' } });
    fireEvent.change(screen.getByLabelText('Angkatan *'), { target: { value: '2025/2026' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan Mahasiswa' }));

    await waitFor(() => {
      expect(mockedApi.createMasterStudent).toHaveBeenCalledWith({
        nim: '20240003',
        fullName: 'Candra Kirana',
        prodiCode: 'TI',
        angkatan: '2025/2026',
        email: '',
      });
    });

    expect(await screen.findByText(/Mahasiswa berhasil dibuat/)).toBeInTheDocument();
  });

  it('tambah dosen → createMasterLecturer dipanggil + list refresh', async () => {
    mockAllLists();
    mockedApi.createMasterLecturer.mockResolvedValue({
      id: 3,
      nidn: '198001003',
      message: 'Dosen berhasil dibuat',
    });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));
    await screen.findByText('Dr. Andi Wijaya');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Dosen' }));
    fireEvent.change(screen.getByLabelText('NIDN *'), { target: { value: '198001003' } });
    fireEvent.change(screen.getByLabelText('Nama Lengkap *'), {
      target: { value: 'Prof. Budi Hartono' },
    });
    fireEvent.change(screen.getByLabelText('Program Studi *'), { target: { value: 'TI' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan Dosen' }));

    await waitFor(() => {
      expect(mockedApi.createMasterLecturer).toHaveBeenCalledWith({
        nidn: '198001003',
        fullName: 'Prof. Budi Hartono',
        prodiCode: 'TI',
        email: '',
      });
    });

    expect(await screen.findByText(/Dosen berhasil dibuat/)).toBeInTheDocument();
  });

  it('gagal memuat mahasiswa → pesan error', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockRejectedValue(new Error('x'));
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());

    render(<AdminMasterPage />);

    expect(await screen.findByText('Gagal memuat data mahasiswa')).toBeInTheDocument();
  });

  it('gagal memuat dosen → pesan error', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockRejectedValue(new Error('x'));

    render(<AdminMasterPage />);

    expect(await screen.findByText('Gagal memuat data dosen')).toBeInTheDocument();
  });

  it('tambah mahasiswa gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.createMasterStudent.mockRejectedValue({ message: 'NIM sudah terdaftar' });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mahasiswa' }));
    await screen.findByText('Budi Santoso');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Mahasiswa' }));
    fireEvent.change(screen.getByLabelText('NIM *'), { target: { value: '20240003' } });
    fireEvent.change(screen.getByLabelText('Nama Lengkap *'), {
      target: { value: 'Candra Kirana' },
    });
    fireEvent.change(screen.getByLabelText('Program Studi *'), { target: { value: 'TI' } });
    fireEvent.change(screen.getByLabelText('Angkatan *'), { target: { value: '2025/2026' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan Mahasiswa' }));

    expect(await screen.findByText('NIM sudah terdaftar')).toBeInTheDocument();
  });

  it('tambah dosen gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.createMasterLecturer.mockRejectedValue({ message: 'NIDN sudah terdaftar' });

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));
    await screen.findByText('Dr. Andi Wijaya');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Dosen' }));
    fireEvent.change(screen.getByLabelText('NIDN *'), { target: { value: '198001003' } });
    fireEvent.change(screen.getByLabelText('Nama Lengkap *'), {
      target: { value: 'Prof. Budi Hartono' },
    });
    fireEvent.change(screen.getByLabelText('Program Studi *'), { target: { value: 'TI' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan Dosen' }));

    expect(await screen.findByText('NIDN sudah terdaftar')).toBeInTheDocument();
  });

  it('fakultas nonaktif → badge Nonaktif', async () => {
    mockedApi.listFaculties.mockResolvedValue([
      { ...FACULTIES[0], isActive: false },
      ...FACULTIES.slice(1),
    ]);
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());

    render(<AdminMasterPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Nonaktif')).toBeInTheDocument();
    expect(within(table).getByText('Aktif')).toBeInTheDocument();
  });

  it('prodi kosong → empty state', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse([]));
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));
    expect(await screen.findByText('Belum ada data program studi.')).toBeInTheDocument();
  });

  it('klik Tambah Mahasiswa → popup modal muncul dengan judul + form kosong', async () => {
    mockAllLists();

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mahasiswa' }));
    await screen.findByText('Budi Santoso');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Mahasiswa' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Tambah Mahasiswa')).toBeInTheDocument();
    expect(screen.getByLabelText('NIM *')).toHaveValue('');
  });

  it('klik Edit mahasiswa → modal "Edit Mahasiswa" terisi data + updateMasterStudent dipanggil', async () => {
    mockAllLists();
    mockedApi.updateMasterStudent.mockResolvedValue({
      id: 1,
      nim: '20240001',
      message: 'Mahasiswa berhasil diupdate',
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mahasiswa' }));
    await screen.findByText('Budi Santoso');

    fireEvent.click(screen.getAllByText('Edit')[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Mahasiswa')).toBeInTheDocument();
    expect(screen.getByLabelText('NIM *')).toHaveValue('20240001');
    expect(screen.getByDisplayValue('Budi Santoso')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nama Lengkap *'), {
      target: { value: 'Budi Santoso Baru' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Mahasiswa' }));

    await waitFor(() => {
      expect(mockedApi.updateMasterStudent).toHaveBeenCalledWith(1, {
        fullName: 'Budi Santoso Baru',
        prodiCode: 'TI',
        angkatan: '2024/2025',
        email: 'budi@student.siak.local',
      });
    });

    expect(await screen.findByText(/Mahasiswa berhasil diupdate/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('klik Edit dosen → modal "Edit Dosen" terisi + updateMasterLecturer dipanggil', async () => {
    mockAllLists();
    mockedApi.updateMasterLecturer.mockResolvedValue({
      id: 1,
      nidn: '198001001',
      message: 'Dosen berhasil diupdate',
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));
    await screen.findByText('Dr. Andi Wijaya');

    fireEvent.click(screen.getAllByText('Edit')[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Dosen')).toBeInTheDocument();
    expect(screen.getByLabelText('NIDN *')).toHaveValue('198001001');

    fireEvent.change(screen.getByLabelText('Nama Lengkap *'), {
      target: { value: 'Dr. Andi Wijaya M.Kom' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Dosen' }));

    await waitFor(() => {
      expect(mockedApi.updateMasterLecturer).toHaveBeenCalledWith(1, {
        fullName: 'Dr. Andi Wijaya M.Kom',
        prodiCode: 'TI',
        email: 'andi@siak.local',
      });
    });

    expect(await screen.findByText(/Dosen berhasil diupdate/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tombol Batal menutup modal tanpa menyimpan', async () => {
    mockAllLists();

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Fakultas' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedApi.createFaculty).not.toHaveBeenCalled();
  });

  it('tombol Tutup (X) menutup modal', async () => {
    mockAllLists();

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));
    await screen.findByText('Dr. Andi Wijaya');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Dosen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
