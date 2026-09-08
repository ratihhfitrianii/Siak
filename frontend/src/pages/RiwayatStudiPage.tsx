import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, apiRequest } from '../lib/api';
import type { GradeItem } from '../lib/types';
import { Spinner } from '../components/Spinner';
import { FormAlert } from '../components/ErrorInline';
import { useTableTools, SortIcon } from '../lib/useTableTools';

/** Ambil label semester (Ganjil/Genap) dari kode "2024/2025-1" → "Ganjil". */
function semesterLabel(code: string): string {
  const part = code.split('-').pop();
  return part === '1' ? 'Ganjil' : part === '2' ? 'Genap' : code;
}

/** Ambil TA (tahun akademik) dari kode "2024/2025-1" → "2024/2025". */
function academicYearLabel(code: string): string {
  return code.split('-').slice(0, -1).join('-') || code;
}

/** Hitung IPK dari matkul yang sudah dinilai (gradePoint != null). */
function computeIpk(items: GradeItem[]): number | null {
  let weighted = 0;
  let gradedSks = 0;
  for (const it of items) {
    if (it.gradePoint !== null) {
      weighted += it.course.credits * it.gradePoint;
      gradedSks += it.course.credits;
    }
  }
  return gradedSks > 0 ? weighted / gradedSks : null;
}

/**
 * Halaman Riwayat Studi mahasiswa.
 * List semua mata kuliah yang telah diambil dari semester 1 sampai semester terakhir,
 * kolom: No, Kode MK, Mata Kuliah, SKS, Nilai, Nilai Angka, Semester (Ganjil/Genap), TA.
 * Di bagian bawah: ringkasan total SKS ditempuh + IPK.
 */
export function RiwayatStudiPage() {
  const { user } = useAuth();
  const studentId = user?.studentId ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GradeItem[]>([]);

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
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Gagal memuat riwayat studi');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Urutkan dari semester 1 (tertua) ke terakhir, lalu per kode MK.
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const sa = a.semester || '';
      const sb = b.semester || '';
      if (sa !== sb) return sa.localeCompare(sb);
      return a.course.code.localeCompare(b.course.code);
    });
  }, [items]);

  // Flatten untuk search/sort
  type GradeRow = GradeItem & {
    courseCode: string;
    courseName: string;
    credits: number;
  };
  const tableRows: GradeRow[] = sorted.map((it) => ({
    ...it,
    courseCode: it.course.code,
    courseName: it.course.name,
    credits: it.course.credits,
  }));
  const { query, setQuery, sortKey, sortDir, toggleSort, submit, filtered } =
    useTableTools(tableRows);

  const { totalSks, ipk } = useMemo(() => {
    const totalSks = filtered.reduce((sum, it) => sum + it.credits, 0);
    return { totalSks, ipk: computeIpk(filtered) };
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Memuat riwayat studi" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <FormAlert>{error}</FormAlert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Riwayat Studi</h1>
        <p className="mt-1 text-sm text-slate-600">
          Seluruh mata kuliah yang telah ditempuh dari semester 1 sampai semester terakhir.
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Cari semua kolom..."
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            submit(val);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(e.currentTarget.value, true);
          }}
          className="w-full sm:w-64 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium text-center w-10">No</th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('courseCode')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    Kode MK <SortIcon active={sortKey === 'courseCode'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('courseName')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    Mata Kuliah <SortIcon active={sortKey === 'courseName'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-center w-14">
                  <button
                    type="button"
                    onClick={() => toggleSort('credits')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    SKS <SortIcon active={sortKey === 'credits'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-center w-16">
                  <button
                    type="button"
                    onClick={() => toggleSort('gradeLetter')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    Nilai <SortIcon active={sortKey === 'gradeLetter'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-center w-20">
                  <button
                    type="button"
                    onClick={() => toggleSort('finalScore')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    Nilai Angka <SortIcon active={sortKey === 'finalScore'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-center w-20">
                  <button
                    type="button"
                    onClick={() => toggleSort('semester')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    Semester <SortIcon active={sortKey === 'semester'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-center w-24">TA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Belum ada mata kuliah yang tercatat.
                  </td>
                </tr>
              )}
              {filtered.map((it, idx) => (
                <tr
                  key={it.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 text-center text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{it.courseCode}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{it.courseName}</td>
                  <td className="px-4 py-2.5 text-center text-slate-700">{it.credits}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-semibold ${
                        it.gradePoint !== null && it.gradePoint >= 3
                          ? 'bg-emerald-100 text-emerald-700'
                          : it.gradePoint !== null && it.gradePoint >= 2
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {it.gradeLetter || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-700">
                    {it.finalScore !== null ? it.finalScore.toFixed(2) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-700">
                    {semesterLabel(it.semester)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-700">
                    {academicYearLabel(it.semester)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary — sejajar kolom tabel otomatis */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={3} className="px-4 py-3 font-semibold text-slate-600">
                    Jumlah yang Sudah Ditempuh
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-900">{totalSks}</td>
                  <td className="px-4 py-3 text-center" />
                  <td className="px-4 py-3 text-center font-bold text-slate-900">
                    {filtered.filter((it) => it.finalScore !== null).length}
                  </td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-slate-50">
                  <td colSpan={3} className="px-4 py-3 font-semibold text-slate-600">
                    IPK
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-emerald-700">
                    {ipk !== null ? ipk.toFixed(2) : '-'}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

export default RiwayatStudiPage;
