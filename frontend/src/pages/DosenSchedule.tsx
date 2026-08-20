import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getMyClasses } from '../lib/api';
import type { MyClass } from '../lib/types';

const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/**
 * Jadwal mengajar dosen — 2-panel layout.
 * Panel Kiri: daftar mata kuliah yang di-plot (to-do list cards).
 * Panel Kanan: detail jadwal pertemuan kelas terpilih.
 * Data dari GET /dosen/my-classes.
 */
export function DosenSchedule() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  const selectedClass = useMemo(
    () => (selectedId !== null ? (classes.find((c) => c.id === selectedId) ?? null) : null),
    [classes, selectedId],
  );

  // Auto-select first class on load if nothing selected
  useEffect(() => {
    if (classes.length > 0 && selectedId === null) {
      setSelectedId(classes[0].id);
    }
  }, [classes, selectedId]);

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
        /* ===== 2-PANEL LAYOUT ===== */
        <div className="flex gap-6 min-h-[480px]">
          {/* --- Panel Kiri: To-Do List --- */}
          <div className="w-80 shrink-0">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Daftar Mata Kuliah
            </h3>
            <div className="space-y-3">
              {classes.map((cls) => {
                const hasSchedules = cls.schedules.length > 0;
                const isSelected = cls.id === selectedId;

                return (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedId(cls.id)}
                    className={`w-full text-left rounded-lg border-2 p-4 transition-all duration-150 ${
                      isSelected
                        ? 'border-primary-500 ring-2 ring-primary-200 bg-white shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status indicator dot */}
                      <div className="mt-1 shrink-0">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            hasSchedules ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Course name */}
                        <h4 className="font-semibold text-slate-900 text-sm leading-tight">
                          {cls.courseName}
                        </h4>

                        {/* Code + SKS */}
                        <p className="text-xs text-slate-500 mt-1">
                          {cls.courseCode} • {cls.credits} SKS
                        </p>

                        {/* Class */}
                        <p className="text-xs text-slate-500">Kelas {cls.classCode}</p>

                        {/* Schedule info or action */}
                        {hasSchedules ? (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-600">
                              {dayNames[cls.dayOfWeek ?? 0]}{' '}
                              {cls.startTime && cls.endTime
                                ? `${cls.startTime}–${cls.endTime}`
                                : ''}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs text-green-600 font-medium">
                                {cls.schedules.length} pertemuan
                              </span>
                              <span className="text-xs text-slate-300">•</span>
                              <span className="text-xs text-slate-400">
                                {cls.room ?? 'Ruang TBD'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Belum Terjadwal
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Chevron indicator */}
                      <svg
                        className={`w-4 h-4 shrink-0 mt-1 transition-colors ${
                          isSelected ? 'text-primary-500' : 'text-slate-300'
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- Panel Kanan: Detail Jadwal --- */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-slate-200">
            {selectedClass ? (
              <div>
                {/* Class detail header */}
                <div className="px-6 py-4 border-b border-slate-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {selectedClass.courseName}
                      </h3>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {selectedClass.courseCode} • {selectedClass.credits} SKS • Kelas{' '}
                        {selectedClass.classCode}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-medium ${
                          selectedClass.schedules.length > 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {selectedClass.schedules.length > 0
                          ? `${selectedClass.schedules.length} Pertemuan Terjadwal`
                          : 'Belum Terjadwal'}
                      </span>
                    </div>
                  </div>

                  {/* Class meta */}
                  <div className="flex items-center gap-4 mt-3 text-sm text-slate-600">
                    {selectedClass.dayOfWeek && (
                      <span className="flex items-center gap-1.5">
                        <svg
                          className="w-4 h-4 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        {dayNames[selectedClass.dayOfWeek]}{' '}
                        {selectedClass.startTime && selectedClass.endTime
                          ? `${selectedClass.startTime}–${selectedClass.endTime}`
                          : ''}
                      </span>
                    )}
                    {selectedClass.room && (
                      <span className="flex items-center gap-1.5">
                        <svg
                          className="w-4 h-4 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                        {selectedClass.room}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <svg
                        className="w-4 h-4 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      {selectedClass.currentEnrolled}/{selectedClass.capacity} mahasiswa
                    </span>
                  </div>
                </div>

                {/* Meeting list */}
                <div className="px-6 py-4">
                  {selectedClass.schedules.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">
                        Daftar Pertemuan
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                              <th className="py-2 pr-4 font-medium">No.</th>
                              <th className="py-2 pr-4 font-medium">Tanggal</th>
                              <th className="py-2 pr-4 font-medium">Topik</th>
                              <th className="py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedClass.schedules.map((s) => (
                              <tr key={s.id} className="text-slate-700 hover:bg-slate-50">
                                <td className="py-3 pr-4 font-medium text-slate-600">
                                  {s.meetingNumber}
                                </td>
                                <td className="py-3 pr-4">
                                  {s.scheduledDate
                                    ? new Date(s.scheduledDate).toLocaleDateString('id-ID', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                      })
                                    : 'TBD'}
                                </td>
                                <td className="py-3 pr-4 text-slate-600">{s.topic || '-'}</td>
                                <td className="py-3">
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
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <svg
                          className="w-8 h-8 text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <h4 className="text-sm font-medium text-slate-700 mb-1">
                        Belum ada jadwal pertemuan
                      </h4>
                      <p className="text-xs text-slate-500 mb-4">
                        Atur jadwal pertemuan untuk kelas ini.
                      </p>
                      <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                        Atur Jadwal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-400">
                <svg
                  className="w-12 h-12 mb-3 text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <p className="text-sm">Pilih kelas untuk melihat detail jadwal</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
