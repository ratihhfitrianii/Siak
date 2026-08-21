import { useState, useEffect, useCallback, useMemo } from 'react';
import { getGradesByClass, submitGrades, updateGrade, getMyClasses } from '../lib/api';
import type { GradeClassItem, GradeInput, MyClass } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/** Baris nilai + kode kelas asal (hasil penggabungan kelas paralel satu MK). */
type GradeRow = GradeClassItem & { classCode: string };

/** Opsi dropdown = satu PENAWARAN MK: courseCode + semester yang sama (kelas paralel digabung). */
interface CourseGroup {
  key: string;
  name: string;
  code: string;
  semesterId: number;
  semesterName: string;
}

/**
 * Input nilai dosen (T3.7 + T3.8, perm grade.input) — daftar mahasiswa per PENAWARAN mata kuliah:
 * kelas paralel (A/B/…) dengan courseCode DAN semester yang sama digabung dalam satu tabel
 * (kolom "Kelas" membedakan seksi). Penawaran semester berbeda TIDAK digabung — mahasiswa
 * mengulang MK di semester lain punya baris nilai sendiri (bug fix: duplikat NIM).
 * Final = max(asli, remedial) per komponen (bobot 20/30/50) — sinkron dengan backend grades (T3.6).
 * Kelas diampu dari GET /dosen/my-classes; nilai dari GET /grades/class/:classId per kelas.
 */
export function DosenGrades() {
  const [selectedGroup, setSelectedGroup] = useState<CourseGroup | null>(null);
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
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

  // Satu opsi per courseCode+semester — paralel (A/B) digabung, antar-semester terpisah
  const courseOptions = useMemo<CourseGroup[]>(() => {
    const seen = new Map<string, CourseGroup>();
    for (const cls of classes) {
      const key = `${cls.courseCode}#${cls.semesterId}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          name: cls.courseName,
          code: cls.courseCode,
          semesterId: cls.semesterId,
          semesterName: cls.semesterName || `Semester ${cls.semesterId}`,
        });
      }
    }
    return [...seen.values()];
  }, [classes]);

  // Load grades SEMUA kelas paralel dalam penawaran terpilih, digabung jadi satu daftar
  const loadGrades = useCallback(
    async (group: CourseGroup) => {
      const targets = classes.filter(
        (c) => c.courseCode === group.code && c.semesterId === group.semesterId,
      );
      if (targets.length === 0) return;
      setIsLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          targets.map(async (cls) => {
            const res = await getGradesByClass(cls.id);
            return res.items.map((g) => ({ ...g, classCode: cls.classCode }));
          }),
        );
        const items = results.flat();
        setGrades(items);
        setScores(
          Object.fromEntries(
            items.map((g) => [
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
    },
    [classes],
  );

  const handleSelectCourse = (key: string) => {
    const group = courseOptions.find((g) => g.key === key) ?? null;
    setSelectedGroup(group);
    setError(null);
    setSuccess(null);
    setGrades([]);
    setScores({});
    if (group) {
      void loadGrades(group);
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
    if (!selectedGroup) {
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
      if (selectedGroup) {
        await loadGrades(selectedGroup);
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

  // Kelas paralel dalam penawaran terpilih (untuk info baris di bawah dropdown)
  const mergedClasses = selectedGroup
    ? classes.filter(
        (c) => c.courseCode === selectedGroup.code && c.semesterId === selectedGroup.semesterId,
      )
    : [];

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
          <label
            htmlFor="grade-course-select"
            className="block text-sm font-medium text-slate-700 mb-2"
          >
            Mata Kuliah / Kelas
          </label>
          <select
            id="grade-course-select"
            value={selectedGroup?.key ?? ''}
            onChange={(e) => handleSelectCourse(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Pilih Mata Kuliah</option>
            {courseOptions.map((course) => (
              <option key={course.key} value={course.key}>
                {course.name} ({course.code}) — {course.semesterName}
              </option>
            ))}
          </select>
          {selectedGroup && mergedClasses.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Menampilkan {mergedClasses.length} kelas digabung:{' '}
              {mergedClasses.map((c) => c.classCode).join(', ')}
            </p>
          )}
        </div>

        {/* Grades Table */}
        {selectedGroup && grades.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">NIM</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Nama</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Kelas</th>
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
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {grade.classCode}
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

        {selectedGroup && grades.length === 0 && !isLoading && (
          <p className="mt-6 text-slate-500">Belum ada mahasiswa terdaftar di mata kuliah ini.</p>
        )}

        {/* Submit Button */}
        {selectedGroup && grades.length > 0 && (
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
