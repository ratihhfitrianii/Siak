import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getMyClasses } from '../lib/api';
import type { MyClass } from '../lib/types';

const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/**
 * Jadwal mengajar dosen — header ringkasan + daftar kelas + jadwal pertemuan.
 * Data dari GET /dosen/my-classes.
 */
export function DosenSchedule() {
  const { user } = useAuth();
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

  /* ---- Derived data ---- */
  const summary = useMemo(() => {
    if (classes.length === 0) return null;

    // Aggregate per unique semester
    const semMap = new Map<
      number,
      { code: string; name: string; totalSks: number; scheduledSks: number }
    >();
    let totalSksAll = 0;
    let scheduledSksAll = 0;

    for (const cls of classes) {
      const sem = semMap.get(cls.semesterId) ?? {
        code: cls.semesterCode,
        name: cls.semesterName,
        totalSks: 0,
        scheduledSks: 0,
      };
      sem.totalSks += cls.credits;
      if (cls.schedules.length > 0) {
        sem.scheduledSks += cls.credits;
      }
      semMap.set(cls.semesterId, sem);

      totalSksAll += cls.credits;
      if (cls.schedules.length > 0) scheduledSksAll += cls.credits;
    }

    const semesters = Array.from(semMap.values());
    const activeSemester =
      semesters.length === 1
        ? semesters[0]
        : (semesters.find((s) => s.code.includes('-1')) ?? semesters[0]);

    // Status pengajuan: derived from scheduling completeness
    const allScheduled = scheduledSksAll === totalSksAll;
    const noneScheduled = scheduledSksAll === 0;
    const statusPengajuan: 'disetujui' | 'draft' | 'proses' = noneScheduled
      ? 'draft'
      : allScheduled
        ? 'disetujui'
        : 'proses';

    return {
      totalSks: totalSksAll,
      scheduledSks: scheduledSksAll,
      unscheduledSks: totalSksAll - scheduledSksAll,
      classCount: classes.length,
      activeSemester,
      statusPengajuan,
    };
  }, [classes]);

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700' },
    proses: { label: 'Menunggu Persetujuan Kaprodi', color: 'bg-amber-100 text-amber-700' },
    disetujui: { label: 'Disetujui', color: 'bg-green-100 text-green-700' },
  };

  const schedPercent = summary ? Math.round((summary.scheduledSks / summary.totalSks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ===== HEADER & RINGKASAN ===== */}
      {summary && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {/* Top bar: identity + status */}
          <div className="bg-gradient-to-r from-primary-50 to-white px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-lg font-bold">
                  {user?.fullName?.charAt(0) ?? 'D'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {user?.fullName ?? 'Dosen'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {summary.activeSemester.name || summary.activeSemester.code}
                  </p>
                </div>
              </div>
              <span
                className={`text-xs font-medium px-3 py-1 rounded-full ${statusLabels[summary.statusPengajuan].color}`}
              >
                {statusLabels[summary.statusPengajuan].label}
              </span>
            </div>
          </div>

          {/* SKS Progress Bar */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Beban Mengajar SKS</span>
              <span className="text-sm text-slate-500">
                {summary.scheduledSks}/{summary.totalSks} SKS terjadwal
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-primary-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${schedPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
              <span>
                {summary.classCount} kelas • {summary.scheduledSks} SKS terjadwal
              </span>
              <span>
                {summary.unscheduledSks > 0
                  ? `${summary.unscheduledSks} SKS belum dijadwalkan`
                  : 'Semua SKS sudah terjadwal'}
              </span>
            </div>
          </div>
        </div>
      )}

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
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        cls.schedules.length > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
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
