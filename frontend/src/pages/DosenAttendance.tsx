import { useState, useEffect, useCallback } from 'react';
import {
  getAttendanceSessions,
  createAttendanceSession,
  setAttendanceSessionOpen,
  getAttendanceRecords,
  updateAttendanceRecord,
  getMyClasses,
} from '../lib/api';
import type { AttendanceSession, AttendanceRecordItem, MyClass } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Absensi dosen (T3.7 + T3.8, perm attendance.input) — terhubung API nyata:
 * GET/POST /attendance/sessions, PUT /attendance/sessions/:id/open|close,
 * GET /attendance/sessions/:id/records, PUT /attendance/records/:id.
 * Sesi dibuat dari jadwal pertemuan (schedule) kelas yang diampu.
 */
export function DosenAttendance() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [records, setRecords] = useState<AttendanceRecordItem[]>([]);
  const [sessionInfo, setSessionInfo] = useState<{
    sessionDate: string;
    topic: string | null;
    isOpen: boolean;
  } | null>(null);

  // Create form
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [topic, setTopic] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await getAttendanceSessions();
      setSessions(list);
    } catch (_err) {
      setError('Gagal memuat sesi absensi');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    getMyClasses()
      .then((res) => setClasses(res.items))
      .catch(() => {
        /* dropdown kelas opsional */
      });
  }, [loadSessions]);

  const loadRecords = useCallback(async (sessionId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAttendanceRecords(sessionId);
      setRecords(res.records);
      setSessionInfo({
        sessionDate: res.session.sessionDate,
        topic: res.session.topic,
        isOpen: res.session.isOpen,
      });
    } catch (_err) {
      setError('Gagal memuat rekap absensi');
      setRecords([]);
      setSessionInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectSession = (id: string) => {
    const sid = id ? Number(id) : null;
    setSelectedSessionId(sid);
    setError(null);
    setSuccess(null);
    if (sid) {
      loadRecords(sid);
    } else {
      setRecords([]);
      setSessionInfo(null);
    }
  };

  const handleCreate = async () => {
    if (!scheduleId) {
      setError('Pilih jadwal pertemuan terlebih dahulu');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await createAttendanceSession({ scheduleId, topic: topic.trim() });
      setSuccess('Sesi absensi berhasil dibuat');
      setScheduleId(null);
      setTopic('');
      await loadSessions();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'CONFLICT') {
        setError(apiError.message ?? 'Sesi absensi untuk jadwal ini sudah ada');
      } else if (apiError.code === 'FORBIDDEN') {
        setError('Anda tidak mengajar jadwal ini');
      } else {
        setError('Gagal membuat sesi absensi');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleOpen = async (session: AttendanceSession) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await setAttendanceSessionOpen(session.id, !session.isOpen);
      setSuccess(session.isOpen ? 'Sesi ditutup' : 'Sesi dibuka — mahasiswa dapat check-in');
      await loadSessions();
      if (selectedSessionId === session.id) {
        await loadRecords(session.id);
      }
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal mengubah status sesi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRecord = async (record: AttendanceRecordItem, status: string) => {
    if (!record.recordId) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await updateAttendanceRecord(record.recordId, {
        status: status as 'hadir' | 'tidak_hadir' | 'izin' | 'sakit',
      });
      setSuccess(`Status ${record.nim} diperbarui`);
      if (selectedSessionId) {
        await loadRecords(selectedSessionId);
      }
    } catch (_err) {
      setError('Gagal memperbarui status absensi');
    } finally {
      setIsLoading(false);
    }
  };

  const allSchedules = classes.flatMap((cls) =>
    cls.schedules.map((s) => ({
      scheduleId: s.id,
      label: `${cls.courseCode} — ${cls.classCode} (Pertemuan ${s.meetingNumber}, ${s.scheduledDate})`,
    })),
  );

  const statusColors: Record<string, string> = {
    hadir: 'bg-green-100 text-green-800',
    tidak_hadir: 'bg-red-100 text-red-800',
    izin: 'bg-yellow-100 text-yellow-800',
    sakit: 'bg-orange-100 text-orange-800',
    belum_absen: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Absensi Mengajar</h2>
        <p className="text-slate-600">
          Buat sesi absensi dari jadwal pertemuan, buka sesi agar mahasiswa dapat check-in, lalu
          perbarui rekap kehadiran.
        </p>
      </div>

      {/* Create session */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Buat Sesi Absensi</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Jadwal Pertemuan
            </label>
            <select
              value={scheduleId ?? ''}
              onChange={(e) => setScheduleId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Pilih Jadwal Pertemuan</option>
              {allSchedules.map((s) => (
                <option key={s.scheduleId} value={s.scheduleId}>
                  {s.label}
                </option>
              ))}
            </select>
            {allSchedules.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Belum ada jadwal pertemuan — admin akademik perlu mengisi jadwal kelas Anda.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Topik (opsional)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Mis. Materi pertemuan 5"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={isLoading || !scheduleId}
            className="px-6 py-2 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Buat Sesi Absensi'}
          </button>
        </div>
      </div>

      {/* Sessions list */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Sesi Absensi</h3>
        {error && <FormAlert>{error}</FormAlert>}
        {success && (
          <p
            role="status"
            className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
          >
            {success}
          </p>
        )}
        {isLoading && sessions.length === 0 ? (
          <p className="text-slate-500">Memuat sesi absensi...</p>
        ) : sessions.length === 0 ? (
          <p className="text-slate-500">
            Belum ada sesi absensi. Buat dari jadwal pertemuan di atas.
          </p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex justify-between items-start gap-4">
                  <button
                    type="button"
                    onClick={() => handleSelectSession(String(s.id))}
                    className="text-left flex-1"
                  >
                    <h4 className="font-semibold text-slate-900">
                      {s.courseCode} — {s.classCode}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        Pertemuan {s.meetingNumber} · {s.sessionDate}
                      </span>
                    </h4>
                    <p className="text-sm text-slate-600 mt-1">
                      {s.topic ?? 'Tanpa topik'} · Hadir {s.hadirCount}/{s.totalRecords}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        s.isOpen ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {s.isOpen ? 'Terbuka' : 'Tertutup'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleOpen(s)}
                      disabled={isLoading}
                      className="text-xs px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {s.isOpen ? 'Tutup' : 'Buka'}
                    </button>
                  </div>
                </div>

                {selectedSessionId === s.id && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    {sessionInfo && (
                      <p className="text-sm text-slate-600 mb-2">
                        Tanggal: {sessionInfo.sessionDate} · Topik: {sessionInfo.topic ?? '-'} ·{' '}
                        {sessionInfo.isOpen
                          ? 'Mahasiswa dapat check-in'
                          : 'Sesi tertutup — rekap masih bisa diperbarui'}
                      </p>
                    )}
                    {records.length === 0 ? (
                      <p className="text-slate-500">Belum ada mahasiswa terdaftar di kelas ini.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium text-slate-700">
                                NIM
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-slate-700">
                                Nama
                              </th>
                              <th className="px-4 py-3 text-center font-medium text-slate-700">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-200">
                            {records.map((r) => (
                              <tr key={r.studentId}>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                                  {r.nim}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-900">
                                  {r.fullName}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {r.recordId !== null ? (
                                    <select
                                      value={r.status}
                                      onChange={(e) => handleUpdateRecord(r, e.target.value)}
                                      disabled={isLoading}
                                      className="px-2 py-1 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                                    >
                                      <option value="hadir">Hadir</option>
                                      <option value="tidak_hadir">Tidak Hadir</option>
                                      <option value="izin">Izin</option>
                                      <option value="sakit">Sakit</option>
                                    </select>
                                  ) : (
                                    <span
                                      className={`text-xs px-2 py-1 rounded-full ${
                                        statusColors[r.status] ?? 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      Belum check-in
                                    </span>
                                  )}
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
    </div>
  );
}
