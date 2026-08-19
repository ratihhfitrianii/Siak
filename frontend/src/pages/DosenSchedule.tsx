import { useState, useEffect, useCallback } from 'react';
import { getMyClasses } from '../lib/api';
import type { MyClass } from '../lib/types';

const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/**
 * Jadwal mengajar dosen — menampilkan kelas yang diampu + jadwal pertemuan.
 * Data dari GET /dosen/my-classes.
 */
export function DosenSchedule() {
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getMyClasses();
      setClasses(res.items);
    } catch {
      setError('Gagal memuat jadwal mengajar');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Jadwal Mengajar</h2>
        <p className="text-slate-600">Daftar kelas yang Anda ampu beserta jadwal pertemuan.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-center text-slate-500">
          Memuat jadwal mengajar...
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-center text-slate-500">
          Belum ada kelas yang diampu.
        </div>
      ) : (
        <div className="space-y-4">
          {classes.map((cls) => (
            <div key={cls.id} className="bg-white rounded-lg shadow-sm border border-slate-200">
              {/* Class Header */}
              <div
                className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleExpand(cls.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-slate-900">{cls.courseName}</h3>
                      <span className="text-sm text-slate-500">
                        {cls.courseCode} • {cls.credits} SKS
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                      <span>Kelas: {cls.classCode}</span>
                      {cls.dayOfWeek && (
                        <span>
                          {dayNames[cls.dayOfWeek]}{' '}
                          {cls.startTime && cls.endTime ? `${cls.startTime}–${cls.endTime}` : ''}
                        </span>
                      )}
                      {cls.room && <span>Ruang: {cls.room}</span>}
                      <span>
                        {cls.currentEnrolled}/{cls.capacity} mahasiswa
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full">
                      {cls.schedules.length} pertemuan
                    </span>
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        expandedId === cls.id ? 'rotate-180' : ''
                      }`}
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
                </div>
              </div>

              {/* Schedules */}
              {expandedId === cls.id && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                  {cls.schedules.length === 0 ? (
                    <p className="text-sm text-slate-500 py-2">Belum ada jadwal pertemuan.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-2 pr-4 font-medium">Pertemuan</th>
                            <th className="py-2 pr-4 font-medium">Tanggal</th>
                            <th className="py-2 pr-4 font-medium">Topik</th>
                            <th className="py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {cls.schedules.map((s) => (
                            <tr key={s.id} className="text-slate-700">
                              <td className="py-2 pr-4">{s.meetingNumber}</td>
                              <td className="py-2 pr-4">
                                {s.scheduledDate
                                  ? new Date(s.scheduledDate).toLocaleDateString('id-ID', {
                                      weekday: 'long',
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                    })
                                  : 'TBD'}
                              </td>
                              <td className="py-2 pr-4">{s.topic || '-'}</td>
                              <td className="py-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ${
                                    s.isCompleted
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {s.isCompleted ? 'Selesai' : 'Terjadwal'}
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
          ))}
        </div>
      )}
    </div>
  );
}
