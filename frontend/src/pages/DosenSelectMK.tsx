import { useState } from 'react';

interface ProdiOption {
  id: string;
  name: string;
}

interface CourseOption {
  id: string;
  name: string;
  semester: string;
  credits: number;
  quota: number;
  enrolled: number;
  prodi: string;
}

/**
 * Pilih MK (T3.7, perm lecturer.select_course) — filter prodi + cari MK.
 * UI saat ini memakai data statis; integrasi API mengikuti pola AdminKrsPage
 * (lib/api + lib/types) pada iterasi berikutnya.
 */
export function DosenSelectMK() {
  const [selectedProdi, setSelectedProdi] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const prodiList: ProdiOption[] = [
    { id: 'ti', name: 'Teknik Informatika' },
    { id: 'si', name: 'Sistem Informasi' },
    { id: 'mnj', name: 'Manajemen' },
    { id: 'hkm', name: 'Hukum' },
    { id: 'kn', name: 'Kesehatan' },
  ];

  const mockCourses: CourseOption[] = [
    {
      id: 'TI101',
      name: 'Dasar-Dasar Pemrograman',
      semester: 'Ganjil 2024',
      credits: 3,
      quota: 40,
      enrolled: 35,
      prodi: 'ti',
    },
    {
      id: 'SI202',
      name: 'Basis Data',
      semester: 'Genap 2024',
      credits: 3,
      quota: 35,
      enrolled: 28,
      prodi: 'si',
    },
    {
      id: 'MNJ301',
      name: 'Manajemen Strategis',
      semester: 'Ganjil 2024',
      credits: 3,
      quota: 25,
      enrolled: 22,
      prodi: 'mnj',
    },
    {
      id: 'HKM401',
      name: 'Hukum Bisnis',
      semester: 'Genap 2024',
      credits: 3,
      quota: 30,
      enrolled: 27,
      prodi: 'hkm',
    },
    {
      id: 'KN102',
      name: 'Anatomi Tubuh Manusia',
      semester: 'Ganjil 2024',
      credits: 2,
      quota: 50,
      enrolled: 45,
      prodi: 'kn',
    },
  ];

  const filteredCourses = mockCourses.filter((course) => {
    const matchesProdi = selectedProdi === '' || course.prodi === selectedProdi;
    const matchesSearch =
      course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesProdi && matchesSearch;
  });

  const handleSubmit = async () => {
    if (!selectedProdi) {
      setError('Pilih prodi terlebih dahulu');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Integrasi API: POST pilih MK (lib/api) pada iterasi berikutnya.
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSuccess('MK berhasil dipilih');
      setSelectedProdi('');
    } catch {
      setError('Gagal memilih MK');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pilih Mata Kuliah</h2>
        <p className="text-gray-600">
          Pilih prodi dan pilih mata kuliah yang akan diajar. Sistem akan menampilkan kuota dan
          jumlah mahasiswa yang sudah terdaftar.
        </p>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Filter &amp; Search</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prodi</label>
            <select
              value={selectedProdi}
              onChange={(e) => setSelectedProdi(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Prodi</option>
              {prodiList.map((prodi) => (
                <option key={prodi.id} value={prodi.id}>
                  {prodi.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Cari Mata Kuliah</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari berdasarkan nama atau ID MK"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Mata Kuliah Tersedia</h3>
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
        {filteredCourses.length === 0 ? (
          <p className="text-gray-500">Tidak ada mata kuliah yang sesuai dengan filter.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCourses.map((course) => (
              <div
                key={course.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-gray-900">{course.name}</h4>
                  <span className="text-sm text-gray-500">{course.id}</span>
                </div>
                <p className="text-sm text-gray-600 mb-1">Semester: {course.semester}</p>
                <p className="text-sm text-gray-600 mb-2">SKS: {course.credits}</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    Kuota: {course.enrolled}/{course.quota}
                  </span>
                  <button
                    onClick={() => setSelectedProdi(course.prodi)}
                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                  >
                    Pilih
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isLoading || !selectedProdi}
            className="px-6 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Pilih Mata Kuliah'}
          </button>
        </div>
      </div>
    </div>
  );
}
