import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAttendanceSessions,
  createAttendanceSession,
  setAttendanceSessionOpen,
  getAttendanceRecords,
  updateAttendanceRecord,
  createAttendanceRecord,
  getMyClasses,
} from '../lib/api';
import type { AttendanceSession, AttendanceRecordItem, MyClass } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/** Format tanggal (ISO atau yyyy-MM-dd) → "Senin, 15 September 2026" (id-ID). */
function formatTanggalID(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

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
  // Popup form buat sesi
  const [showCreateModal, setShowCreateModal] = useState(false);

  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setScheduleId(null);
    setTopic('');
  }, []);

  useEffect(() => {
    if (!showCreateModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCreateModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreateModal, closeCreateModal]);

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
    setError(null);
    setSuccess(null);
    // Klik sesi yang sama → collapse (toggle). Klik sesi lain → expand.
    if (sid !== null && sid === selectedSessionId) {
      setSelectedSessionId(null);
      setRecords([]);
      setSessionInfo(null);
      return;
    }
    setSelectedSessionId(sid);
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
      closeCreateModal();
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
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (record.recordId) {
        // Sudah ada record (mis. hasil check-in) → update
        await updateAttendanceRecord(record.recordId, {
          status: status as 'hadir' | 'tidak_hadir' | 'izin' | 'sakit',
        });
      } else if (selectedSessionId) {
        // Belum check-in → dosen buat record baru sekaligus set statusnya
        await createAttendanceRecord(selectedSessionId, {
          studentId: record.studentId,
          status: status as 'hadir' | 'tidak_hadir' | 'izin' | 'sakit',
        });
      } else {
        return;
      }
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

  const takenScheduleIds = useMemo(() => new Set(sessions.map((s) => s.scheduleId)), [sessions]);
  // Jadwal yang sudah pernah dibuatkan sesi absensi tidak ditawarkan lagi
  const availableSchedules = useMemo(
    () => classes.flatMap((cls) => cls.schedules).filter((s) => !takenScheduleIds.has(s.id)),
    [classes, takenScheduleIds],
  );
  const scheduleLabels = useMemo(
    () =>
      new Map(
        classes.flatMap((cls) =>
          cls.schedules.map((s) => {
            const d = new Date(s.scheduledDate);
            const hari = Number.isNaN(d.getTime())
              ? ''
              : d.toLocaleDateString('id-ID', { weekday: 'long' });
            const tanggalWaktu = `${formatTanggalID(s.scheduledDate)}${cls.startTime ? `, ${cls.startTime}-${cls.endTime}` : ''}`;
            return [
              s.id,
              `${cls.courseName} - ${cls.classCode} - Semester ${cls.semesterNumber} - ${hari}, ${tanggalWaktu}`,
            ] as const;
          }),
        ),
      ),
    [classes],
  );

  return (
    <div className="space-y-6">
      {/* Sessions list */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-lg font-medium text-slate-900">Sesi Absensi</h3>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 transition-colors text-sm"
          >
            + Tambah Sesi Absensi
          </button>
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
        {isLoading && sessions.length === 0 ? (
          <p className="text-slate-500">Memuat sesi absensi...</p>
        ) : sessions.length === 0 ? (
          <p className="text-slate-500">
            Belum ada sesi absensi. Klik "Tambah Sesi Absensi" untuk membuat dari jadwal pertemuan.
          </p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <button
                    type="button"
                    onClick={() => handleSelectSession(String(s.id))}
                    className="text-left flex-1"
                  >
                    <h4 className="font-semibold text-slate-900">
                      {s.courseName} - {s.classCode}
                    </h4>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Pertemuan {s.meetingNumber} / {formatTanggalID(s.sessionDate)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        ID: {s.id}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500">
                        {s.topic ?? 'Tanpa topik'} · Hadir {s.hadirCount}/{s.totalRecords}
                      </span>
                    </div>
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
                        Tanggal: {formatTanggalID(sessionInfo.sessionDate)} · Topik:{' '}
                        {sessionInfo.topic ?? '-'} ·{' '}
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
                                Status Kehadiran
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
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                                    {(
                                      [
                                        ['hadir', 'Hadir'],
                                        ['tidak_hadir', 'Tidak Hadir'],
                                        ['sakit', 'Sakit'],
                                        ['izin', 'Izin'],
                                      ] as const
                                    ).map(([value, label]) => (
                                      <label
                                        key={value}
                                        className="inline-flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <input
                                          type="radio"
                                          name={`status-${r.studentId}`}
                                          value={value}
                                          checked={r.status === value}
                                          onChange={() => handleUpdateRecord(r, value)}
                                          disabled={isLoading}
                                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-slate-300"
                                        />
                                        <span className="text-xs text-slate-700">{label}</span>
                                      </label>
                                    ))}
                                  </div>
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

      {/* Popup: Buat Sesi Absensi */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Buat Sesi Absensi"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateModal();
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-900">Buat Sesi Absensi</h3>
              <button
                type="button"
                onClick={closeCreateModal}
                aria-label="Tutup"
                className="text-slate-400 hover:text-slate-600 transition-colors"
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
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="attendance-schedule-select"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Jadwal Pertemuan
                </label>
                <select
                  id="attendance-schedule-select"
                  value={scheduleId ?? ''}
                  onChange={(e) => setScheduleId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Pilih Jadwal Pertemuan</option>
                  {availableSchedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {scheduleLabels.get(s.id)}
                    </option>
                  ))}
                </select>
                {availableSchedules.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Semua jadwal pertemuan sudah dibuatkan sesi absensi.
                  </p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor="attendance-topic-input"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Topik (opsional)
                </label>
                <input
                  id="attendance-topic-input"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Mis. Materi pertemuan 5"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isLoading || !scheduleId}
                className="px-6 py-2 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isLoading ? 'Memproses...' : 'Buat Sesi Absensi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
