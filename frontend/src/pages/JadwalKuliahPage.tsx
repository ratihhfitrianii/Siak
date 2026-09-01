import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest, checkInAttendance } from '../lib/api';
import type { GradeItem, MyKrs, MyKrsItem } from '../lib/types';
import { Spinner } from '../components/Spinner';
import { FormAlert } from '../components/ErrorInline';

const DAY_LABELS: Record<number, string> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
  7: 'Minggu',
};

/** Format jam "14:00:00" → "14:00". */
function formatTime(t: string | null): string {
  if (!t) return '-';
  return t.slice(0, 5);
}

/** Ubah semesterCode "2025/2026-1" → "2025/2026 Ganjil". */
function formatSemester(semester: string | undefined | null): string {
  if (!semester) return '-';
  const m = /^(.+)-([12])$/.exec(semester.trim());
  if (!m) return semester;
  return `${m[1]} ${m[2] === '1' ? 'Ganjil' : 'Genap'}`;
}

/**
 * Halaman Jadwal Kuliah mahasiswa — desain 2-panel seperti Transkrip.
 * Panel kiri (2/3): jadwal kuliah semester berjalan + tombol presensi + popup
 * Panel kanan (1/3): list semester yang telah diambil (dari data nilai)
 */
export function JadwalKuliahPage() {
  const { user } = useAuth();
  const studentId = user?.studentId ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myKrs, setMyKrs] = useState<MyKrs | null>(null);

  // Semesters dari data nilai (untuk panel kanan)
  const [semesters, setSemesters] = useState<string[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);

  // State popup presensi
  const [presenceClass, setPresenceClass] = useState<MyKrsItem | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [inputMode, setInputMode] = useState<'session' | 'qr'>('session');
  const [isLoading, setIsLoading] = useState(false);
  const [pError, setPError] = useState<string | null>(null);
  const [pSuccess, setPSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (studentId === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let krsFailed = false;

    // Fetch kedua: KRS + data nilai (untuk list semester)
    Promise.all([
      apiRequest<MyKrs>('/krs/my').catch((err) => {
        krsFailed = true;
        setError(err instanceof Error ? err.message : 'Gagal memuat jadwal kuliah');
        return null;
      }),
      apiRequest<{ items: GradeItem[] }>(`/grades/student/${studentId}`).catch(() => ({
        items: [] as GradeItem[],
      })),
    ])
      .then(([krs, grades]) => {
        if (cancelled) return;
        if (krsFailed) {
          setLoading(false);
          return;
        }
        if (krs) setMyKrs(krs);
        // Kumpulkan semester unik dari data nilai
        const gradeItems = grades?.items ?? [];
        const uniqueSemesters = [
          ...new Set(gradeItems.map((g) => g.semester).filter(Boolean)),
        ].sort();
        setSemesters(uniqueSemesters);
        // Default highlight: semester terbaru (yang sedang berjalan)
        setSelectedSemester(uniqueSemesters[uniqueSemesters.length - 1] ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Gagal memuat data jadwal kuliah');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Items KRS dari semester berjalan
  const krsItems = myKrs?.items ?? [];

  function openPresence(c: MyKrsItem) {
    setPresenceClass(c);
    setSessionId('');
    setQrCode('');
    setInputMode('session');
    setPError(null);
    setPSuccess(null);
  }

  async function handleCheckIn() {
    setPError(null);
    setPSuccess(null);
    const payload =
      inputMode === 'session'
        ? { sessionId: Number(sessionId) || undefined }
        : { qrCode: qrCode.trim() || undefined };

    if (!payload.sessionId && !payload.qrCode) {
      setPError(inputMode === 'session' ? 'Masukkan ID Sesi Absensi' : 'Masukkan Kode QR');
      return;
    }

    setIsLoading(true);
    try {
      const res = await checkInAttendance(payload);
      setPSuccess(res.message ?? 'Absensi berhasil dicatat!');
      setSessionId('');
      setQrCode('');
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (
        apiError.code === 'FORBIDDEN' ||
        apiError.code === 'NOT_FOUND' ||
        apiError.code === 'CONFLICT'
      ) {
        setPError(apiError.message ?? 'Gagal melakukan check-in');
      } else {
        setPError((err as { message?: string }).message ?? 'Gagal melakukan check-in');
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Memuat jadwal kuliah" />
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
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Jadwal Kuliah</h1>
        <p className="mt-1 text-sm text-slate-600">
          Mata kuliah yang dikontrak pada semester berjalan.
        </p>
      </div>

      {/* Main Layout: 2 Kolom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Kiri: Jadwal Kuliah Semester Terpilih (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          {krsItems.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <p className="text-slate-500">
                Belum ada mata kuliah yang dikontrak pada semester ini.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">Jadwal Kuliah Semester Berjalan</h2>
                <p className="text-sm text-slate-600">
                  {krsItems.length} mata kuliah · Total{' '}
                  {krsItems.reduce((s, c) => s + c.course.credits, 0)} SKS
                </p>
              </div>

              <div className="p-6 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-medium w-10 text-center">No</th>
                      <th className="py-2 pr-3 font-medium">Mata Kuliah</th>
                      <th className="py-2 pr-3 font-medium text-center w-14">SKS</th>
                      <th className="py-2 pr-3 font-medium text-center w-20">Kelas</th>
                      <th className="py-2 pr-3 font-medium">Nama Dosen</th>
                      <th className="py-2 pr-3 font-medium text-center w-20">Ruang</th>
                      <th className="py-2 pr-3 font-medium text-center w-28">Jam</th>
                      <th className="py-2 pr-3 font-medium text-center w-24">Presensi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {krsItems.map((it, idx) => (
                      <tr
                        key={it.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <td className="py-3 pr-3 text-center text-slate-500">{idx + 1}</td>
                        <td className="py-3 pr-3">
                          <div className="font-medium text-slate-800">{it.course.name}</div>
                          <div className="font-mono text-xs text-slate-400">{it.course.code}</div>
                        </td>
                        <td className="py-3 pr-3 text-center text-slate-700">
                          {it.course.credits}
                        </td>
                        <td className="py-3 pr-3 text-center">
                          <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {it.classCode}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-slate-700">{it.lecturerName ?? '-'}</td>
                        <td className="py-3 pr-3 text-center text-slate-700">{it.room ?? '-'}</td>
                        <td className="py-3 pr-3 text-center text-slate-700">
                          {it.dayOfWeek ? (DAY_LABELS[it.dayOfWeek] ?? '-') : '-'} ·{' '}
                          {formatTime(it.startTime)}–{formatTime(it.endTime)}
                        </td>
                        <td className="py-3 pr-3 text-center">
                          <button
                            type="button"
                            onClick={() => openPresence(it)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-primary-700"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            Presensi
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Panel Kanan: Semester yang Telah Diambil (1/3 width) */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-white p-5 shadow-sm h-full sticky top-24">
            <h3 className="font-semibold text-slate-900 mb-4">Tahun Akademik/Semester</h3>
            {semesters.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada riwayat semester.</p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {semesters.map((sem) => {
                  const isActive = selectedSemester === sem;
                  return (
                    <li key={sem}>
                      <button
                        type="button"
                        onClick={() => setSelectedSemester(sem)}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          isActive
                            ? 'bg-primary-50 border border-primary-200 ring-1 ring-primary-200'
                            : 'bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <span
                          className={`font-medium ${isActive ? 'text-primary-700' : 'text-slate-900'}`}
                        >
                          {formatSemester(sem)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Popup Presensi — sama seperti menu Virtual Absensi */}
      {presenceClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setPresenceClass(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Presensi</h2>
                <p className="text-sm text-slate-500">{presenceClass.course.name}</p>
                <p className="text-xs text-slate-400">
                  {presenceClass.classCode} · {presenceClass.room ?? '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPresenceClass(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Tutup"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setInputMode('session');
                  setPError(null);
                  setPSuccess(null);
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  inputMode === 'session'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                ID Sesi
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMode('qr');
                  setPError(null);
                  setPSuccess(null);
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  inputMode === 'qr'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                QR Code
              </button>
            </div>

            {pError && <FormAlert>{pError}</FormAlert>}
            {pSuccess && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-center text-green-700">
                {pSuccess}
              </div>
            )}

            {inputMode === 'session' ? (
              <input
                type="number"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="ID Sesi Absensi"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            ) : (
              <input
                type="text"
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
                placeholder="Kode QR"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            )}

            <button
              type="button"
              onClick={handleCheckIn}
              disabled={isLoading}
              className="mt-4 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {isLoading ? 'Memproses...' : 'Check-in'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default JadwalKuliahPage;
