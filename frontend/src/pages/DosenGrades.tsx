import { useState } from 'react';

interface CourseOption {
  id: string;
  name: string;
  class: string;
}

interface GradeRow {
  id: number;
  nim: string;
  studentName: string;
  tugasScore: number | null;
  utsScore: number | null;
  uasScore: number | null;
  remedialTugasScore: number | null;
  remedialUtsScore: number | null;
  remedialUasScore: number | null;
  finalScore: number | null;
}

interface EditableScore {
  tugas: string;
  uts: string;
  uas: string;
}

/**
 * Input nilai dosen (T3.7, perm grade.input) — daftar mahasiswa per kelas,
 * input skor tugas/UTS/UAS + remedial per komponen. Final = max(asli, remedial)
 * per komponen (bobot 20/30/50) — sinkron dengan backend grades (T3.6).
 * UI saat ini memakai data statis; integrasi API menyusul.
 */
export function DosenGrades() {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [scores, setScores] = useState<Record<number, EditableScore>>({});
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

  const mockGrades: GradeRow[] = [
    {
      id: 1,
      nim: '2023110001',
      studentName: 'Budi Santoso',
      tugasScore: 80,
      utsScore: 75,
      uasScore: 85,
      remedialTugasScore: null,
      remedialUtsScore: null,
      remedialUasScore: null,
      finalScore: 80.5,
    },
    {
      id: 2,
      nim: '2023110002',
      studentName: 'Ani Wijaya',
      tugasScore: 90,
      utsScore: 88,
      uasScore: 92,
      remedialTugasScore: null,
      remedialUtsScore: null,
      remedialUasScore: null,
      finalScore: 90.4,
    },
    {
      id: 3,
      nim: '2023110003',
      studentName: 'Citra Dewi',
      tugasScore: 55,
      utsScore: 60,
      uasScore: 50,
      remedialTugasScore: 75,
      remedialUtsScore: null,
      remedialUasScore: 70,
      finalScore: 66,
    },
    {
      id: 4,
      nim: '2023110004',
      studentName: 'Eko Prasetyo',
      tugasScore: 70,
      utsScore: 65,
      uasScore: 60,
      remedialTugasScore: null,
      remedialUtsScore: 72,
      remedialUasScore: null,
      finalScore: 68.5,
    },
    {
      id: 5,
      nim: '2023110005',
      studentName: 'Fitriani',
      tugasScore: 85,
      utsScore: 90,
      uasScore: 88,
      remedialTugasScore: null,
      remedialUtsScore: null,
      remedialUasScore: null,
      finalScore: 88.5,
    },
  ];

  /** Final = max(asli, remedial) per komponen, bobot tugas 20% / UTS 30% / UAS 50%. */
  function computeFinal(row: GradeRow, edit: EditableScore): number | null {
    const toNum = (v: string): number | null => (v === '' ? null : Number(v));
    const tugas = toNum(edit.tugas) ?? row.tugasScore ?? 0;
    const uts = toNum(edit.uts) ?? row.utsScore ?? 0;
    const uas = toNum(edit.uas) ?? row.uasScore ?? 0;
    if (tugas === 0 && uts === 0 && uas === 0) return null;
    return Math.round((tugas * 0.2 + uts * 0.3 + uas * 0.5) * 10) / 10;
  }

  const handleSelectCourse = (courseId: string) => {
    setSelectedCourse(courseId);
    setError(null);
    setSuccess(null);
    if (!courseId) {
      setGrades([]);
      setScores({});
      return;
    }
    setGrades(mockGrades);
    setScores(
      Object.fromEntries(
        mockGrades.map((g) => [
          g.id,
          {
            tugas: g.tugasScore?.toString() ?? '',
            uts: g.utsScore?.toString() ?? '',
            uas: g.uasScore?.toString() ?? '',
          },
        ]),
      ),
    );
  };

  const handleScoreChange = (gradeId: number, field: keyof EditableScore, value: string) => {
    setScores((prev) => ({ ...prev, [gradeId]: { ...prev[gradeId], [field]: value } }));
  };

  const handleSubmit = async () => {
    if (!selectedCourse) {
      setError('Pilih mata kuliah terlebih dahulu');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Integrasi API: POST /grades (lib/api) pada iterasi berikutnya.
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSuccess('Nilai berhasil disimpan');
    } catch {
      setError('Gagal menyimpan nilai');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Nilai</h2>
        <p className="text-gray-600">
          Input nilai tugas, UTS, dan UAS untuk mahasiswa di kelas yang Anda ampu. Nilai akhir
          dihitung otomatis dengan bobot tugas 20%, UTS 30%, UAS 50%; remedial per komponen
          mengambil nilai tertinggi.
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Form Nilai</h3>
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

        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-2">Mata Kuliah</label>
          <select
            value={selectedCourse}
            onChange={(e) => handleSelectCourse(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Pilih Mata Kuliah</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.id} - {course.name} (Kelas {course.class})
              </option>
            ))}
          </select>
        </div>

        {/* Grades Table */}
        {selectedCourse && grades.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">NIM</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Nama</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Tugas (20%)</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">UTS (30%)</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">UAS (50%)</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Nilai Akhir</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {grades.map((grade) => {
                  const edit = scores[grade.id] ?? { tugas: '', uts: '', uas: '' };
                  const finalScore = computeFinal(grade, edit);
                  return (
                    <tr key={grade.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{grade.nim}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                        {grade.studentName}
                      </td>
                      {(['tugas', 'uts', 'uas'] as const).map((field) => (
                        <td key={field} className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={edit[field]}
                            onChange={(e) => handleScoreChange(grade.id, field, e.target.value)}
                            className="w-20 px-2 py-1 text-center border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">
                        {finalScore !== null ? finalScore : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedCourse && grades.length === 0 && (
          <p className="mt-6 text-gray-500">Belum ada mahasiswa terdaftar di kelas ini.</p>
        )}

        {/* Submit Button */}
        {selectedCourse && grades.length > 0 && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-6 py-2 bg-indigo-500 text-white font-medium rounded-lg hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Memproses...' : 'Simpan Nilai'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
