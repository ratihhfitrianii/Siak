import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminMasterPage } from './AdminMasterPage';
import * as api from '../lib/api';

// Holds the current mock user for AuthContext (set per-test).
const { mockAuthUser, setMockAuthUser } = vi.hoisted(() => {
  return {
    mockAuthUser: { adminFacultyCode: null as string | null },
    setMockAuthUser: (u: { adminFacultyCode: string | null }) => {
      mockAuthUser.adminFacultyCode = u.adminFacultyCode;
    },
  };
});

// Mock AuthContext so AdminMasterPage can call useAuth() without a real provider.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    booting: false,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    refreshMe: vi.fn(),
  }),
}));

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
    listAcademicFaculties: vi.fn(),
    listAcademicProdis: vi.fn(),
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
    deleteRoom: vi.fn(),
    listCourses: vi.fn(),
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
    deleteCourse: vi.fn(),
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
  return { items, pagination: { page: 1, limit: 10, total: items.length } };
}

function prodiResponse(items = PRODIS) {
  return { items, pagination: { page: 1, limit: 10, total: items.length } };
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
  mockNewLists();
}

/** Default honest responses untuk fungsi baru (tab Ruangan/Prodi/MK). */
function mockNewLists() {
  mockedApi.listAcademicFaculties.mockResolvedValue(facultyResponse());
  mockedApi.listAcademicProdis.mockResolvedValue(prodiResponse());
  mockedApi.listRooms.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 10, total: 0 },
  });
  mockedApi.listCourses.mockResolvedValue({
    items: [],
  });
}

