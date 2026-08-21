import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getMyClasses, getAttendanceRecap } from '../lib/api';
import type { MyClass, AttendanceRecapItem } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';
import { Spinner } from '../components/Spinner';

/**
 * Rekap Kehadiran Mahasiswa (dosen) — persentase kehadiran per mahasiswa per kelas.
 * Terhubung API: GET /dosen/my-classes, GET /attendance/recap?classId=...
 * Hanya dosen pengampu kelas yang bisa akses (backend enforce).
 */
export function DosenAttendanceRecap() {
  const { user: _user } = useAuth();
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [recap, setRecap] = useState<AttendanceRecapItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    try {
      const cls = await getMyClasses();
      setClasses(cls.items);
      // Default: pilih kelas pertama
      if (cls.items.length > 0 && !selectedClassId) {
        setSelectedClassId(cls.items[0].id);
      }
    } catch {
      setError('Gagal memuat daftar kelas');
    }
  }, [selectedClassId]);

  const loadRecap = useCallback(async () => {
    if (!selectedClassId) return;
    setRecapLoading(true);
    setError(null);
    try {
      const data = await getAttendanceRecap(selectedClassId);
      setRecap(data);
    } catch {
      setError('Gagal memuat rekap kehadiran');
    } finally {
      setRecapLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    loadRecap();
  }, [loadRecap]);

  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;

  if (classes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" label="Memuat..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Rekap Kehadiran Mahasiswa</h2>
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      {/* Pilih Kelas */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Pilih Kelas</label>
        <select
          value={selectedClassId ?? ''}
          onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">-- Pilih Kelas --</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.courseName} - {cls.classCode} (Semester {cls.semesterNumber})
            </option>
          ))}
        </select>
        {classes.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">Anda tidak mengampu kelas manapun.</p>
        )}
      </div>

      {/* Tabel Rekap */}
      {selectedClass && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium text-slate-900">{selectedClass.courseName}</span>
              <span className="text-slate-500">{selectedClass.classCode}</span>
              <span className="text-slate-500">Semester {selectedClass.semesterNumber}</span>
              <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                Total {selectedClass.currentEnrolled} mahasiswa
              </span>
            </div>
          </div>

          {recapLoading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="h-8 w-8" label="Memuat rekap..." />
            </div>
          ) : recap.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Belum ada data kehadiran untuk kelas ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">No</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">NIM</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">
                      Nama Mahasiswa
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-slate-700">Hadir</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-700">Izin</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-700">Sakit</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-700">Alpha</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-700">
                      Total Pertemuan
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-slate-700">
                      % Kehadiran
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recap.map((item, idx) => (
                    <tr key={item.studentId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.nim}</td>
                      <td className="px-4 py-3 text-slate-900">{item.studentName}</td>
                      <td className="px-4 py-3 text-center text-green-700 font-medium">
                        {item.hadirCount}
                      </td>
                      <td className="px-4 py-3 text-center text-blue-700 font-medium">
                        {item.izinCount}
                      </td>
                      <td className="px-4 py-3 text-center text-amber-700 font-medium">
                        {item.sakitCount}
                      </td>
                      <td className="px-4 py-3 text-center text-red-700 font-medium">
                        {item.alphaCount}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-900">
                        {item.totalSessions}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            item.attendanceRate >= 80
                              ? 'bg-green-100 text-green-800'
                              : item.attendanceRate >= 60
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {item.attendanceRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
