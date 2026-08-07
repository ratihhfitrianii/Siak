import { useState } from 'react';

interface CourseOption {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  name: string;
  present: boolean;
}

/**
 * Input absensi (T3.7, perm attendance.input) — centang mahasiswa yang hadir.
 * UI saat ini memakai data statis; integrasi API menyusul.
 */
export function DosenAttendance() {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [attendanceDate, setAttendanceDate] = useState('');
  const [attendanceData, setAttendanceData] = useState<StudentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const courses: CourseOption[] = [
    { id: 'TI101', name: 'Dasar-Dasar Pemrograman' },
    { id: 'SI202', name: 'Basis Data' },
    { id: 'MNJ301', name: 'Manajemen Strategis' },
    { id: 'HKM401', name: 'Hukum Bisnis' },
    { id: 'KN102', name: 'Anatomi Tubuh Manusia' },
  ];

  const mockStudents: StudentRow[] = [
    { id: '2023110001', name: 'Budi Santoso', present: false },
    { id: '2023110002', name: 'Ani Wijaya', present: false },
    { id: '2023110003', name: 'Citra Dewi', present: false },
    { id: '2023110004', name: 'Eko Prasetyo', present: false },
    { id: '2023110005', name: 'Fitriani', present: false },
  ];

  const toggleStudentAttendance = (studentId: string) => {
    setAttendanceData((prev) =>
      prev.map((student) =>
        student.id === studentId ? { ...student, present: !student.present } : student,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!selectedCourse || !attendanceDate) {
      setError('Pilih mata kuliah dan tanggal absensi terlebih dahulu');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Integrasi API: POST absensi (lib/api) pada iterasi berikutnya.
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSuccess('Absensi berhasil disimpan');
      setSelectedCourse('');
      setAttendanceDate('');
      setAttendanceData([]);
    } catch {
      setError('Gagal menyimpan absensi');
    } finally {
      setIsLoading(false);
    }
  };

  const presentCount = attendanceData.filter((s) => s.present).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Absensi</h2>
        <p className="text-gray-600">
          Input kehadiran mahasiswa untuk pertemuan tertentu. Centang mahasiswa yang hadir.
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Form Absensi</h3>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mata Kuliah</label>
            <select
              value={selectedCourse}
              onChange={(e) => {
                setSelectedCourse(e.target.value);
                if (e.target.value) {
                  setAttendanceData(mockStudents.map((s) => ({ ...s, present: false })));
                }
              }}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tanggal Pertemuan
            </label>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Attendance List */}
        {selectedCourse && attendanceData.length > 0 && (
          <div className="mt-6">
            <h4 className="font-medium text-gray-900 mb-4">Daftar Mahasiswa</h4>
            <div className="space-y-2">
              {attendanceData.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id={student.id}
                      checked={student.present}
                      onChange={() => toggleStudentAttendance(student.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={student.id} className="text-sm font-medium text-gray-700">
                      {student.name}
                    </label>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      student.present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {student.present ? 'Hadir' : 'Tidak Hadir'}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Total Mahasiswa: {attendanceData.length} | Hadir: {presentCount} | Tidak Hadir:{' '}
                {attendanceData.length - presentCount}
              </p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isLoading || !selectedCourse || !attendanceDate}
            className="px-6 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Simpan Absensi'}
          </button>
        </div>
      </div>
    </div>
  );
}