describe('AdminMasterPage (Fakultas & Prodi)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan tab Fakultas sebagai default + daftar fakultas', async () => {
    mockAllLists();

    render(<AdminMasterPage />);

    expect(await screen.findByText('Fakultas Teknik')).toBeInTheDocument();
    expect(screen.getByText('FT')).toBeInTheDocument();
    // "Aktif" appears in status badges — use container to scope
    expect(screen.getAllByText('Aktif').length).toBeGreaterThanOrEqual(2); // 2 faculties
    expect(mockedApi.listFaculties).toHaveBeenCalledWith({ page: 1, limit: 10, search: '' });
    expect(mockedApi.listProdis).toHaveBeenCalledWith({ page: 1, limit: 10, search: '' });
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
    expect(mockedApi.listFaculties).toHaveBeenCalledWith({ page: 1, limit: 10, search: '' });
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
    expect(mockedApi.listFaculties).toHaveBeenCalledTimes(2);
    expect(mockedApi.listFaculties).toHaveBeenCalledWith({ page: 1, limit: 10, search: '' });
  });

  it('tambah prodi baru → createProdi dipanggil + list refresh', async () => {
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
    expect(mockedApi.listProdis).toHaveBeenCalledTimes(2);
    expect(mockedApi.listProdis).toHaveBeenCalledWith({ page: 1, limit: 10, search: '' });
  });

  it('tab Mahasiswa → menampilkan daftar mahasiswa', async () => {
    mockAllLists();

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mahasiswa' }));

    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('20240001')).toBeInTheDocument();
    expect(screen.getByText('Siti Aminah')).toBeInTheDocument();
    expect(mockedApi.listMasterStudents).toHaveBeenCalledWith({ page: 1, limit: 10, search: '' });
  });

  it('tab Dosen → menampilkan daftar dosen', async () => {
    mockAllLists();

    render(<AdminMasterPage />);

    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Dosen' }));

    expect(await screen.findByText('Dr. Andi Wijaya')).toBeInTheDocument();
    expect(screen.getByText('198001001')).toBeInTheDocument();
    expect(screen.getByText('Dr. Siti Rahayu')).toBeInTheDocument();
    expect(mockedApi.listMasterLecturers).toHaveBeenCalledWith({ page: 1, limit: 10, search: '' });
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
    mockNewLists();

    render(<AdminMasterPage />);

    expect(await screen.findByText('Gagal memuat data mahasiswa')).toBeInTheDocument();
  });

  it('gagal memuat dosen → pesan error', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockRejectedValue(new Error('x'));
    mockNewLists();

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
    mockedApi.listFaculties.mockResolvedValue(
      facultyResponse([{ ...FACULTIES[0], isActive: false }, ...FACULTIES.slice(1)]),
    );
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());

    render(<AdminMasterPage />);
    await waitFor(() => screen.findByText('Fakultas Teknik'));

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

  it('nonaktifkan prodi → deleteProdi dipanggil', async () => {
    mockAllLists();
    mockedApi.deleteProdi.mockResolvedValue({ message: 'Prodi dinonaktifkan' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteProdi).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/Prodi dinonaktifkan/)).toBeInTheDocument();
  });

  it('edit prodi → updateProdi dipanggil', async () => {
    mockAllLists();
    mockedApi.updateProdi.mockResolvedValue({
      id: 1,
      code: 'TI',
      name: 'Teknik Informatika V2',
      facultyId: 1,
      facultyCode: 'FT',
      facultyName: 'Fakultas Teknik',
      degree: 'S1',
      accreditation: 'A',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText('Edit Prodi')).toBeInTheDocument();
    expect(screen.getByLabelText('Kode Prodi *')).toHaveValue('TI');

    fireEvent.change(screen.getByLabelText('Nama Prodi *'), {
      target: { value: 'Teknik Informatika V2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Prodi' }));

    await waitFor(() => {
      expect(mockedApi.updateProdi).toHaveBeenCalledWith(1, {
        code: 'TI',
        name: 'Teknik Informatika V2',
        facultyCode: 'FT',
        degree: 'S1',
        accreditation: 'A',
        isActive: true,
      });
    });

    expect(await screen.findByText(/Prodi berhasil diupdate/)).toBeInTheDocument();
  });

  it('tambah fakultas gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.createFaculty.mockRejectedValue({ message: 'Kode sudah ada' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Fakultas' }));
    fireEvent.change(screen.getByLabelText('Kode Fakultas *'), { target: { value: 'FT' } });
    fireEvent.change(screen.getByLabelText('Nama Fakultas *'), {
      target: { value: 'Duplikat' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Fakultas' }));

    expect(await screen.findByText('Kode sudah ada')).toBeInTheDocument();
  });

  it('edit fakultas gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.updateFaculty.mockRejectedValue({ message: 'Tidak ditemukan' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.change(screen.getByLabelText('Nama Fakultas *'), {
      target: { value: 'Gagal Update' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Fakultas' }));

    expect(await screen.findByText('Tidak ditemukan')).toBeInTheDocument();
  });

  it('nonaktifkan fakultas gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.deleteFaculty.mockRejectedValue({ message: 'Gagal hapus' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(await screen.findByText('Gagal hapus')).toBeInTheDocument();
  });

  it('nonaktifkan prodi gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.deleteProdi.mockRejectedValue({ message: 'Prodi terpakai' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(await screen.findByText('Prodi terpakai')).toBeInTheDocument();
  });

  it('tambah prodi gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.createProdi.mockRejectedValue({ message: 'Prodi duplikat' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Prodi' }));
    fireEvent.change(screen.getByLabelText('Kode Prodi *'), { target: { value: 'XX' } });
    fireEvent.change(screen.getByLabelText('Nama Prodi *'), { target: { value: 'Duplikat' } });
    fireEvent.change(screen.getByLabelText('Fakultas *'), { target: { value: 'FT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Prodi' }));

    expect(await screen.findByText('Prodi duplikat')).toBeInTheDocument();
  });

  it('edit prodi gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.updateProdi.mockRejectedValue({ message: 'Gagal update' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.change(screen.getByLabelText('Nama Prodi *'), {
      target: { value: 'Gagal Update' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Prodi' }));

    expect(await screen.findByText('Gagal update')).toBeInTheDocument();
  });

  it('fakultas kosong → empty state', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse([]));
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());
    mockNewLists();

    render(<AdminMasterPage />);
    expect(await screen.findByText('Belum ada data fakultas.')).toBeInTheDocument();
  });

  it('gagal memuat fakultas → pesan error', async () => {
    mockedApi.listFaculties.mockRejectedValue(new Error('x'));
    mockedApi.listProdis.mockResolvedValue(prodiResponse());
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());
    mockNewLists();

    render(<AdminMasterPage />);
    expect(await screen.findByText('Gagal memuat data fakultas')).toBeInTheDocument();
  });

  it('gagal memuat prodi → pesan error', async () => {
    mockedApi.listFaculties.mockResolvedValue(facultyResponse());
    mockedApi.listProdis.mockRejectedValue(new Error('x'));
    mockedApi.listMasterStudents.mockResolvedValue(studentsResponse());
    mockedApi.listMasterLecturers.mockResolvedValue(lecturersResponse());
    mockNewLists();

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Program Studi' }));
    expect(await screen.findByText('Gagal memuat data prodi')).toBeInTheDocument();
  });
});

