import { useState } from 'react';

interface CourseOption {
  id: string;
  name: string;
}

interface GuidanceTypeOption {
  id: string;
  name: string;
}

/**
 * Bimbingan akademik (T3.7, perm guidance.manage untuk dosen Wali).
 * UI saat ini memakai data statis; integrasi API menyusul.
 */
export function DosenGuidance() {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [guidanceDate, setGuidanceDate] = useState('');
  const [guidanceType, setGuidanceType] = useState('');
  const [description, setDescription] = useState('');
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

  const guidanceTypes: GuidanceTypeOption[] = [
    { id: 'konsultasi', name: 'Konsultasi Akademik' },
    { id: 'tugas', name: 'Bimbingan Tugas Akhir' },
    { id: 'skripsi', name: 'Pembimbing Skripsi' },
    { id: 'proposal', name: 'Bimbingan Proposal' },
  ];

  const handleSubmit = async () => {
    if (!selectedCourse || !guidanceDate || !guidanceType || !description.trim()) {
      setError('Lengkapi semua field bimbingan');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Integrasi API: POST bimbingan (lib/api) pada iterasi berikutnya.
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSuccess('Catatan bimbingan berhasil disimpan');
      setSelectedCourse('');
      setGuidanceDate('');
      setGuidanceType('');
      setDescription('');
    } catch {
      setError('Gagal menyimpan catatan bimbingan');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCourseName = courses.find((c) => c.id === selectedCourse)?.name;
  const selectedTypeName = guidanceTypes.find((t) => t.id === guidanceType)?.name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Bimbingan</h2>
        <p className="text-gray-600">
          Input catatan bimbingan akademik untuk mahasiswa. Catat tanggal, jenis bimbingan, dan
          deskripsi.
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Form Bimbingan</h3>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tanggal Bimbingan
              </label>
              <input
                type="date"
                value={guidanceDate}
                onChange={(e) => setGuidanceDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jenis Bimbingan</label>
            <select
              value={guidanceType}
              onChange={(e) => setGuidanceType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Pilih Jenis Bimbingan</option>
              {guidanceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Deskripsi</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Masukkan detail bimbingan..."
            />
          </div>
        </div>

        {/* Preview */}
        {selectedCourse && guidanceDate && guidanceType && description.trim() && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Pratinjau Bimbingan:</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <strong>Mata Kuliah:</strong> {selectedCourseName}
              </p>
              <p>
                <strong>Tanggal:</strong> {guidanceDate}
              </p>
              <p>
                <strong>Jenis:</strong> {selectedTypeName}
              </p>
              <p>
                <strong>Deskripsi:</strong> {description}
              </p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={
              isLoading || !selectedCourse || !guidanceDate || !guidanceType || !description.trim()
            }
            className="px-6 py-2 bg-purple-500 text-white font-medium rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Simpan Bimbingan'}
          </button>
        </div>
      </div>
    </div>
  );
}
