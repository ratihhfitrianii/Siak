import { useState, useEffect, useCallback } from 'react';
import {
  getCourseSelectionsForReview,
  reviewCourseSelection,
  getDosenSemesters,
  listProdis,
} from '../lib/api';
import type { CourseSelectionForReview, SemesterOption, Prodi } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

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

export function AdminCourseReviewPage() {
  const [semesterOptions, setSemesterOptions] = useState<SemesterOption[]>([]);
  const [prodiOptions, setProdiOptions] = useState<Prodi[]>([]);
  const [selections, setSelections] = useState<CourseSelectionForReview[]>([]);
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
        setSelections(res.items);
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

  useEffect(() => {
    loadSelections(1);
  }, [loadSelections]);

  const handleFilterChange = (key: keyof typeof filters, value: string | number | null) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const handleReview = async (
    selection: CourseSelectionForReview,
    action: 'diterima' | 'ditolak',
  ) => {
    setReviewingId(selection.id);
    setReviewStatus(action);
    setReviewNotes('');
  };

  const confirmReview = async () => {
    if (!reviewingId) return;
    setError(null);
    setSuccess(null);
    try {
      await reviewCourseSelection(reviewingId, {
        status: reviewStatus,
        reviewNotes: reviewNotes || undefined,
      });
      setSuccess(`Pilihan MK berhasil ${reviewStatus === 'diterima' ? 'disetujui' : 'ditolak'}`);
      await loadSelections(page);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message ?? 'Gagal memproses persetujuan');
    } finally {
      setReviewingId(null);
      setReviewNotes('');
    }
  };

  const handlePageChange = (p: number) => {
    loadSelections(p);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Persetujuan MK Dosen</h1>
      </div>

      {error && <FormAlert>Error: {error}</FormAlert>}
      {success && <FormAlert>Success: {success}</FormAlert>}

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
          <select
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Program Studi</label>
          <select
            value={filters.prodiId ?? ''}
            onChange={(e) =>
              handleFilterChange('prodiId', e.target.value ? Number(e.target.value) : null)
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Semua Prodi</option>
            {prodiOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
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
            onClick={() => loadSelections(1)}
            disabled={loading}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {loading ? 'Memuat...' : 'Terapkan Filter'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {loading && selections.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Memuat data...</div>
        ) : selections.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Belum ada data pilihan MK</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="pb-2 font-medium px-4">Dosen (NIDN)</th>
                    <th className="pb-2 font-medium px-4">Mata Kuliah</th>
                    <th className="pb-2 font-medium px-4">Semester</th>
                    <th className="pb-2 font-medium px-4">Prodi</th>
                    <th className="pb-2 font-medium px-4">Status</th>
                    <th className="pb-2 font-medium px-4">Prioritas</th>
                    <th className="pb-2 font-medium px-4">Catatan Dosen</th>
                    <th className="pb-2 font-medium px-4">Reviewer</th>
                    <th className="pb-2 font-medium px-4">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {selections.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{s.lecturerName}</div>
                        <div className="text-slate-500 font-mono text-xs">{s.nidn}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {s.courseCode} - {s.courseName}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {s.credits} SKS {s.isMandatory ? '• Wajib' : '• Pilihan'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {s.semesterCode} (Sem {s.semesterNumber})
                      </td>
                      <td className="py-3 px-4 text-slate-700">{s.prodiName}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[s.status as keyof typeof statusColors]}`}
                        >
                          {statusLabels[s.status as keyof typeof statusLabels]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 text-center">{s.priority}</td>
                      <td
                        className="py-3 px-4 text-slate-600 max-w-xs truncate"
                        title={s.notes || ''}
                      >
                        {s.notes || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {s.reviewedByName ? (
                          <>
                            <div className="font-medium">{s.reviewedByName}</div>
                            <div className="text-xs text-slate-500">
                              {s.reviewedAt ? new Date(s.reviewedAt).toLocaleString('id-ID') : '-'}
                            </div>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s.status === 'diajukan' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleReview(s, 'diterima')}
                              className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => handleReview(s, 'ditolak')}
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

      {/* Review Modal */}
      {reviewingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
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
                  onClick={() => {
                    setReviewingId(null);
                    setReviewNotes('');
                  }}
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
