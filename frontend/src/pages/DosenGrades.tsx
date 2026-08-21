import { useState, useEffect, useCallback } from 'react';
import { getGradesByClass, submitGrades, updateGrade, getMyClasses } from '../lib/api';
import type { GradeClassItem, GradeInput, MyClass } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Input nilai dosen (T3.7 + T3.8, perm grade.input) — daftar mahasiswa per kelas,
 * input skor tugas/UTS/UAS + remedial per komponen. Final = max(asli, remedial)
 * per komponen (bobot 20/30/50) — sinkron dengan backend grades (T3.6).
 * Kelas diampu dari GET /dosen/my-classes; nilai dari GET /grades/class/:classId.
 */
export function DosenGrades() {
  const [classId, setClassId] = useState<number | null>(null);
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [grades, setGrades] = useState<GradeClassItem[]>([]);
  const [scores, setScores] = useState<Record<number, { tugas: string; uts: string; uas: string }>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load kelas yang diampu
  useEffect(() => {
    getMyClasses()
      .then((res) => setClasses(res.items))
      .catch(() => {
        /* dropdown tetap kosong */
      });
  }, []);

  // Load grades when classId changes
  const loadGrades = useCallback(async (clsId: number) => {
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
    } catch (_err) {
      setError('Gagal memuat data nilai');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    grade: GradeClassItem,
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
        // Grade sudah ada (memiliki id) → gunakan updateGrade (PUT), bukan submitGrades (POST)
        if (
          grade.id &&
          (grade.tugasScore !== null || grade.utsScore !== null || grade.uasScore !== null)
        ) {
          await updateGrade(grade.id, input);
        } else {
          await submitGrades(input);
        }
      }
      setSuccess('Nilai berhasil disimpan');
      if (classId) {
        await loadGrades(classId);
      }
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else if (apiError.code === 'CONFLICT') {
        setError('Nilai sudah ada — gunakan edit, bukan tambah baru');
      } else {
        setError('Gagal menyimpan nilai');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Kelas diampu — dari API nyata (getMyClasses)
  const classOptions = classes.map((cls) => ({
    id: cls.id,
    code: cls.classCode,
    name: `${cls.courseName} (${cls.courseCode})`,
  }));

  return (
    <div className="space-y-6">
      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Form Nilai</h3>
        {error && <FormAlert>{error}</FormAlert>}
        {success && (
          <p
            role="status"
            className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
          >
            {success}
          </p>
        )}

        <div className="max-w-md">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Mata Kuliah / Kelas
          </label>
          <select
            value={classId ?? ''}
            onChange={(e) => handleSelectClass(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
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
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">NIM</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Nama</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">Tugas (20%)</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">UTS (30%)</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">UAS (50%)</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">
                    Remedial Tugas
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">Remedial UTS</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">Remedial UAS</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">Nilai Akhir</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {grades.map((grade) => {
                  const edit = scores[grade.id] ?? { tugas: '', uts: '', uas: '' };
                  const finalScore = computeFinal(grade, edit);
                  return (
                    <tr key={grade.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {grade.student.nim}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-900">
                        {grade.student.name}
                      </td>
                      {(['tugas', 'uts', 'uas'] as const).map((field) => (
                        <td key={field} className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={edit[field]}
                            onChange={(e) => handleScoreChange(grade.id, field, e.target.value)}
                            className="w-20 px-2 py-1 text-center border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </td>
                      ))}
                      {(
                        ['remedialTugasScore', 'remedialUtsScore', 'remedialUasScore'] as const
                      ).map((field) => (
                        <td key={field} className="px-4 py-3 text-center text-sm text-slate-600">
                          {grade[field] !== null ? grade[field] : '-'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-semibold text-slate-900">
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
          <p className="mt-6 text-slate-500">Belum ada mahasiswa terdaftar di kelas ini.</p>
        )}

        {/* Submit Button */}
        {classId && grades.length > 0 && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-6 py-2 bg-indigo-500 text-white font-medium rounded-lg hover:bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Memproses...' : 'Simpan Nilai'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
