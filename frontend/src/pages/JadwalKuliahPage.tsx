import { useEffect, useState } from 'react';
import { ApiError, apiRequest, checkInAttendance } from '../lib/api';
import type { MyKrs, MyKrsItem } from '../lib/types';
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

/**
 * Halaman Jadwal Kuliah mahasiswa.
 * List mata kuliah yang dikontrak pada semester berjalan:
 * No, Mata Kuliah, SKS, Kelas, Nama Dosen, Ruang, Jam, Presensi.
 * Klik "Presensi" membuka popup check-in (sama seperti menu Virtual Absensi).
 */
export function JadwalKuliahPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myKrs, setMyKrs] = useState<MyKrs | null>(null);

  // State popup presensi
  const [presenceClass, setPresenceClass] = useState<MyKrsItem | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [inputMode, setInputMode] = useState<'session' | 'qr'>('session');
  const [isLoading, setIsLoading] = useState(false);
  const [pError, setPError] = useState<string | null>(null);
  const [pSuccess, setPSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest<MyKrs>('/krs/my')
      .then((data) => {
        if (!cancelled) setMyKrs(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Gagal memuat jadwal kuliah');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = myKrs?.items ?? [];

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

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium text-center w-10">No</th>
                <th className="px-4 py-3 font-medium">Mata Kuliah</th>
                <th className="px-4 py-3 font-medium text-center w-14">SKS</th>
                <th className="px-4 py-3 font-medium text-center w-20">Kelas</th>
                <th className="px-4 py-3 font-medium">Nama Dosen</th>
                <th className="px-4 py-3 font-medium text-center w-20">Ruang</th>
                <th className="px-4 py-3 font-medium text-center w-28">Jam</th>
                <th className="px-4 py-3 font-medium text-center w-24">Presensi</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Belum ada mata kuliah yang dikontrak pada semester ini.
                  </td>
                </tr>
              )}
              {items.map((it, idx) => (
                <tr
                  key={it.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 text-center text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{it.course.name}</div>
                    <div className="font-mono text-xs text-slate-400">{it.course.code}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">{it.course.credits}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {it.classCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{it.lecturerName ?? '-'}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{it.room ?? '-'}</td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    {it.dayOfWeek ? (DAY_LABELS[it.dayOfWeek] ?? '-') : '-'} ·{' '}
                    {formatTime(it.startTime)}–{formatTime(it.endTime)}
                  </td>
                  <td className="px-4 py-3 text-center">
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
