import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getCourseSelectionsForReview,
  reviewCourseSelection,
  getDosenSemesters,
  listProdis,
} from '../lib/api';
import type { CourseSelectionForReview, SemesterOption, Prodi } from '../lib/types';

const statusColors: Record<string, string> = {
  belum_diajukan: 'bg-slate-100 text-slate-800',
  diajukan: 'bg-primary-100 text-primary-800',
  diterima: 'bg-green-100 text-green-800',
  ditolak: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  belum_diajukan: 'Belum Diajukan',
  diajukan: 'Diajukan',
  diterima: 'Disetujui',
  ditolak: 'Ditolak',
};

const PAGE_SIZE = 10;

// Type for grouped lecturer data
interface LecturerGroup {
  lecturerId: number;
  nik: string;
  lecturerName: string;
  prodiName: string;
  status: 'belum_diajukan' | 'diajukan' | 'diterima' | 'ditolak'; // overall status (highest priority: diajukan > diterima > ditolak > belum_diajukan)
  reviewedByName: string | null;
  reviewedAt: string | null;
  courses: CourseSelectionForReview[];
}

function groupByLecturer(selections: CourseSelectionForReview[]): LecturerGroup[] {
  const map = new Map<number, LecturerGroup>();
  for (const s of selections) {
    const existing = map.get(s.lecturerId);
    if (!existing) {
      map.set(s.lecturerId, {
        lecturerId: s.lecturerId,
        nik: s.nik,
        lecturerName: s.lecturerName,
        prodiName: s.prodiName,
        status: s.status,
        reviewedByName: s.reviewedByName,
        reviewedAt: s.reviewedAt,
        courses: [s],
      });
    } else {
      existing.courses.push(s);
      // Update overall status: diajukan > diterima > ditolak > belum_diajukan
      const priority = { diajukan: 3, diterima: 2, ditolak: 1, belum_diajukan: 0 };
      if (priority[s.status] > priority[existing.status]) {
        existing.status = s.status;
        existing.reviewedByName = s.reviewedByName;
        existing.reviewedAt = s.reviewedAt;
      }
    }
  }
  return Array.from(map.values());
}

