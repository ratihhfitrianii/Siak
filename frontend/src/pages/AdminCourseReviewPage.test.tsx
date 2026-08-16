import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    nik: '198001001',
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
    nik: '198002002',
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

function prodiResponse(items: Prodi[] = PRODIS, page = 1, limit = 100) {
  return { items, pagination: { page, limit, total: items.length } };
}

function mockAll() {
  mockedApi.getDosenSemesters.mockResolvedValue(SEMESTERS);
  mockedApi.listProdis.mockResolvedValue(prodiResponse());
  mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse());
  mockedApi.reviewCourseSelection.mockResolvedValue(SELECTIONS[0]);
}

function clearMocks() {
  vi.clearAllMocks();
}

afterEach(() => {
  clearMocks();
});

describe('AdminCourseReviewPage — Persetujuan MK Dosen', () => {
  it('menampilkan daftar pilihan MK yang diajukan dosen', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse(SELECTIONS));

    render(<AdminCourseReviewPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('198001001')).toBeInTheDocument(); // NIK
      expect(screen.getByText('Dr. Andi Wijaya')).toBeInTheDocument(); // Nama
      // Prodi in table (not in select)
      const prodiCells = screen.getAllByText('Teknik Informatika');
      expect(prodiCells.length).toBeGreaterThanOrEqual(1);
      // Status in table (not in select)
      const statusBadges = screen.getAllByText('Diajukan');
      expect(statusBadges.length).toBeGreaterThanOrEqual(1);
      // Detail button in table
      const detailBtns = screen.getAllByText('Detail');
      expect(detailBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filter status → hanya menampilkan yang sesuai', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([SELECTIONS[1]]));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Disetujui')).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue('Semua Status');
    fireEvent.change(statusSelect, { target: { value: 'diterima' } });

    // Wait for button to be clickable (not loading)
    const applyBtn = await screen.findByText((text) => text.includes('Terapkan Filter'));
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'diterima', page: 1 }),
      );
    });
  });

  it('filter prodi → memuat ulang data', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([SELECTIONS[1]]));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      // Check table cell (not select option)
      const prodiCells = screen.getAllByText('Sistem Informasi');
      expect(prodiCells.length).toBeGreaterThanOrEqual(1);
    });

    const prodiSelect = screen.getByDisplayValue('Semua Prodi');
    fireEvent.change(prodiSelect, { target: { value: '2' } });

    const applyBtn = await screen.findByText((text) => text.includes('Terapkan Filter'));
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ prodiId: 2, page: 1 }),
      );
    });
  });

  it('filter semester/prodi → memuat ulang data', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([]));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getByText((text) => text.includes('Terapkan Filter'))).toBeInTheDocument();
    });

    const semesterSelect = screen.getByLabelText('Semester');
    fireEvent.change(semesterSelect, { target: { value: '2' } });

    const applyBtn = await screen.findByText((text) => text.includes('Terapkan Filter'));
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockedApi.getCourseSelectionsForReview).toHaveBeenCalledWith(
        expect.objectContaining({ semesterId: 2, page: 1 }),
      );
    });
  });

  it('klik Detail → membuka modal detail', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Andi Wijaya')).toBeInTheDocument();
    });

    // Get the first Detail button in the first row
    const detailBtn = screen.getAllByText('Detail')[0];
    fireEvent.click(detailBtn);

    // Check detail modal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Detail Pilihan MK')).toBeInTheDocument();
      expect(screen.getByText('MK001')).toBeInTheDocument();
      expect(screen.getByText('Pemrograman Dasar')).toBeInTheDocument();
      expect(screen.getByText('Setujui')).toBeInTheDocument();
      expect(screen.getByText('Tolak')).toBeInTheDocument();
    });
  });

  it('modal detail → klik Setujui → buka review modal', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Detail').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Detail')[0]);

    await waitFor(() => {
      expect(screen.getByText('Setujui')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Setujui'));

    // Review modal should open
    await waitFor(() => {
      const dialogs = screen.getAllByRole('dialog');
      expect(dialogs.length).toBe(2); // detail + review
      expect(screen.getByText('Setujui Pilihan MK')).toBeInTheDocument();
    });
  });

  it('modal detail → klik Tolak → buka review modal dengan judul Tolak', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Detail').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Detail')[0]);

    await waitFor(() => {
      expect(screen.getByText('Tolak')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tolak'));

    await waitFor(() => {
      expect(screen.getByText('Tolak Pilihan MK')).toBeInTheDocument();
    });
  });

  it('review modal → isi catatan dan konfirmasi → panggil reviewCourseSelection', async () => {
    mockAll();
    mockedApi.reviewCourseSelection.mockResolvedValue({ ...SELECTIONS[0], status: 'diterima' });

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Detail').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Detail')[0]);

    await waitFor(() => {
      expect(screen.getByText('Setujui')).toBeInTheDocument();
    });

    // Click Setujui in detail modal (the one with smaller padding)
    const setujuiInDetail = screen.getAllByText('Setujui')[0];
    fireEvent.click(setujuiInDetail);

    await waitFor(() => {
      expect(screen.getByText('Setujui Pilihan MK')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Masukkan alasan persetujuan/penolakan...');
    fireEvent.change(textarea, { target: { value: 'Disetujui karena kompeten' } });

    // Click Setujui in review modal (the one with larger padding)
    const setujuiInReview = screen.getAllByText('Setujui')[1];
    fireEvent.click(setujuiInReview);

    await waitFor(() => {
      expect(mockedApi.reviewCourseSelection).toHaveBeenCalledWith(1, {
        status: 'diterima',
        reviewNotes: 'Disetujui karena kompeten',
      });
    });
  });

  it('error review → menampilkan error di main area', async () => {
    mockAll();
    mockedApi.reviewCourseSelection.mockRejectedValue(new Error('Gagal review'));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Detail').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Detail')[0]);

    await waitFor(() => {
      expect(screen.getByText('Setujui')).toBeInTheDocument();
    });

    // Click Setujui in detail modal
    const setujuiInDetail = screen.getAllByText('Setujui')[0];
    fireEvent.click(setujuiInDetail);

    await waitFor(() => {
      expect(screen.getByText('Setujui Pilihan MK')).toBeInTheDocument();
    });

    // Click Setujui in review modal
    const setujuiInReview = screen.getAllByText('Setujui')[1];
    fireEvent.click(setujuiInReview);

    // Error appears in main area after modals close
    expect(await screen.findByText((text) => text.includes('Gagal review'))).toBeInTheDocument();
  });

  it('semua pilihan sudah direview (diterima) → tidak ada tombol Setujui/Tolak di detail', async () => {
    mockAll();
    mockedApi.getCourseSelectionsForReview.mockResolvedValue(selectionsResponse([SELECTIONS[1]]));

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Siti Rahayu')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Detail')[0]);

    await waitFor(() => {
      expect(screen.getByText('Selesai')).toBeInTheDocument();
      expect(screen.queryByText('Setujui')).not.toBeInTheDocument();
      expect(screen.queryByText('Tolak')).not.toBeInTheDocument();
    });
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

  it('modal detail → Batal/X menutup modal', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Detail').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Detail')[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click close button (X)
    const closeBtn = screen.getByLabelText('Tutup');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('modal review → Batal menutup review modal', async () => {
    mockAll();

    render(<AdminCourseReviewPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Detail').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Detail')[0]);

    await waitFor(() => {
      expect(screen.getByText('Setujui')).toBeInTheDocument();
    });

    // Click Setujui in detail modal
    fireEvent.click(screen.getAllByText('Setujui')[0]);

    await waitFor(() => {
      expect(screen.getByText('Setujui Pilihan MK')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Batal'));

    // Review modal closed, detail modal still open
    await waitFor(() => {
      const dialogs = screen.getAllByRole('dialog');
      expect(dialogs.length).toBe(1);
      expect(screen.getByText('Detail Pilihan MK')).toBeInTheDocument();
    });
  });
});
