import { useState } from 'react';
import { getGradesByClass, submitGrades } from '../lib/api';
import type { GradeItem, GradeInput } from '../lib/types';

/**
 * Input nilai dosen (T3.7 + T3.8, perm grade.input) — daftar mahasiswa per kelas,
 * input skor tugas/UTS/UAS + remedial per komponen. Final = max(asli, remedial)
 * per komponen (bobot 20/30/50) — sinkron dengan backend grades (T3.6).
 * Terhubung ke endpoint /grades/class/:classId dan /grades.
 */
export function DosenGrades() {
  const [classId, setClassId] = useState<number | null>(null);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [scores, setScores] = useState<Record<number, { tugas: string; uts: string; uas: string }>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load grades when classId changes
  const loadGrades = async (clsId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getGradesByClass(clsId);
      setGrades(res.items);
      setScores(
        Object.fromEntries(
          res.items.map((g) => [
            g.id,
            {
              tugas: g.tugasScore?.toString() ?? '',
              uts: g.utsScore?.toString() ?? '',
              uas: g.uasScore?.toString() ?? '',
            },
          ]),
        ),
      );
    } catch {
      setError('Gagal memuat data nilai');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectClass = (clsId: string) => {
    const id = clsId ? Number(clsId) : null;
    setClassId(id);
    setError(null);
    setSuccess(null);
    if (id) {
      loadGrades(id);
    } else {
      setGrades([]);
      setScores({});
    }
  };

  const handleScoreChange = (gradeId: number, field: 'tugas' | 'uts' | 'uas', value: string) => {
    setScores((prev) => ({ ...prev, [gradeId]: { ...prev[gradeId], [field]: value } }));
  };

  /** Final = max(asli, remedial) per komponen, bobot tugas 20% / UTS 30% / UAS 50%. */
  function computeFinal(
    grade: GradeItem,
    edit: { tugas: string; uts: string; uas: string },
  ): number | null {
    const toNum = (v: string): number | null => (v === '' ? null : Number(v));
    const tugas = Math.max(
      toNum(edit.tugas) ?? grade.tugasScore ?? 0,
      grade.remedialTugasScore ?? 0,
    );
    const uts = Math.max(toNum(edit.uts) ?? grade.utsScore ?? 0, grade.remedialUtsScore ?? 0);
    const uas = Math.max(toNum(edit.uas) ?? grade.uasScore ?? 0, grade.remedialUasScore ?? 0);
    if (tugas === 0 && uts === 0 && uas === 0) return null;
    return Math.round((tugas * 0.2 + uts * 0.3 + uas * 0.5) * 10) / 10;
  }

  const handleSubmit = async () => {
    if (!classId) {
      setError('Pilih mata kuliah terlebih dahulu');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      for (const grade of grades) {
        const edit = scores[grade.id] ?? { tugas: '', uts: '', uas: '' };
        const input: GradeInput = {
          krsItemId: grade.krsItemId,
          tugasScore: edit.tugas === '' ? grade.tugasScore : Number(edit.tugas) || null,
          utsScore: edit.uts === '' ? grade.utsScore : Number(edit.uts) || null,
          uasScore: edit.uas === '' ? grade.uasScore : Number(edit.uas) || null,
          remedialTugasScore: grade.remedialTugasScore,
          remedialUtsScore: grade.remedialUtsScore,
          remedialUasScore: grade.remedialUasScore,
        };
        await submitGrades(input);
      }
      setSuccess('Nilai berhasil disimpan');
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else {
        setError('Gagal menyimpan nilai');
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mata Kuliah / Kelas
          </label>
          <select
            value={classId ?? ''}
            onChange={(e) => handleSelectClass(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Pilih Mata Kuliah</option>
            {classOptions.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} - {cls.name}
              </option>
            ))}
          </select>
        </div>

        {/* Grades Table */}
        {classId && grades.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">NIM</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Nama</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Tugas (20%)</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">UTS (30%)</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">UAS (50%)</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">
                    Remedial Tugas
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Remedial UTS</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Remedial UAS</th>
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
                      {(
                        ['remedialTugasScore', 'remedialUtsScore', 'remedialUasScore'] as const
                      ).map((field) => (
                        <td key={field} className="px-4 py-3 text-center text-sm text-gray-600">
                          {grade[field] !== null ? grade[field] : '-'}
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

        {classId && grades.length === 0 && !isLoading && (
          <p className="mt-6 text-gray-500">Belum ada mahasiswa terdaftar di kelas ini.</p>
        )}

        {/* Submit Button */}
        {classId && grades.length > 0 && (
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
