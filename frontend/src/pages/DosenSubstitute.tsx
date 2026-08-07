import { useState } from 'react';

interface CourseOption {
  id: string;
  name: string;
  class: string;
}

interface SubstituteTypeOption {
  id: string;
  name: string;
}

/**
 * Substitute teaching (T3.7, perm substitute.manage) — ajukan dosen pengganti.
 * UI saat ini memakai data statis; integrasi API menyusul.
 */
export function DosenSubstitute() {
  const [substituteType, setSubstituteType] = useState('');
  const [substituteDate, setSubstituteDate] = useState('');
  const [originalCourse, setOriginalCourse] = useState('');
  const [replaceCourse, setReplaceCourse] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const courses: CourseOption[] = [
    { id: 'TI101', name: 'Dasar-Dasar Pemrograman', class: 'A' },
    { id: 'SI202', name: 'Basis Data', class: 'C' },
    { id: 'MNJ301', name: 'Manajemen Strategis', class: 'B' },
    { id: 'HKM401', name: 'Hukum Bisnis', class: 'A' },
    { id: 'KN102', name: 'Anatomi Tubuh Manusia', class: 'D' },
  ];

  const substituteTypes: SubstituteTypeOption[] = [
    { id: 'penjadwalan', name: 'Penjadwalan Ulang' },
    { id: 'pencarian', name: 'Pencarian Dosen Pengganti' },
    { id: 'konfirmasi', name: 'Konfirmasi Penggantian' },
  ];

  const handleSubmit = async () => {
    if (
      !substituteType ||
      !substituteDate ||
      !originalCourse ||
      !replaceCourse ||
      !description.trim()
    ) {
      setError('Lengkapi semua field pengganti');
      return;
    }

    if (originalCourse === replaceCourse) {
      setError('Mata kuliah pengganti tidak boleh sama dengan mata kuliah asli');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Integrasi API: POST substitute (lib/api) pada iterasi berikutnya.
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSuccess('Permintaan pengganti berhasil dikirim');
      setSubstituteType('');
      setSubstituteDate('');
      setOriginalCourse('');
      setReplaceCourse('');
      setDescription('');
    } catch {
      setError('Gagal mengirim permintaan pengganti');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Substitute Dosen</h2>
        <p className="text-gray-600">
          Input permintaan penggantian dosen untuk mata kuliah tertentu. Ajukan permintaan pengganti
          atau jadwalkan ulang.
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Form Substitute</h3>
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jenis Substitute
              </label>
              <select
                value={substituteType}
                onChange={(e) => setSubstituteType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Jenis Substitute</option>
                {substituteTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tanggal Substitute
              </label>
              <input
                type="date"
                value={substituteDate}
                onChange={(e) => setSubstituteDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mata Kuliah Asli
              </label>
              <select
                value={originalCourse}
                onChange={(e) => setOriginalCourse(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Mata Kuliah Asli</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.id} - {course.name} (Kelas {course.class})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mata Kuliah Pengganti
              </label>
              <select
                value={replaceCourse}
                onChange={(e) => setReplaceCourse(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Mata Kuliah Pengganti</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.id} - {course.name} (Kelas {course.class})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Deskripsi</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Masukkan detail permintaan pengganti..."
            />
          </div>
        </div>

        {/* Validation Warning */}
        {originalCourse === replaceCourse && originalCourse !== '' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              ⚠️ Mata kuliah pengganti tidak boleh sama dengan mata kuliah asli
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              !substituteType ||
              !substituteDate ||
              !originalCourse ||
              !replaceCourse ||
              !description.trim() ||
              originalCourse === replaceCourse
            }
            className="px-6 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Ajukan Permintaan Substitute'}
          </button>
        </div>
      </div>
    </div>
  );
}