export function AdminCourseReviewPage() {
  const [semesterOptions, setSemesterOptions] = useState<SemesterOption[]>([]);
  const [prodiOptions, setProdiOptions] = useState<Prodi[]>([]);
  const [rawSelections, setRawSelections] = useState<CourseSelectionForReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    semesterId: null as number | null,
    prodiId: null as number | null,
    status: '' as '' | 'belum_diajukan' | 'diajukan' | 'diterima' | 'ditolak',
  });
  // Detail modal state
  const [detailGroup, setDetailGroup] = useState<LecturerGroup | null>(null);
  // Review modal state (within detail modal)
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'diterima' | 'ditolak'>('diterima');
  const [reviewNotes, setReviewNotes] = useState('');

  // Load semester & prodi options
  useEffect(() => {
    Promise.all([getDosenSemesters(), listProdis({ limit: 100 })])
      .then(([sems, prodisRes]) => {
        setSemesterOptions(sems);
        setProdiOptions(prodisRes.items);
        if (sems.length > 0) {
          setFilters((f) => ({ ...f, semesterId: sems[0].id }));
        }
      })
      .catch(() => setError('Gagal memuat opsi filter'));
  }, []);

  // Load selections
  const loadSelections = useCallback(
    async (p = 1) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getCourseSelectionsForReview({
          semesterId: filters.semesterId ?? undefined,
          prodiId: filters.prodiId ?? undefined,
          status: filters.status === '' ? undefined : filters.status,
          page: p,
          limit: PAGE_SIZE,
        });
        setRawSelections(res.items);
        setTotal(res.pagination.total);
        setPage(p);
      } catch (err: unknown) {
        const apiError = err as { message?: string };
        setError(apiError.message ?? 'Gagal memuat data persetujuan MK');
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  // Group selections by lecturer
  const groupedSelections = useMemo(() => groupByLecturer(rawSelections), [rawSelections]);

  // Load when filters change (reset to page 1)
  useEffect(() => {
    loadSelections(1);
  }, [filters.semesterId, filters.prodiId, filters.status, loadSelections]);

  // Load when page changes
  useEffect(() => {
    if (page > 1) {
      loadSelections(page);
    }
  }, [page, loadSelections]);

  const handleFilterChange = (
    key: 'semesterId' | 'prodiId' | 'status',
    value: string | number | null,
  ) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const handlePageChange = (newPage: number) => {
    const maxPage = Math.ceil(total / PAGE_SIZE);
    if (newPage < 1 || newPage > maxPage) return;
    setPage(newPage);
  };

  const handleDetail = (group: LecturerGroup) => {
    setDetailGroup(group);
  };

  const closeDetail = () => {
    setDetailGroup(null);
  };

  const handleReview = (selectionId: number, status: 'diterima' | 'ditolak') => {
    setReviewingId(selectionId);
    setReviewStatus(status);
    setReviewNotes('');
  };

  const closeReview = () => {
    setReviewingId(null);
    setReviewNotes('');
  };

  const confirmReview = async () => {
    if (!reviewingId) return;
    try {
      await reviewCourseSelection(reviewingId, {
        status: reviewStatus,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      setSuccess(`Pilihan MK berhasil ${reviewStatus === 'diterima' ? 'disetujui' : 'ditolak'}`);
      closeReview();
      closeDetail();
      loadSelections(page);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message ?? 'Gagal memproses review');
    }
  };

  const handleApplyFilter = () => {
    loadSelections(1);
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Persetujuan MK Dosen</h1>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center justify-between"
        >
          <span>{error}</span>
          <button onClick={clearMessages} className="text-red-700 hover:text-red-900">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
      {success && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center justify-between"
        >
          <span>{success}</span>
          <button onClick={clearMessages} className="text-green-700 hover:text-green-900">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="filter-semester"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Semester
            </label>
            <select
              id="filter-semester"
              value={filters.semesterId ?? ''}
              onChange={(e) =>
                handleFilterChange('semesterId', e.target.value ? Number(e.target.value) : null)
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Semester</option>
              {semesterOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="filter-prodi" className="block text-sm font-medium text-slate-700 mb-1">
              Program Studi
            </label>
            <select
              id="filter-prodi"
              value={filters.prodiId ?? ''}
              onChange={(e) =>
                handleFilterChange('prodiId', e.target.value ? Number(e.target.value) : null)
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Prodi</option>
              {prodiOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="filter-status"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Status
            </label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) =>
                handleFilterChange(
                  'status',
                  e.target.value as '' | 'belum_diajukan' | 'diajukan' | 'diterima' | 'ditolak',
                )
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Status</option>
              <option value="diajukan">Diajukan</option>
              <option value="diterima">Disetujui</option>
              <option value="ditolak">Ditolak</option>
              <option value="belum_diajukan">Belum Diajukan</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleApplyFilter}
              disabled={loading}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
            >
              {loading ? 'Memuat...' : 'Terapkan Filter'}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {loading && groupedSelections.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Memuat data...</div>
        ) : groupedSelections.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Belum ada data pilihan MK</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="pb-2 font-medium px-4">NIK</th>
                    <th className="pb-2 font-medium px-4">Nama</th>
                    <th className="pb-2 font-medium px-4">Prodi</th>
                    <th className="pb-2 font-medium px-4">Status</th>
                    <th className="pb-2 font-medium px-4">Reviewer</th>
                    <th className="pb-2 font-medium px-4">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedSelections.map((g) => (
                    <tr key={g.lecturerId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-700">{g.nik}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{g.lecturerName}</td>
                      <td className="py-3 px-4 text-slate-700">{g.prodiName}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[g.status as keyof typeof statusColors]}`}
                        >
                          {statusLabels[g.status as keyof typeof statusLabels]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {g.reviewedByName ? (
                          <>
                            <div className="font-medium">{g.reviewedByName}</div>
                            <div className="text-xs text-slate-500">
                              {g.reviewedAt ? new Date(g.reviewedAt).toLocaleString('id-ID') : '-'}
                            </div>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleDetail(g)}
                          className="px-3 py-1 text-xs text-primary-500 hover:text-primary-700 underline"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                <p className="text-sm text-slate-500">
                  Menampilkan {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} dari{' '}
                  {total} data
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="px-3 py-1 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Sebelumnya
                  </button>
                  <span className="text-sm text-slate-600">
                    Halaman {page} / {Math.ceil(total / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= Math.ceil(total / PAGE_SIZE)}
                    className="px-3 py-1 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Berikutnya ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detailGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Detail Pilihan MK</h2>
              <button
                onClick={closeDetail}
                className="p-1 text-slate-400 hover:text-slate-600"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Dosen Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-medium text-slate-900 mb-2">Informasi Dosen</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">NIK:</span>
                    <span className="font-mono ml-2">{detailGroup.nik}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Nama:</span>
                    <span className="ml-2">{detailGroup.lecturerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Prodi:</span>
                    <span className="ml-2">{detailGroup.prodiName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Status:</span>
                    <span className="ml-2">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[detailGroup.status as keyof typeof statusColors]}`}
                      >
                        {statusLabels[detailGroup.status as keyof typeof statusLabels]}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* MK List for this lecturer in this filter */}
              <div>
                <h3 className="font-medium text-slate-900 mb-2">Mata Kuliah yang Diajukan</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="pb-2 font-medium px-4 py-2">Kode MK</th>
                        <th className="pb-2 font-medium px-4 py-2">Nama MK</th>
                        <th className="pb-2 font-medium px-4 py-2">SKS</th>
                        <th className="pb-2 font-medium px-4 py-2">Semester</th>
                        <th className="pb-2 font-medium px-4 py-2">Jenis</th>
                        <th className="pb-2 font-medium px-4 py-2">Prioritas</th>
                        <th className="pb-2 font-medium px-4 py-2">Catatan Dosen</th>
                        <th className="pb-2 font-medium px-4 py-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailGroup.courses.map((s) => (
                        <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {s.courseCode}
                          </td>
                          <td className="py-3 px-4 text-slate-900">{s.courseName}</td>
                          <td className="py-3 px-4 text-center text-slate-700">
                            {s.credits}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {s.semesterCode} (Sem {s.semesterNumber})
                          </td>
                          <td className="py-3 px-4 text-center text-slate-700">
                            {s.isMandatory ? 'Wajib' : 'Pilihan'}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-700">
                            {s.priority}
                          </td>
                          <td
                            className="py-3 px-4 text-slate-600 max-w-xs truncate"
                            title={s.notes || ''}
                          >
                            {s.notes || '-'}
                          </td>
                          <td className="py-3 px-4">
                            {s.status === 'diajukan' ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleReview(s.id, 'diterima')}
                                  className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                                >
                                  Setujui
                                </button>
                                <button
                                  onClick={() => handleReview(s.id, 'ditolak')}
                                  className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                >
                                  Tolak
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">Selesai</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal (inside detail modal) */}
      {reviewingId && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {reviewStatus === 'diterima' ? 'Setujui Pilihan MK' : 'Tolak Pilihan MK'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Catatan Review (opsional)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Masukkan alasan persetujuan/penolakan..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={closeReview}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  onClick={confirmReview}
                  className={`px-4 py-2 rounded-lg ${reviewStatus === 'diterima' ? 'bg-green-500' : 'bg-red-500'} text-white hover:opacity-90`}
                >
                  {reviewStatus === 'diterima' ? 'Setujui' : 'Tolak'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
