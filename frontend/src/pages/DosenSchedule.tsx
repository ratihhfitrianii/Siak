import { useState, useEffect, useCallback } from 'react';
import { getDosenAvailableClasses, claimClass, unclaimClass } from '../lib/api';
import type { ClaimableClass } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Jadwal mengajar dosen — Pilih jadwal (checklist) dari jadwal yang sudah diinput Admin Akademik (T3.9, F-21).
 * Sesuai desain DL-08/Q15: admin input jadwal → dosen memilih via checkbox (klaim kelas).
 * Terhubung ke endpoint: GET /dosen/available-classes, POST/DELETE /dosen/claim-class.
 */
export function DosenSchedule() {
  const [classes, setClasses] = useState<ClaimableClass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDosenAvailableClasses();
      setClasses(res.items);
    } catch {
      setError('Gagal memuat daftar kelas yang bisa diklaim');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleClaim = async (classId: number) => {
    setClaiming((prev) => new Set(prev).add(classId));
    setError(null);
    setSuccess(null);
    try {
      await claimClass(classId);
      setSuccess('Kelas berhasil diklaim');
      load();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else if (apiError.message?.includes('already claimed')) {
        setError('Kelas sudah diklaim dosen lain');
      } else {
        setError('Gagal mengklaim kelas');
      }
    } finally {
      setClaiming((prev) => {
        const next = new Set(prev);
        next.delete(classId);
        return next;
      });
    }
  };

  const handleUnclaim = async (classId: number) => {
    setClaiming((prev) => new Set(prev).add(classId));
    setError(null);
    setSuccess(null);
    try {
      await unclaimClass(classId);
      setSuccess('Klaim kelas dibatalkan');
      load();
    } catch {
      setError('Gagal membatalkan klaim');
    } finally {
      setClaiming((prev) => {
        const next = new Set(prev);
        next.delete(classId);
        return next;
      });
    }
  };

  const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Ketersediaan Jadwal Mengajar</h2>
        <p className="text-slate-600">
          Pilih kelas yang akan Anda ampu (checkbox). Admin Akademik sudah menginput jadwal
          pertemuan — Anda hanya memilih kelas mana yang ingin diampu. Setelah diklaim, jadwal akan
          tampil di halaman Absensi & Bimbingan.
        </p>
      </div>

      {error && <FormAlert>{error}</FormAlert>}
      {success && (
        <p
          role="status"
          className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
        >
          {success}
        </p>
      )}

      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-center text-slate-500">
          Memuat daftar kelas...
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-center text-slate-500">
          Tidak ada kelas yang tersedia untuk diklaim di prodi Anda.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700 w-12">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.currentTarget.checked) {
                          classes.forEach((c) => !claiming.has(c.id) && handleClaim(c.id));
                        } else {
                          classes.forEach((c) => handleUnclaim(c.id));
                        }
                      }}
                      aria-label="Pilih semua kelas"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Mata Kuliah</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Kelas</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Semester</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">
                    Jadwal Pertemuan
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Kuota</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {classes.map((cls) => (
                  <tr key={cls.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                        checked={claiming.has(cls.id) || false}
                        onChange={() =>
                          claiming.has(cls.id) ? handleUnclaim(cls.id) : handleClaim(cls.id)
                        }
                        disabled={claiming.has(cls.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{cls.courseName}</p>
                      <p className="text-slate-500">
                        {cls.courseCode} • {cls.credits} SKS
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-900">{cls.classCode}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {cls.semesterName} ({cls.semesterCode})
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cls.schedules.length === 0 ? (
                        <span className="text-slate-400">Belum ada jadwal pertemuan</span>
                      ) : (
                        <ul className="space-y-1">
                          {cls.schedules.slice(0, 3).map((s) => (
                            <li key={s.id} className="flex items-center gap-2">
                              <span className="text-slate-500">
                                Pertemuan {s.meetingNumber}:{' '}
                                {
                                  dayNames[
                                    s.scheduledDate ? new Date(s.scheduledDate).getDay() || 7 : 0
                                  ]
                                }{' '}
                                {s.scheduledDate
                                  ? new Date(s.scheduledDate).toLocaleDateString('id-ID')
                                  : 'TBD'}
                              </span>
                              {s.topic && (
                                <span className="text-slate-400 text-xs">({s.topic})</span>
                              )}
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  s.isCompleted
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-primary-100 text-primary-800'
                                }`}
                              >
                                {s.isCompleted ? 'Selesai' : 'Terjadwal'}
                              </span>
                            </li>
                          ))}
                          {cls.schedules.length > 3 && (
                            <li className="text-slate-400 text-xs">
                              +{cls.schedules.length - 3} pertemuan lainnya...
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {cls.currentEnrolled} / {cls.capacity}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {claiming.has(cls.id) ? (
                        <span className="text-slate-400 text-sm animate-pulse">Memproses...</span>
                      ) : (
                        <button
                          onClick={() => handleClaim(cls.id)}
                          className="px-3 py-1 bg-primary-500 text-white text-sm rounded hover:bg-primary-600 transition-colors"
                        >
                          Klaim
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
