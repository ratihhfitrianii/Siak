import { useState } from 'react';

interface CourseOption {
  id: string;
  name: string;
  class: string;
  room: string;
}

/**
 * Jadwal mengajar dosen (T3.7, perm lecturer.availability).
 * UI saat ini memakai data statis; integrasi API menyusul.
 */
export function DosenSchedule() {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const courses: CourseOption[] = [
    { id: 'TI101', name: 'Dasar-Dasar Pemrograman', class: 'A', room: 'R101' },
    { id: 'SI202', name: 'Basis Data', class: 'C', room: 'R203' },
    { id: 'MNJ301', name: 'Manajemen Strategis', class: 'B', room: 'R305' },
    { id: 'HKM401', name: 'Hukum Bisnis', class: 'A', room: 'R407' },
    { id: 'KN102', name: 'Anatomi Tubuh Manusia', class: 'D', room: 'R109' },
  ];

  const scheduleData = selectedCourse
    ? (courses.find((c) => c.id === selectedCourse) ?? null)
    : null;

  const handleSubmit = async () => {
    if (!selectedDate || !selectedCourse) {
      setError('Pilih tanggal dan mata kuliah terlebih dahulu');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Integrasi API: POST jadwal (lib/api) pada iterasi berikutnya.
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSuccess('Jadwal berhasil disimpan');
      setSelectedDate('');
      setSelectedCourse('');
    } catch {
      setError('Gagal menyimpan jadwal');
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Mengajar</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mata Kuliah</label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Pilih Mata Kuliah</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.id} - {course.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Schedule Preview */}
        {scheduleData && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Pratinjau Jadwal:</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <strong>Mata Kuliah:</strong> {scheduleData.id} - {scheduleData.name}
              </p>
              <p>
                <strong>Kelas:</strong> {scheduleData.class}
              </p>
              <p>
                <strong>Ruang:</strong> {scheduleData.room}
              </p>
              <p>
                <strong>Tanggal:</strong> {selectedDate}
              </p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isLoading || !selectedDate || !selectedCourse}
            className="px-6 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Simpan Jadwal'}
          </button>
        </div>
      </div>

      {/* Existing Schedule List */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Jadwal yang Sudah Ada</h3>
        <div className="space-y-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900">
                    {course.id} - {course.name}
                  </h4>
                  <p className="text-sm text-gray-600">
                    Kelas: {course.class} | Ruang: {course.room}
                  </p>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  Aktif
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
