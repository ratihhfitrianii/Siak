import { useState, useEffect } from 'react';
import { getAttendanceSessions, createAttendanceSession, submitAttendance } from '../lib/api';
import type { AttendanceSession, AttendanceRecord } from '../lib/types';

/**
 * Input absensi (T3.7 + T3.8, perm attendance.input) — centang mahasiswa yang hadir.
 * Terhubung ke endpoint /attendance, /attendance/submit.
 */
export function DosenAttendance() {
  const [classId, setClassId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionDate, setSessionDate] = useState('');
  const [topic, setTopic] = useState('');
  const [material, setMaterial] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [showCreateSession, setShowCreateSession] = useState(false);

  // Load sessions when classId changes
  useEffect(() => {
    if (!classId) {
      setSessions([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    getAttendanceSessions(classId)
      .then((res) => {
        setSessions(res.items);
      })
      .catch(() => {
        setError('Gagal memuat sesi absensi');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [classId]);

  // Load records when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setRecords([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    getAttendanceRecords(sessionId)
      .then((res) => {
        setRecords(res.items);
      })
      .catch(() => {
        setError('Gagal memuat record absensi');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [sessionId]);

  // Import getAttendanceRecords from api
  const getAttendanceRecords = async (sessionId: number) => {
    const { getAttendanceRecords: fn } = await import('../lib/api');
    return fn(sessionId);
  };

  const toggleStudentAttendance = (studentId: number) => {
    setRecords((prev) =>
      prev.map((record) =>
        record.studentId === studentId
          ? { ...record, status: record.status === 'hadir' ? 'tidak_hadir' : 'hadir' }
          : record,
      ),
    );
  };

  const handleCreateSession = async () => {
    if (!classId || !sessionDate || !topic || !material) {
      setError('Lengkapi semua field sesi absensi');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const newSession = await createAttendanceSession({
        classId,
        sessionDate,
        topic,
        material,
      });
      setSuccess('Sesi absensi berhasil dibuat');
      setSessionDate('');
      setTopic('');
      setMaterial('');
      setShowCreateSession(false);
      setSessionId(newSession.id);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else {
        setError('Gagal membuat sesi absensi');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitAttendance = async () => {
    if (!sessionId || records.length === 0) {
      setError('Pilih sesi absensi terlebih dahulu');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await submitAttendance({
        sessionId,
        records: records.map((r) => ({ studentId: r.studentId, status: r.status })),
      });
      setSuccess('Absensi berhasil disimpan');
      setRecords([]);
      setSessionId(null);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else {
        setError('Gagal menyimpan absensi');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Class options - in real app these would come from API
  const classOptions = [
    { id: 1, code: 'TI101-A', name: 'Dasar-Dasar Pemrograman (Kelas A)' },
    { id: 2, code: 'SI202-C', name: 'Basis Data (Kelas C)' },
    { id: 3, code: 'MNJ301-B', name: 'Manajemen Strategis (Kelas B)' },
    { id: 4, code: 'HKM401-A', name: 'Hukum Bisnis (Kelas A)' },
    { id: 5, code: 'KN102-D', name: 'Anatomi Tubuh Manusia (Kelas D)' },
  ];

  const presentCount = records.filter((r) => r.status === 'hadir').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Absensi</h2>
        <p className="text-gray-600">
          Input kehadiran mahasiswa untuk pertemuan tertentu. Centang mahasiswa yang hadir.
        </p>
      </div>

      {/* Class Selection */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Pilih Kelas</h3>
        {error && (
          <p
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
          >
            {success}
          </p>
        )}
        <select
          value={classId ?? ''}
          onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Pilih Kelas</option>
          {classOptions.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.code} - {cls.name}
            </option>
          ))}
        </select>
      </div>

      {/* Session Selection / Creation */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Sesi Absensi</h3>
        {!classId ? (
          <p className="text-gray-500">Pilih kelas terlebih dahulu.</p>
        ) : (
          <>
            <div className="mb-4 flex justify-between items-center">
              <select
                value={sessionId ?? ''}
                onChange={(e) => setSessionId(e.target.value ? Number(e.target.value) : null)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Sesi yang Ada</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sessionDate} - {s.topic} ({s.classCode})
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowCreateSession(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Buat Sesi Baru
              </button>
            </div>

            {showCreateSession && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-gray-900">Buat Sesi Absensi Baru</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal</label>
                    <input
                      type="date"
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Topik</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Contoh: Pertemuan 1 - Pengenalan"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Materi</label>
                    <textarea
                      value={material}
                      onChange={(e) => setMaterial(e.target.value)}
                      rows={2}
                      placeholder="Detail materi yang dibahas..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setShowCreateSession(false)}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleCreateSession}
                    disabled={isLoading}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors"
                  >
                    {isLoading ? 'Membuat...' : 'Buat Sesi'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Attendance Records */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Daftar Mahasiswa</h3>
        {!sessionId ? (
          <p className="text-gray-500">Pilih atau buat sesi absensi terlebih dahulu.</p>
        ) : isLoading ? (
          <p className="text-gray-500">Memuat data mahasiswa...</p>
        ) : records.length === 0 ? (
          <p className="text-gray-500">Belum ada mahasiswa terdaftar di sesi ini.</p>
        ) : (
          <>
            <div className="space-y-2">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id={`student-${record.studentId}`}
                      checked={record.status === 'hadir'}
                      onChange={() => toggleStudentAttendance(record.studentId)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`student-${record.studentId}`}
                      className="text-sm font-medium text-gray-700"
                    >
                      {record.studentName} ({record.nim})
                    </label>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      record.status === 'hadir'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {record.status === 'hadir' ? 'Hadir' : 'Tidak Hadir'}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Total Mahasiswa: {records.length} | Hadir: {presentCount} | Tidak Hadir:{' '}
                {records.length - presentCount}
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSubmitAttendance}
                disabled={isLoading || records.length === 0}
                className="px-6 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Memproses...' : 'Simpan Absensi'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
