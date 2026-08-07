import { useState, useEffect } from 'react';
import { getSchedule, createSchedule } from '../lib/api';
import type { ScheduleItem } from '../lib/types';

/**
 * Jadwal mengajar dosen (T3.7 + T3.8, perm schedule.manage).
 * Terhubung ke endpoint /schedule.
 */
export function DosenSchedule() {
  const [classId, setClassId] = useState<number | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);

  // Load schedules when classId changes
  useEffect(() => {
    if (!classId) {
      setSchedules([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    getSchedule(classId)
      .then((res) => {
        setSchedules(res.items);
      })
      .catch(() => {
        setError('Gagal memuat jadwal');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [classId]);

  const dayLabels: Record<number, string> = {
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
    7: 'Minggu',
  };

  const handleSubmit = async () => {
    if (!classId || !dayOfWeek || !startTime || !endTime || !room) {
      setError('Lengkapi semua field jadwal');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await createSchedule({ classId, dayOfWeek, startTime, endTime, room });
      setSuccess('Jadwal berhasil disimpan');
      setDayOfWeek(null);
      setStartTime('');
      setEndTime('');
      setRoom('');
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else if (apiError.code === 'CONFLICT') {
        setError('Jadwal bentrok dengan jadwal yang sudah ada');
      } else {
        setError('Gagal menyimpan jadwal');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Jadwal Mengajar</h2>
        <p className="text-gray-600">
          Input jadwal mengajar untuk setiap mata kuliah yang dipilih. Sistem akan memvalidasi clash
          jadwal.
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Form Input Jadwal</h3>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mata Kuliah / Kelas
            </label>
            <select
              value={classId ?? ''}
              onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Pilih Kelas</option>
              {classOptions.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.code} - {cls.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hari</label>
            <select
              value={dayOfWeek ?? ''}
              onChange={(e) => setDayOfWeek(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Pilih Hari</option>
              {Object.entries(dayLabels).map(([num, label]) => (
                <option key={num} value={num}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ruang</label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Contoh: R101"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jam Mulai</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jam Selesai</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isLoading || !classId || !dayOfWeek || !startTime || !endTime || !room}
            className="px-6 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Simpan Jadwal'}
          </button>
        </div>
      </div>

      {/* Existing Schedule List */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Jadwal yang Sudah Ada</h3>
        {!classId ? (
          <p className="text-gray-500">Pilih kelas untuk melihat jadwal.</p>
        ) : isLoading ? (
          <p className="text-gray-500">Memuat jadwal...</p>
        ) : schedules.length === 0 ? (
          <p className="text-gray-500">Belum ada jadwal untuk kelas ini.</p>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {schedule.courseCode} - {schedule.courseName}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {dayLabels[schedule.dayOfWeek] ?? `Hari ${schedule.dayOfWeek}`} |
                      {schedule.startTime} - {schedule.endTime} | Ruang: {schedule.room ?? '-'}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    Aktif
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