// ===== Tab Ruangan =====
describe('AdminMasterPage (Ruangan)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('tab Ruangan tanpa fakultas dipilih → pesan pilih fakultas', async () => {
    mockAllLists();

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    expect(
      await screen.findByText('Pilih fakultas terlebih dahulu untuk melihat ruangan.'),
    ).toBeInTheDocument();
  });

  it('tab Ruangan → pilih fakultas menampilkan daftar ruangan', async () => {
    mockAllLists();
    const ROOMS = [
      {
        id: 1,
        code: 'R.301',
        name: 'Ruang 301',
        capacity: 40,
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        code: 'R.302',
        name: 'Ruang 302',
        capacity: 30,
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockedApi.listRooms.mockResolvedValue({
      items: ROOMS,
      pagination: { page: 1, limit: 10, total: 2 },
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    // Select faculty from dropdown
    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });

    expect(await screen.findByText('R.301')).toBeInTheDocument();
    expect(screen.getByText('Ruang 301')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(mockedApi.listRooms).toHaveBeenCalled();
  });

  it('tab Ruangan → ruangan kosong setelah pilih fakultas', async () => {
    mockAllLists();
    mockedApi.listRooms.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0 },
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });

    expect(await screen.findByText('Belum ada data ruangan.')).toBeInTheDocument();
  });

  it('tambah ruangan → createRoom dipanggil', async () => {
    mockAllLists();
    mockedApi.listRooms.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0 },
    });
    mockedApi.createRoom.mockResolvedValue({
      id: 1,
      code: 'R.101',
      name: 'Ruang 101',
      capacity: 35,
      facultyId: 1,
      facultyName: 'Fakultas Teknik',
      facultyCode: 'FT',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Belum ada data ruangan.');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Ruangan' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kode Ruangan *'), { target: { value: 'R.101' } });
    fireEvent.change(screen.getByLabelText('Nama Ruangan *'), { target: { value: 'Ruang 101' } });
    fireEvent.change(screen.getByLabelText('Kapasitas *'), { target: { value: '35' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan Ruangan' }));

    await waitFor(() => {
      expect(mockedApi.createRoom).toHaveBeenCalledWith({
        code: 'R.101',
        name: 'Ruang 101',
        capacity: 35,
        facultyCode: 'FT',
        isActive: true,
      });
    });

    expect(await screen.findByText(/Ruangan berhasil dibuat/)).toBeInTheDocument();
  });

  it('edit ruangan → updateRoom dipanggil', async () => {
    const ROOMS = [
      {
        id: 1,
        code: 'R.301',
        name: 'Ruang 301',
        capacity: 40,
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockAllLists();
    mockedApi.listRooms.mockResolvedValue({
      items: ROOMS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    mockedApi.updateRoom.mockResolvedValue({ ...ROOMS[0], name: 'Ruang 301 Baru' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('R.301');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText('Edit Ruangan')).toBeInTheDocument();
    expect(screen.getByLabelText('Kode Ruangan *')).toHaveValue('R.301');

    fireEvent.change(screen.getByLabelText('Nama Ruangan *'), {
      target: { value: 'Ruang 301 Baru' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Ruangan' }));

    await waitFor(() => {
      expect(mockedApi.updateRoom).toHaveBeenCalledWith(1, {
        name: 'Ruang 301 Baru',
        capacity: 40,
        facultyCode: 'FT',
        isActive: true,
      });
    });

    expect(await screen.findByText(/Ruangan berhasil diupdate/)).toBeInTheDocument();
  });

  it('nonaktifkan ruangan → deleteRoom dipanggil', async () => {
    const ROOMS = [
      {
        id: 1,
        code: 'R.301',
        name: 'Ruang 301',
        capacity: 40,
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockAllLists();
    mockedApi.listRooms.mockResolvedValue({
      items: ROOMS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    mockedApi.deleteRoom.mockResolvedValue({ message: 'Ruangan dinonaktifkan' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('R.301');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteRoom).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/Ruangan dinonaktifkan/)).toBeInTheDocument();
  });

  it('gagal memuat ruangan → pesan error', async () => {
    mockAllLists();
    mockedApi.listRooms.mockRejectedValue(new Error('x'));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });

    expect(await screen.findByText('Gagal memuat data ruangan')).toBeInTheDocument();
  });

  it('tambah ruangan gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.listRooms.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0 },
    });
    mockedApi.createRoom.mockRejectedValue({ message: 'Kode ruangan sudah ada' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Belum ada data ruangan.');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Ruangan' }));
    fireEvent.change(screen.getByLabelText('Kode Ruangan *'), { target: { value: 'R.DUP' } });
    fireEvent.change(screen.getByLabelText('Nama Ruangan *'), { target: { value: 'Duplikat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Ruangan' }));

    expect(await screen.findByText('Kode ruangan sudah ada')).toBeInTheDocument();
  });

  it('nonaktifkan ruangan gagal → pesan error API', async () => {
    const ROOMS = [
      {
        id: 1,
        code: 'R.301',
        name: 'Ruang 301',
        capacity: 40,
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockAllLists();
    mockedApi.listRooms.mockResolvedValue({
      items: ROOMS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    mockedApi.deleteRoom.mockRejectedValue({ message: 'Ruangan sedang dipakai' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('R.301');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(await screen.findByText('Ruangan sedang dipakai')).toBeInTheDocument();
  });

  it('nonaktifkan konfirmasi dibatalkan → deleteRoom tidak dipanggil', async () => {
    const ROOMS = [
      {
        id: 1,
        code: 'R.301',
        name: 'Ruang 301',
        capacity: 40,
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockAllLists();
    mockedApi.listRooms.mockResolvedValue({
      items: ROOMS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Ruangan' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('R.301');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteRoom).not.toHaveBeenCalled();
    });
  });
});

// ===== Tab Prodi (Admin Akademik) =====
describe('AdminMasterPage (Prodi Admin Akademik)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('tab Prodi tanpa fakultas dipilih → pesan pilih fakultas', async () => {
    mockAllLists();

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    expect(
      await screen.findByText('Pilih fakultas terlebih dahulu untuk melihat prodi fakultas ini.'),
    ).toBeInTheDocument();
  });

  it('tab Prodi → pilih fakultas menampilkan daftar prodi', async () => {
    mockAllLists();
    const AK_PRODIS = [
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
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: AK_PRODIS,
      pagination: { page: 1, limit: 10, total: 2 },
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });

    expect(await screen.findByText('Teknik Informatika')).toBeInTheDocument();
    expect(screen.getByText('Sistem Informasi')).toBeInTheDocument();
    expect(mockedApi.listAcademicProdis).toHaveBeenCalledWith(
      expect.objectContaining({ facultyId: 1 }),
    );
  });

  it('tab Prodi → prodi kosong setelah pilih fakultas', async () => {
    mockAllLists();
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0 },
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });

    expect(
      await screen.findByText('Belum ada data program studi pada fakultas ini.'),
    ).toBeInTheDocument();
  });

  it('tambah prodi → createProdi dipanggil', async () => {
    mockAllLists();
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0 },
    });
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
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Belum ada data program studi pada fakultas ini.');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Prodi' }));
    fireEvent.change(screen.getByLabelText('Kode Prodi *'), { target: { value: 'TK' } });
    fireEvent.change(screen.getByLabelText('Nama Prodi *'), { target: { value: 'Teknik Kimia' } });
    fireEvent.change(screen.getByLabelText('Fakultas *'), { target: { value: 'FT' } });
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

  it('edit prodi → updateProdi dipanggil', async () => {
    const AK_PRODIS = [
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
    ];
    mockAllLists();
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: AK_PRODIS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    mockedApi.updateProdi.mockResolvedValue({ ...AK_PRODIS[0], name: 'TI Updated' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText('Edit Prodi')).toBeInTheDocument();
    expect(screen.getByLabelText('Kode Prodi *')).toHaveValue('TI');

    fireEvent.change(screen.getByLabelText('Nama Prodi *'), { target: { value: 'TI Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Prodi' }));

    await waitFor(() => {
      expect(mockedApi.updateProdi).toHaveBeenCalledWith(1, {
        code: 'TI',
        name: 'TI Updated',
        facultyCode: 'FT',
        degree: 'S1',
        accreditation: 'A',
        isActive: true,
      });
    });

    expect(await screen.findByText(/Prodi berhasil diupdate/)).toBeInTheDocument();
  });

  it('nonaktifkan prodi → deleteProdi dipanggil', async () => {
    const AK_PRODIS = [
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
    ];
    mockAllLists();
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: AK_PRODIS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    mockedApi.deleteProdi.mockResolvedValue({ message: 'Prodi dinonaktifkan' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteProdi).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/Prodi dinonaktifkan/)).toBeInTheDocument();
  });

  it('gagal memuat prodi akademik → pesan error', async () => {
    mockAllLists();
    mockedApi.listAcademicProdis.mockRejectedValue(new Error('x'));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });

    expect(await screen.findByText('Gagal memuat data prodi')).toBeInTheDocument();
  });

  it('tambah prodi gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0 },
    });
    mockedApi.createProdi.mockRejectedValue({ message: 'Prodi sudah ada' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Belum ada data program studi pada fakultas ini.');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Prodi' }));
    fireEvent.change(screen.getByLabelText('Kode Prodi *'), { target: { value: 'XX' } });
    fireEvent.change(screen.getByLabelText('Nama Prodi *'), { target: { value: 'Duplikat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Prodi' }));

    expect(await screen.findByText('Prodi sudah ada')).toBeInTheDocument();
  });

  it('nonaktifkan prodi gagal → pesan error API', async () => {
    const AK_PRODIS = [
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
    ];
    mockAllLists();
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: AK_PRODIS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    mockedApi.deleteProdi.mockRejectedValue({ message: 'Prodi terpakai' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(await screen.findByText('Prodi terpakai')).toBeInTheDocument();
  });

  it('nonaktifkan prodi konfirmasi dibatalkan → deleteProdi tidak dipanggil', async () => {
    const AK_PRODIS = [
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
    ];
    mockAllLists();
    mockedApi.listAcademicProdis.mockResolvedValue({
      items: AK_PRODIS,
      pagination: { page: 1, limit: 10, total: 1 },
    });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    const select = screen.getByDisplayValue('Pilih Fakultas');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Teknik Informatika');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteProdi).not.toHaveBeenCalled();
    });
  });

  it('ganti fakultas → muat ulang prodi', async () => {
    const AK_PRODIS_FT = [
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
    ];
    const AK_PRODIS_FE = [
      {
        id: 3,
        code: 'AKT',
        name: 'Akuntansi',
        facultyId: 2,
        facultyCode: 'FE',
        facultyName: 'Fakultas Ekonomi',
        degree: 'S1',
        accreditation: 'B',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockAllLists();
    mockedApi.listAcademicProdis.mockImplementation(async (params?: { facultyId?: number }) => {
      const fid = params?.facultyId;
      if (fid === 1) return { items: AK_PRODIS_FT, pagination: { page: 1, limit: 10, total: 1 } };
      if (fid === 2) return { items: AK_PRODIS_FE, pagination: { page: 1, limit: 10, total: 1 } };
      return { items: [], pagination: { page: 1, limit: 10, total: 0 } };
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Prodi' }));

    // Re-query select fresh sebelum setiap change (hindari stale node setelah re-render)
    let select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    await screen.findByText('Teknik Informatika');

    select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '2' } });
    await screen.findByText('Akuntansi');
  });
});

