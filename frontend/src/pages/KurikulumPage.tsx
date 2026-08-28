import { useEffect, useState, useMemo } from 'react';
import { ApiError, apiRequest } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import type { GradeItem } from '../lib/types';

interface CurriculumRow {
  code: string;
  name: string;
  credits: number;
  semesterTaken: string;
  gradeLetter: string | null;
}

/**
 * Halaman Kurikulum Mahasiswa — daftar mata kuliah yang telah diambil (unik per kode MK).
 * Submenu "Kurikulum" di bawah menu KRS.
 */
export function KurikulumPage() {
  const { user } = useAuth();
  const studentId = user?.studentId ?? null;

  const [rows, setRows] = useState<CurriculumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studentId === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Data transkrip (grades) → daftar MK yang pernah diambil
        const res = await apiRequest<{ items: GradeItem[] }>(`/grades/student/${studentId}`);
        const items = res.items ?? [];

        // Dedupe per kode MK — ambil nilai terbaik jika pernah remedial/ulang
        const map = new Map<string, GradeItem>();
        for (const g of items) {
          const existing = map.get(g.course.code);
          if (!existing || (g.gradePoint ?? 0) > (existing.gradePoint ?? 0)) {
            map.set(g.course.code, g);
          }
        }

        const sorted = Array.from(map.values()).sort((a, b) =>
          a.course.code.localeCompare(b.course.code),
        );
        if (!cancelled) {
          setRows(
            sorted.map((g) => ({
              code: g.course.code,
              name: g.course.name,
              credits: g.course.credits,
              semesterTaken: String(g.period ?? ''),
              gradeLetter: g.gradeLetter,
            })),
          );
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof ApiError ? e.message : 'Gagal memuat kurikulum';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const totalSks = useMemo(() => rows.reduce((sum, r) => sum + r.credits, 0), [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Mata Kuliah Diambil</p>
          <p className="text-lg font-semibold text-slate-900">{rows.length} MK</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total SKS</p>
          <p className="text-lg font-semibold text-slate-900">{totalSks} SKS</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
          <p className="text-lg font-semibold text-slate-900">
            {rows.filter((r) => r.gradeLetter).length}/{rows.length} lulus
          </p>
        </div>
      </div>

      {/* Tabel MK */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Mata Kuliah yang Telah Diambil</h3>
          <p className="text-xs text-slate-500">
            Seluruh mata kuliah selama masa studi (unik per kode MK)
          </p>
        </div>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Kode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Mata Kuliah
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    SKS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Diambil Pada
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Nilai
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.code} className="hover:bg-slate-50">
                    <td className="px-6 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                      {r.code}
                    </td>
                    <td className="px-6 py-3 text-sm font-medium text-slate-900">{r.name}</td>
                    <td className="px-6 py-3 text-center text-sm text-slate-700">{r.credits}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{r.semesterTaken || '-'}</td>
                    <td className="px-6 py-3 text-center">
                      {r.gradeLetter ? (
                        <span className="inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-semibold">
                          {r.gradeLetter}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-slate-900">Belum ada mata kuliah</h3>
            <p className="mt-1 text-slate-500">
              Data kurikulum akan muncul setelah Anda mengambil KRS.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
