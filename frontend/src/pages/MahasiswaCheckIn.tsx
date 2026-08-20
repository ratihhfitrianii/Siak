import { useState } from 'react';
import { checkInAttendance } from '../lib/api';
import { FormAlert } from '../components/ErrorInline';

/**
 * Halaman Check-In Absensi Mahasiswa.
 * Input: Session ID (manual) atau QR Code (future: camera scan).
 * POST /attendance/check-in { sessionId } | { qrCode }
 */
export function MahasiswaCheckIn() {
  const [sessionId, setSessionId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [inputMode, setInputMode] = useState<'session' | 'qr'>('session');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCheckIn = async () => {
    setError(null);
    setSuccess(null);

    const payload =
      inputMode === 'session'
        ? { sessionId: Number(sessionId) || undefined }
        : { qrCode: qrCode.trim() || undefined };

    if (!payload.sessionId && !payload.qrCode) {
      setError(inputMode === 'session' ? 'Masukkan ID Sesi Absensi' : 'Masukkan Kode QR');
      return;
    }

    setIsLoading(true);
    try {
      const res = await checkInAttendance(payload);
      setSuccess(res.message ?? 'Absensi berhasil dicatat!');
      setSessionId('');
      setQrCode('');
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'FORBIDDEN') {
        setError(apiError.message ?? 'Sesi tidak dibuka atau Anda tidak terdaftar di kelas ini');
      } else if (apiError.code === 'NOT_FOUND') {
        setError('Sesi absensi tidak ditemukan');
      } else if (apiError.code === 'CONFLICT') {
        setError('Anda sudah melakukan check-in untuk sesi ini');
      } else {
        setError(apiError.message ?? 'Gagal melakukan check-in');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-8 w-8 text-green-600"
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
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Check-In Absensi</h1>
        <p className="text-slate-500 mt-1">Masukkan ID Sesi atau pindai QR Code dari dosen Anda</p>
      </div>

      {/* Input Mode Toggle */}
      <div className="bg-white rounded-lg shadow-sm p-1 flex gap-1">
        <button
          type="button"
          onClick={() => {
            setInputMode('session');
            setError(null);
            setSuccess(null);
          }}
          className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${
            inputMode === 'session'
              ? 'bg-primary-500 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <svg
            className="inline h-4 w-4 mr-1.5 -mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
            />
          </svg>
          ID Sesi
        </button>
        <button
          type="button"
          onClick={() => {
            setInputMode('qr');
            setError(null);
            setSuccess(null);
          }}
          className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${
            inputMode === 'qr' ? 'bg-primary-500 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <svg
            className="inline h-4 w-4 mr-1.5 -mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          QR Code
        </button>
      </div>

      {/* Input Card */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {error && <FormAlert>{error}</FormAlert>}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
            <svg
              className="h-10 w-10 text-green-500 mx-auto mb-2"
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
            <p role="status" className="text-green-800 font-medium">
              {success}
            </p>
          </div>
        )}

        {inputMode === 'session' ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">ID Sesi Absensi</label>
            <input
              type="number"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Contoh: 42"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg text-lg text-center tracking-wider focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-slate-400 mt-2 text-center">
              Minta ID Sesi kepada dosen Anda
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Kode QR</label>
            <input
              type="text"
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="Masukkan kode QR dari dosen"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg text-lg text-center tracking-wider focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-slate-400 mt-2 text-center">
              Scan QR Code yang ditampilkan dosen di kelas
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleCheckIn}
          disabled={isLoading || (inputMode === 'session' ? !sessionId : !qrCode)}
          className="w-full mt-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-lg"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Memproses...
            </span>
          ) : (
            'Check-In Sekarang'
          )}
        </button>
      </div>

      {/* Tips */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Tips:</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• Pastikan sesi absensi sudah dibuka oleh dosen</li>
          <li>• Anda hanya bisa check-in satu kali per sesi</li>
          <li>• Check-in hanya bisa dilakukan jika Anda terdaftar di kelas tersebut</li>
          <li>• Setelah sesi ditutup, check-in tidak bisa dilakukan lagi</li>
        </ul>
      </div>
    </div>
  );
}