// ===== Tab Mata Kuliah =====
describe('AdminMasterPage (Mata Kuliah)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('tab Mata Kuliah → menampilkan daftar mata kuliah', async () => {
    mockAllLists();
    const COURSES = [
      {
        id: 1,
        code: 'TI101',
        name: 'Algoritma',
        credits: 3,
        description: 'Algoritma dasar',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        prodiId: 1,
        prodiName: 'Teknik Informatika',
        prodiCode: 'TI',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
      },
      {
        id: 2,
        code: 'TI102',
        name: 'Pemrograman',
        credits: 4,
        description: 'Pemrograman web',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        prodiId: 1,
        prodiName: 'Teknik Informatika',
        prodiCode: 'TI',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
      },
    ];
    mockedApi.listCourses.mockResolvedValue({ items: COURSES });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));

    expect(await screen.findByText('TI101')).toBeInTheDocument();
    expect(screen.getByText('Algoritma')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('TI102')).toBeInTheDocument();
    expect(screen.getByText('Pemrograman')).toBeInTheDocument();
  });

  it('tab Mata Kuliah → empty state', async () => {
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: [] });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));

    expect(await screen.findByText('Belum ada data mata kuliah.')).toBeInTheDocument();
  });

  it('tambah mata kuliah → createCourse dipanggil', async () => {
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: [] });
    mockedApi.createCourse.mockResolvedValue({
      id: 1,
      code: 'TI101',
      name: 'Algoritma',
      credits: 3,
      description: 'Algoritma dasar',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      prodiId: 1,
      prodiName: 'Teknik Informatika',
      prodiCode: 'TI',
      facultyId: 1,
      facultyName: 'Fakultas Teknik',
      facultyCode: 'FT',
    });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));
    await screen.findByText('Belum ada data mata kuliah.');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Mata Kuliah' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kode Mata Kuliah *'), { target: { value: 'TI101' } });
    fireEvent.change(screen.getByLabelText('Nama Mata Kuliah *'), {
      target: { value: 'Algoritma' },
    });
    fireEvent.change(screen.getByLabelText('SKS *'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Deskripsi'), { target: { value: 'Algoritma dasar' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan Mata Kuliah' }));

    await waitFor(() => {
      expect(mockedApi.createCourse).toHaveBeenCalledWith({
        code: 'TI101',
        name: 'Algoritma',
        credits: 3,
        description: 'Algoritma dasar',
      });
    });

    expect(await screen.findByText(/Mata kuliah berhasil dibuat/)).toBeInTheDocument();
  });

  it('edit mata kuliah → updateCourse dipanggil', async () => {
    const COURSES = [
      {
        id: 1,
        code: 'TI101',
        name: 'Algoritma',
        credits: 3,
        description: 'Algoritma dasar',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        prodiId: 1,
        prodiName: 'Teknik Informatika',
        prodiCode: 'TI',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
      },
    ];
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: COURSES });
    mockedApi.updateCourse.mockResolvedValue({ ...COURSES[0], name: 'Algoritma Lanjut' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));
    await screen.findByText('TI101');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText('Edit Mata Kuliah')).toBeInTheDocument();
    expect(screen.getByLabelText('Kode Mata Kuliah *')).toHaveValue('TI101');

    fireEvent.change(screen.getByLabelText('Nama Mata Kuliah *'), {
      target: { value: 'Algoritma Lanjut' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Mata Kuliah' }));

    await waitFor(() => {
      expect(mockedApi.updateCourse).toHaveBeenCalledWith(1, {
        name: 'Algoritma Lanjut',
        credits: 3,
        description: 'Algoritma dasar',
      });
    });

    expect(await screen.findByText(/Mata kuliah berhasil diupdate/)).toBeInTheDocument();
  });

  it('nonaktifkan mata kuliah → deleteCourse dipanggil', async () => {
    const COURSES = [
      {
        id: 1,
        code: 'TI101',
        name: 'Algoritma',
        credits: 3,
        description: 'Algoritma dasar',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        prodiId: 1,
        prodiName: 'Teknik Informatika',
        prodiCode: 'TI',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
      },
    ];
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: COURSES });
    mockedApi.deleteCourse.mockResolvedValue({ message: 'Mata kuliah dinonaktifkan' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));
    await screen.findByText('TI101');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteCourse).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/Mata kuliah dinonaktifkan/)).toBeInTheDocument();
  });

  it('gagal memuat mata kuliah → pesan error', async () => {
    mockAllLists();
    mockedApi.listCourses.mockRejectedValue(new Error('x'));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));

    expect(await screen.findByText('Gagal memuat data mata kuliah')).toBeInTheDocument();
  });

  it('tambah mata kuliah gagal → pesan error API', async () => {
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: [] });
    mockedApi.createCourse.mockRejectedValue({ message: 'Kode MK sudah ada' });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));
    await screen.findByText('Belum ada data mata kuliah.');

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Mata Kuliah' }));
    fireEvent.change(screen.getByLabelText('Kode Mata Kuliah *'), { target: { value: 'DUP' } });
    fireEvent.change(screen.getByLabelText('Nama Mata Kuliah *'), {
      target: { value: 'Duplikat' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Mata Kuliah' }));

    expect(await screen.findByText('Kode MK sudah ada')).toBeInTheDocument();
  });

  it('nonaktifkan mata kuliah gagal → pesan error API', async () => {
    const COURSES = [
      {
        id: 1,
        code: 'TI101',
        name: 'Algoritma',
        credits: 3,
        description: 'Algoritma dasar',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        prodiId: 1,
        prodiName: 'Teknik Informatika',
        prodiCode: 'TI',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
      },
    ];
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: COURSES });
    mockedApi.deleteCourse.mockRejectedValue({ message: 'MK terpakai' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));
    await screen.findByText('TI101');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(await screen.findByText('MK terpakai')).toBeInTheDocument();
  });

  it('nonaktifkan mata kuliah konfirmasi dibatalkan → deleteCourse tidak dipanggil', async () => {
    const COURSES = [
      {
        id: 1,
        code: 'TI101',
        name: 'Algoritma',
        credits: 3,
        description: 'Algoritma dasar',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        prodiId: 1,
        prodiName: 'Teknik Informatika',
        prodiCode: 'TI',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
      },
    ];
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: COURSES });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));
    await screen.findByText('TI101');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteCourse).not.toHaveBeenCalled();
    });
  });

  it('mata kuliah tanpa deskripsi → tampil "-"', async () => {
    const COURSES = [
      {
        id: 1,
        code: 'TI101',
        name: 'Algoritma',
        credits: 3,
        description: '',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        prodiId: 1,
        prodiName: 'Teknik Informatika',
        prodiCode: 'TI',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        facultyCode: 'FT',
      },
    ];
    mockAllLists();
    mockedApi.listCourses.mockResolvedValue({ items: COURSES });

    render(<AdminMasterPage />);
    await screen.findByText('Fakultas Teknik');
    fireEvent.click(screen.getByRole('tab', { name: 'Mata Kuliah' }));
    await screen.findByText('TI101');

    const table = screen.getByRole('table');
    expect(within(table).getByText('-')).toBeInTheDocument();
  });
});

