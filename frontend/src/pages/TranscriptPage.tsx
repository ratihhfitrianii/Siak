import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, apiRequest, downloadTranscriptPdf } from '../lib/api';
import type { GradeItem } from '../lib/types';

function computeStats(items: GradeItem[]) {
  const sks = items.reduce((sum, it) => sum + it.course.credits, 0);
  let weighted = 0;
  let gradedSks = 0;
  for (const it of items) {
    if (it.gradePoint !== null) {
      weighted += it.course.credits * it.gradePoint;
      gradedSks += it.course.credits;
    }
  }
  const ipk = gradedSks > 0 ? weighted / gradedSks : null;
  return { sks, gradedSks, ipk };
}

/**
 * Transkrip nilai mahasiswa (T1.11b):
 * - Layout 2 kolom: Kiri = detail semester terpilih, Kanan = daftar semester
 * - Panel kiri: header semester + tabel detail + tombol download semester
 * - Panel kanan: list semester + tombol download semua
 * - Collapsible semester di panel kiri (default: semester terbaru terbuka)
 */
export function TranscriptPage() {
  const { user } = useAuth();
  const studentId = user?.studentId ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GradeItem[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [academicYears, setAcademicYears] = useState<Array<{ id: number; code: string }>>([]);
  // Semester yang di-expand di panel kiri
  const [expandedSemester, setExpandedSemester] = useState<string | null>(null);

  // Fetch academic years for dropdown (filter panel kanan)
  useEffect(() => {
    apiRequest<Array<{ id: number; code: string }>>('/academic-years')
      .then((data) => {
        setAcademicYears(data);
        setSelectedAcademicYearId(null);
      })
      .catch(() => {
        // Silently ignore
      });
  }, []);

  async function handleDownloadSemester(semester: string) {
    setDownloading(true);
    setDownloadError(null);
    try {
      // Filter items untuk semester ini
      const semesterItems = items.filter((it) => it.semester === semester);
      if (semesterItems.length === 0) return;
      // Download PDF hanya untuk semester terpilih: kirim semesterCode ke backend,
      // backend memfilter matkul pada semester tersebut saja (bukan semua).
      await downloadTranscriptPdf(selectedAcademicYearId ?? undefined, semester);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Gagal mengunduh PDF semester');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadAll() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadTranscriptPdf(selectedAcademicYearId ?? undefined);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Gagal mengunduh PDF');
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (studentId === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest<{ items: GradeItem[] }>(`/grades/student/${studentId}`)
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Gagal memuat transkrip');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Group by semester
  const groups = useMemo(() => {
    const map = new Map<string, GradeItem[]>();
    for (const it of items) {
      const arr = map.get(it.semester) ?? [];
      arr.push(it);
      map.set(it.semester, arr);
    }
    // Urutkan semester desc (terbaru dulu)
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const overall = useMemo(() => computeStats(items), [items]);

  // Default expanded: semester terbaru (pertama di array desc)
  useEffect(() => {
    if (groups.length > 0 && expandedSemester === null) {
      setExpandedSemester(groups[0][0]);
    }
  }, [groups, expandedSemester]);

  function toggleSemester(semester: string) {
    setExpandedSemester((prev) => (prev === semester ? null : semester));
  }

  if (studentId === null) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Transkrip</h1>
        <p className="mt-2 text-sm text-slate-500">
          Transkrip nilai tersedia untuk akun mahasiswa. Akun ini tidak terhubung ke data mahasiswa.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-label="Memuat">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-700">{error}</p>
      </div>
    );
  }

  const currentSemester = expandedSemester ?? groups[0]?.[0];
  const currentItems = groups.find(([s]) => s === currentSemester)?.[1] ?? [];
  const currentStats = computeStats(currentItems);

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            Total SKS: <span className="font-bold text-slate-900">{overall.sks}</span> · IPK:{' '}
            <span className="font-bold text-slate-900">
              {overall.ipk === null ? '—' : overall.ipk.toFixed(2)}
            </span>
          </p>
          {academicYears.length > 0 && (
            <select
              value={selectedAcademicYearId ?? ''}
              onChange={(e) =>
                setSelectedAcademicYearId(e.target.value ? Number(e.target.value) : null)
              }
              className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Semua Tahun Akademik</option>
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.code}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={downloading || items.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Mengunduh…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download Semua
            </>
          )}
        </button>
      </div>

      {downloadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {downloadError}
        </div>
      )}

      {/* Main Layout: 2 Kolom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Kiri: Detail Semester Terpilih (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <p className="text-slate-500">Belum ada nilai yang tercatat.</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Semester {currentSemester}</h2>
                  <p className="text-sm text-slate-600">
                    SKS: {currentStats.sks} · IP:{' '}
                    {currentStats.ipk === null ? '—' : currentStats.ipk.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadSemester(currentSemester)}
                    disabled={downloading || currentItems.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {downloading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Mengunduh…
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Download Semester
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="py-2 pr-3 font-medium w-10 text-center">
                        No
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Mata Kuliah
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium w-20 text-center">
                        SKS
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium w-28 text-center">
                        Angka
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium w-28 text-center">
                        Huruf
                      </th>
                      <th scope="col" className="py-2 font-medium w-28 text-center">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentItems.map((it, idx) => (
                      <tr key={it.id}>
                        <td className="py-3 pr-3 font-medium text-slate-900 text-center">
                          {idx + 1}
                        </td>
                        <td className="py-3 pr-3 text-slate-700">{it.course.name}</td>
                        <td className="py-3 pr-3 text-slate-600 text-center">
                          {it.course.credits}
                        </td>
                        <td className="py-3 pr-3 text-center">
                          {it.gradePoint === null ? '—' : it.gradePoint.toFixed(2)}
                        </td>
                        <td className="py-3 pr-3 text-center">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-bold ${
                              it.gradeLetter
                                ? 'bg-primary-100 text-primary-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {it.gradeLetter ?? '—'}
                          </span>
                        </td>
                        <td className="py-3 text-center text-slate-500 text-xs">
                          {it.isRepeated && 'Diulang'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Panel Kanan: Daftar Semester (1/3 width) */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-white p-5 shadow-sm h-full sticky top-24">
            <h3 className="font-semibold text-slate-900 mb-4">Daftar Semester</h3>
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada semester.</p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {groups.map(([semester, semesterItems]) => {
                  const stats = computeStats(semesterItems);
                  const isActive = expandedSemester === semester;
                  return (
                    <li key={semester}>
                      <button
                        type="button"
                        onClick={() => toggleSemester(semester)}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          isActive
                            ? 'bg-primary-50 border border-primary-200 ring-1 ring-primary-200'
                            : 'bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">{semester}</span>
                          <svg
                            className={`h-4 w-4 text-slate-400 transition-transform ${isActive ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 flex gap-3">
                          <span>SKS: {stats.sks}</span>
                          <span>IP: {stats.ipk === null ? '—' : stats.ipk.toFixed(2)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
