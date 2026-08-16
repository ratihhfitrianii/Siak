import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminCourseReviewPage } from './AdminCourseReviewPage';
import * as api from '../lib/api';
import type {
  CourseSelectionForReview,
  CourseSelectionsForReviewResponse,
  SemesterOption,
  Prodi,
} from '../lib/types';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getCourseSelectionsForReview: vi.fn(),
    reviewCourseSelection: vi.fn(),
    getDosenSemesters: vi.fn(),
    listProdis: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

const SEMESTERS: SemesterOption[] = [
  { id: 1, code: '20242', name: 'Ganjil 2024/2025' },
  { id: 2, code: '20251', name: 'Genap 2024/2025' },
];

const PRODIS: Prodi[] = [
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
    createdAt: '',
    updatedAt: '',
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
    createdAt: '',
    updatedAt: '',
  },
];

const SELECTIONS: CourseSelectionForReview[] = [
  {
    id: 1,
    lecturerId: 10,
    lecturerName: 'Dr. Andi Wijaya',
    nidn: '198001001',
    curriculumId: 100,
    courseCode: 'MK001',
    courseName: 'Pemrograman Dasar',
    credits: 3,
    semesterNumber: 1,
    isMandatory: true,
    semesterCode: '20242',
    semesterName: 'Ganjil 2024/2025',
    prodiName: 'Teknik Informatika',
    status: 'diajukan',
    priority: 1,
    notes: 'Mengajar sejak 2020',
    reviewedBy: null,
    reviewedAt: null,
    reviewedByName: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    lecturerId: 11,
    lecturerName: 'Dr. Siti Rahayu',
    nidn: '198002002',
    curriculumId: 101,
    courseCode: 'MK002',
    courseName: 'Basis Data',
    credits: 3,
    semesterNumber: 2,
    isMandatory: true,
    semesterCode: '20242',
    semesterName: 'Ganjil 2024/2025',
    prodiName: 'Sistem Informasi',
    status: 'diterima',
    priority: 1,
    notes: null,
    reviewedBy: '5',
    reviewedAt: '2026-01-02T00:00:00Z',
    reviewedByName: 'Admin Akademik',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

function selectionsResponse(
  items: CourseSelectionForReview[] = SELECTIONS,
  page = 1,
  limit = 10,
  total?: number,
) {
  return { items, pagination: { page, limit, total: total ?? items.length } };
}

function mockAll() {
  mockedApi.getDosenSemesters.mockResolvedValue(SEMESTERS);
  mockedApi.listProdis.mockResolvedValue({
    items: PRODIS,
    pagination: { page: 1, limit: 100, total: PRODIS.length },
  });
  mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse());
}

describe('AdminCourseReviewPage — Persetujuan MK Dosen', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan daftar pilihan MK yang diajukan dosen', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    expect(await screen.findByText('Persetujuan MK Dosen')).toBeInTheDocument();
    expect(
      await screen.findByText((text) => text.includes('Pemrograman Dasar')),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Diajukan').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Disetujui').length).toBeGreaterThanOrEqual(1);
    expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith({
      semesterId: 1,
      prodiId: undefined,
      status: undefined,
      page: 1,
      limit: 10,
    });
  });

  it('filter status → hanya menampilkan yang sesuai', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([SELECTIONS[1]]));

    render(<AdminCourseReviewPage />);

    const statusSelect = screen.getByDisplayValue('Semua Status');
    fireEvent.change(statusSelect, { target: { value: 'diterima' } });

    await waitFor(() => {
      expect(screen.getByText((text) => text.includes('Basis Data'))).toBeInTheDocument();
    });
    expect(
      screen.queryByText((text) => text.includes('Pemrograman Dasar')),
    ).not.toBeInTheDocument();
  });

  it('tombol Setujui → modal + konfirmasi → reviewCourseSelection', async () => {
    mockAll();
    mockedApi.reviewCourseSelection.mockResolvedValue({ ...SELECTIONS[0], status: 'diterima' });

    render(<AdminCourseReviewPage />);

    const setujuiBtn = await screen.findByText('Setujui');
    fireEvent.click(setujuiBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const textarea = within(dialog).getByPlaceholderText(/Masukkan alasan/i);
    fireEvent.change(textarea, { target: { value: 'Oke, lanjut' } });

    fireEvent.click(within(dialog).getByText('Setujui'));

    await waitFor(() => {
      expect(mockedApi.reviewCourseSelection).toHaveBeenCalledWith(1, {
        status: 'diterima',
        reviewNotes: 'Oke, lanjut',
      });
    });
    expect(await screen.findByText(/berhasil disetujui/)).toBeInTheDocument();
  });

  it('tombol Tolak → modal konfirmasi → reviewCourseSelection ditolak', async () => {
    mockAll();
    mockedApi.reviewCourseSelection.mockResolvedValue({ ...SELECTIONS[0], status: 'ditolak' });

    render(<AdminCourseReviewPage />);

    const tolakBtn = await screen.findByText('Tolak');
    fireEvent.click(tolakBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Tolak'));

    await waitFor(() => {
      expect(mockedApi.reviewCourseSelection).toHaveBeenCalledWith(1, {
        status: 'ditolak',
        reviewNotes: undefined,
      });
    });
    expect(await screen.findByText(/berhasil ditolak/)).toBeInTheDocument();
  });

  it('semua pilihan sudah direview → tidak ada tombol aksi', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([SELECTIONS[1]]));

    render(<AdminCourseReviewPage />);

    expect(await screen.findByText((text) => text.includes('Basis Data'))).toBeInTheDocument();
    expect(screen.queryByText('Setujui')).not.toBeInTheDocument();
    expect(screen.getByText('Selesai')).toBeInTheDocument();
  });

  it('filter semester/prodi → memuat ulang data', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([]));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ semesterId: 1 }),
      );
    });
  });

  it('error review → menampilkan error di modal', async () => {
    mockAll();
    mockedApi.reviewCourseSelection.mockRejectedValue(new Error('Gagal review'));

    render(<AdminCourseReviewPage />);

    const setujuiBtn = await screen.findByText('Setujui');
    fireEvent.click(setujuiBtn);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Setujui'));

    // Error appears in main area after modal closes
    expect(await screen.findByText((text) => text.includes('Gagal review'))).toBeInTheDocument();
  });

  it('pagination Berikutnya → memuat halaman berikutnya', async () => {
    mockAll();
    // total=20, page=1 -> 2 pages with limit=10
    mockedApi.getCourseSelectionsForReview
      .mockResolvedValueOnce(selectionsResponse(SELECTIONS, 1, 10, 20))
      .mockResolvedValueOnce(selectionsResponse([SELECTIONS[1]], 2, 10, 20));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Berikutnya ›')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText('Berikutnya ›'));

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });
  });

  it('pagination Sebelumnya → tidak aktif di halaman 1', async () => {
    mockAll();
    // total=20, page=1 -> pagination shows (20 > 10)
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(
      selectionsResponse(SELECTIONS, 1, 10, 20),
    );

    render(<AdminCourseReviewPage />);

    // Wait for pagination to appear
    await waitFor(() => {
      expect(screen.getByText('Halaman 1 / 2')).toBeInTheDocument();
    });
    expect(screen.getByText('‹ Sebelumnya')).toBeDisabled();
  });

  it('filter prodi → memuat ulang data', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([]));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ semesterId: 1 }),
      );
    });
  });

  it('loading state → menampilkan Memuat... di tombol filter', async () => {
    mockAll();
    let resolveLoad: (val: CourseSelectionsForReviewResponse) => void;
    const loadPromise = new Promise<CourseSelectionsForReviewResponse>((resolve) => {
      resolveLoad = resolve;
    });
    mockedApi.getCourseSelectionsForReview.mockReturnValue(loadPromise);

    render(<AdminCourseReviewPage />);

    expect(screen.getByText('Memuat...')).toBeInTheDocument();

    resolveLoad!(selectionsResponse(SELECTIONS, 1, 10, 20));
    await waitFor(() => {
      expect(screen.getByText('Terapkan Filter')).toBeInTheDocument();
    });
  });

  it('error load semester/prodi → menampilkan error', async () => {
    mockedApi.getDosenSemesters.mockRejectedValue(new Error('Semester error'));
    mockedApi.listProdis.mockRejectedValue(new Error('Prodi error'));

    render(<AdminCourseReviewPage />);

    expect(await screen.findByText((text) => text.includes('Gagal memuat'))).toBeInTheDocument();
  });

  it('modal review → Batal menutup modal', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    const setujuiBtn = await screen.findByText('Setujui');
    fireEvent.click(setujuiBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('Batal'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('modal review → status ditolak menampilkan judul Tolak', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    const tolakBtn = await screen.findByText('Tolak');
    fireEvent.click(tolakBtn);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Tolak Pilihan MK')).toBeInTheDocument();
  });

  it('memilih status filter lalu klik Terapkan Filter → memuat ulang data', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(
      selectionsResponse(SELECTIONS, 1, 10, 20),
    );

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Halaman 1 / 2')).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue('Semua Status');
    fireEvent.change(statusSelect, { target: { value: 'diterima' } });

    const applyBtn = screen.getByText(
      (text) => text.includes('Terapkan Filter') || text.includes('Memuat'),
    );
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, status: 'diterima' }),
      );
    });
  });

  it('memilih prodi filter lalu klik Terapkan Filter → memuat ulang data', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(
      selectionsResponse(SELECTIONS, 1, 10, 20),
    );

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Halaman 1 / 2')).toBeInTheDocument();
    });

    const prodiSelect = screen.getByDisplayValue('Semua Prodi');
    fireEvent.change(prodiSelect, { target: { value: '2' } });

    const applyBtn = screen.getByText(
      (text) => text.includes('Terapkan Filter') || text.includes('Memuat'),
    );
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, prodiId: 2 }),
      );
    });
  });
});