describe('AdminMasterPage (mode akademikOnly)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hanya menampilkan tab Ruangan/Prodi/Mata Kuliah (default Ruangan), tanpa tab admin_sistem', async () => {
    setMockAuthUser({ adminFacultyCode: 'FT' });
    mockNewLists();
    mockedApi.listRooms.mockResolvedValue({
      items: [
        {
          id: 1,
          code: 'R101',
          name: 'Ruang 101',
          capacity: 40,
          facultyId: 1,
          facultyName: 'Fakultas Teknik',
          facultyCode: 'FT',
          isActive: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      pagination: { page: 1, limit: 10, total: 1 },
    });

    render(<AdminMasterPage akademikOnly />);

    expect(await screen.findByText('R101')).toBeInTheDocument();
    // Tab admin_sistem TIDAK muncul
    expect(screen.queryByRole('tab', { name: 'Fakultas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Program Studi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Mahasiswa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dosen' })).not.toBeInTheDocument();
    // Tab akademik muncul
    expect(screen.getByRole('tab', { name: 'Ruangan' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Prodi' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mata Kuliah' })).toBeInTheDocument();
    // Tidak memanggil endpoint admin_sistem (user.manage) di mount
    expect(mockedApi.listFaculties).not.toHaveBeenCalled();
    expect(mockedApi.listMasterStudents).not.toHaveBeenCalled();
  });
});
