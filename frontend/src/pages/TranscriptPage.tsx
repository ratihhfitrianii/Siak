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
 * - GET /grades/student/:studentId (diri sendiri; studentId dari /users/me)
 * - dikelompokkan per semester (urut periode terbaru), IP per semester + IPK total
 * - Keluhan lama #5: hanya tampilkan HEADER tiap semester; detail muncul saat
 *   klik tombol "Detail" (collapsible per semester)
 * - Download PDF dengan filter tahun akademik (keluhan lama #45); error
 *   download ditampilkan apa adanya (keluhan lama "download PDF belum berhasil")
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
  // Semester yang di-expand (tombol Detail). Default: semua tertutup — hanya header.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch academic years for dropdown
  useEffect(() => {
    apiRequest<Array<{ id: number; code: string }>>('/academic-years')
      .then((data) => {
        setAcademicYears(data);
        // Default: "Semua Tahun Akademik" (null value)
        setSelectedAcademicYearId(null);
      })
      .catch(() => {
        // Silently ignore - dropdown will just be empty
      });
  }, []);

  function toggleSemester(semester: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(semester)) next.delete(semester);
      else next.add(semester);
      return next;
    });
  }

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      // null = Semua Tahun Akademik
      await downloadTranscriptPdf(selectedAcademicYearId ?? undefined);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Gagal mengunduh PDF. Coba lagi.');
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

  const groups = useMemo(() => {
    const map = new Map<string, GradeItem[]>();
    for (const it of items) {
      const arr = map.get(it.semester) ?? [];
      arr.push(it);
      map.set(it.semester, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  const overall = useMemo(() => computeStats(items), [items]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <button
            type="button"
            onClick={handleDownload}
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
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {downloadError}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          Belum ada nilai yang tercatat.
        </div>
      ) : (
        groups.map(([semester, semesterItems]) => {
          const stats = computeStats(semesterItems);
          const isOpen = expanded.has(semester);
          return (
            <section
              key={semester}
              className={`rounded-2xl bg-white p-5 shadow-sm ${isOpen ? 'ring-1 ring-primary-100' : ''}`}
            >
              <div className="flex flex-wrap flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-slate-900">Semester {semester}</h2>
                  <p className="text-sm text-slate-600">
                    SKS: {stats.sks} · IP: {stats.ipk === null ? '—' : stats.ipk.toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSemester(semester)}
                  aria-expanded={isOpen}
                  aria-controls={`transcript-detail-${semester}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary-300 px-3 py-1.5 text-sm font-medium text-primary-700 transition hover:bg-primary-50"
                >
                  {isOpen ? (
                    <>
                      Sembunyikan Detail
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
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    </>
                  ) : (
                    <>
                      Detail
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
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </>
                  )}
                </button>
              </div>
              {isOpen && (
                <div id={`transcript-detail-${semester}`} className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Kode
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Mata Kuliah
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          SKS
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Nilai
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Poin
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {semesterItems.map((it) => (
                        <tr key={it.id}>
                          <td className="py-3 pr-3 font-medium text-slate-900">{it.course.code}</td>
                          <td className="py-3 pr-3 text-slate-700">{it.course.name}</td>
                          <td className="py-3 pr-3 text-slate-600">{it.course.credits}</td>
                          <td className="py-3 pr-3">
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
                          <td className="py-3 text-slate-600">
                            {it.gradePoint === null ? '—' : it.gradePoint.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
