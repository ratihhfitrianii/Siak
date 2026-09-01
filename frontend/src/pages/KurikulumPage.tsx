import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../lib/api';
import type { CurriculumItem } from '../lib/types';

/** Warna latar per semester (bergantian) — indexed by semesterKurikulum. */
const SEMESTER_COLORS: Record<number, string> = {
  1: 'bg-blue-50 text-blue-800',
  2: 'bg-emerald-50 text-emerald-800',
  3: 'bg-amber-50 text-amber-800',
  4: 'bg-violet-50 text-violet-800',
  5: 'bg-rose-50 text-rose-800',
  6: 'bg-cyan-50 text-cyan-800',
  7: 'bg-lime-50 text-lime-800',
  8: 'bg-fuchsia-50 text-fuchsia-800',
};

/**
 * Halaman Kurikulum Mahasiswa — semua mata kuliah yang pernah dikontrak oleh
 * mahasiswa (dari riwayat KRS), dengan kolom: No., Semester Kurikulum, Kode MK,
 * Mata Kuliah, SKS, Dosen Pengampu. Warna latar beda per semester.
 */
export function KurikulumPage() {
  const [rows, setRows] = useState<CurriculumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest<{ items: CurriculumItem[] }>('/krs/my/curriculum');
        if (!cancelled) setRows(res.items ?? []);
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
  }, []);

  const semesterCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of rows) {
      counts.set(r.semesterKurikulum, (counts.get(r.semesterKurikulum) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const totalSks = useMemo(() => rows.reduce((sum, r) => sum + r.credits, 0), [rows]);
  const semesterCount = semesterCounts.size;

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
          <p className="text-xs text-slate-500 uppercase tracking-wide">Mata Kuliah Dikontrak</p>
          <p className="text-lg font-semibold text-slate-900">{rows.length} MK</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total SKS</p>
          <p className="text-lg font-semibold text-slate-900">{totalSks} SKS</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Semester Kurikulum</p>
          <p className="text-lg font-semibold text-slate-900">{semesterCount} semester</p>
        </div>
      </div>

      {/* Tabel MK */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Mata Kuliah yang Pernah Dikontrak</h3>
          <p className="text-xs text-slate-500">
            Seluruh mata kuliah selama masa studi (dari riwayat pengambilan KRS)
          </p>
        </div>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    No.
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Semester Kurikulum
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Kode MK
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Mata Kuliah
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    SKS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Dosen Pengampu
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, idx) => (
                  <tr key={`${r.code}-${r.semesterKurikulum}`} className="hover:bg-slate-50">
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          SEMESTER_COLORS[r.semesterKurikulum] ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        Semester {r.semesterKurikulum}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                      {r.code}
                    </td>
                    <td className="px-6 py-3 text-sm font-medium text-slate-900">{r.name}</td>
                    <td className="px-6 py-3 text-center text-sm text-slate-700">{r.credits}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{r.lecturerName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-slate-900">Belum ada mata kuliah</h3>
            <p className="mt-1 text-slate-500">
              Data kurikulum akan muncul setelah Anda mengontrak KRS.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
