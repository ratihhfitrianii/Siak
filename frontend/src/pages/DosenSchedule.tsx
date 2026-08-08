import { useState, useEffect, useCallback } from 'react';
import { getScheduleAvailability } from '../lib/api';
import type { ScheduleAvailability } from '../lib/types';

/**
 * Jadwal mengajar dosen (T3.7 + T3.8, perm schedule.manage — view only).
 * Sesuai desain DL-08: admin akademik mengelola jadwal; dosen melihat jadwal
 * pertemuan & ketersediaan slot (GET /schedule/availability?date=YYYY-MM-DD).
 */
export function DosenSchedule() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [availability, setAvailability] = useState<ScheduleAvailability | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getScheduleAvailability(d);
      setAvailability(res);
    } catch (_err) {
      setError('Gagal memuat ketersediaan jadwal');
      setAvailability(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Jadwal Mengajar</h2>
        <p className="text-gray-600">
          Lihat jadwal pertemuan dan ketersediaan slot mengajar. Sesuai desain (DL-08), jadwal
          dikelola admin akademik — dosen memeriksa kesediaan slot per tanggal.
        </p>
      </div>

      {/* Date picker */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Ketersediaan per Tanggal</h3>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
          >
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="mt-4 text-gray-500">Memuat jadwal...</p>
        ) : availability ? (
          <div className="mt-6 space-y-8">
            {/* Busy slots */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">
                Jadwal Pertemuan ({dayNames[availability.dayOfWeek] ?? '-'}, {availability.date})
              </h4>
              {availability.busySlots.length === 0 ? (
                <p className="text-gray-500">Tidak ada jadwal pertemuan pada tanggal ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Pertemuan</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Kelas</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">
                          Mata Kuliah
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Topik</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {availability.busySlots.map((slot) => (
                        <tr key={slot.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                            {slot.meetingNumber}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                            {slot.classCode}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {slot.courseCode} — {slot.courseName}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{slot.topic ?? '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                slot.isCompleted
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {slot.isCompleted ? 'Selesai' : 'Terjadwal'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Available slots */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Slot Kosong (belum terjadwal)</h4>
              {availability.availableSlots.length === 0 ? (
                <p className="text-gray-500">
                  Tidak ada slot kosong — seluruh kelas sudah terjadwal pada tanggal ini.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Kelas</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">
                          Mata Kuliah
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Jam</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-700">
                          Semester
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {availability.availableSlots.map((slot) => (
                        <tr key={slot.classId}>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                            {slot.classCode}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {slot.courseCode} — {slot.courseName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                            {slot.startTime ?? '-'} – {slot.endTime ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            {slot.semesterNumber}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
