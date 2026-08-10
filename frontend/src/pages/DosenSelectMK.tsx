import { useState, useEffect, useRef } from 'react';
import { getAvailableCourses, submitCourseSelection, getKrsPeriod } from '../lib/api';
import type { LecturerCourseAvailable } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Pilih MK (T3.7 + T3.8, perm lecturer.select_course) — filter prodi + cari MK (typeahead 3 huruf).
 * Terhubung ke endpoint /dosen/courses/available dan /dosen/courses/select.
 * Semester aktif diambil dari GET /krs/period (periode KRS berjalan).
 */
export function DosenSelectMK() {
  const [semesterId, setSemesterId] = useState<number | null>(null);
  const [semesterLabel, setSemesterLabel] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [courses, setCourses] = useState<LecturerCourseAvailable[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number>>(new Set());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Muat periode KRS aktif → set semester default
  useEffect(() => {
    getKrsPeriod()
      .then((period) => {
        if (period.status === 'open') {
          setSemesterId(period.semesterId);
          setSemesterLabel(`${period.semesterCode} (${period.name})`);
        } else {
          setError('Tidak ada periode KRS yang sedang buka');
        }
      })
      .catch(() => {
        setError('Gagal memuat periode aktif');
      });
  }, []);

  // Debounced search - trigger API call after 300ms
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Load available courses when semester OR debounced search changes
  useEffect(() => {
    if (!semesterId) {
      setCourses([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    getAvailableCourses(semesterId, debouncedSearch || undefined)
      .then((res) => {
        setCourses(res.items);
      })
      .catch(() => {
        setError('Gagal memuat daftar MK');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [semesterId, debouncedSearch]);

  const toggleSelect = (curriculumId: number) => {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(curriculumId)) {
        next.delete(curriculumId);
      } else {
        next.add(curriculumId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!semesterId) {
      setError('Pilih semester terlebih dahulu');
      return;
    }
    if (selectedCourseIds.size === 0) {
      setError('Pilih minimal satu MK');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      for (const curriculumId of selectedCourseIds) {
        await submitCourseSelection({
          curriculumId,
          priority: 1,
          notes: '',
        });
      }
      setSuccess(`${selectedCourseIds.size} MK berhasil diajukan`);
      setSelectedCourseIds(new Set());
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else {
        setError('Gagal mengajukan MK');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Semester aktif — dari GET /krs/period (periode KRS berjalan)
  const semesterOptions = semesterId
    ? [{ id: semesterId, name: semesterLabel || 'Semester Aktif' }]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Pilih Mata Kuliah</h2>
        <p className="text-slate-600">
          Pilih semester dan ajukan mata kuliah yang akan diajar. Status: belum_diajukan → diajukan
          → disetujui/ditolak.
        </p>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Filter & Search</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Semester</label>
            <select
              value={semesterId ?? ''}
              onChange={(e) => setSemesterId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Pilih Semester</option>
              {semesterOptions.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cari Mata Kuliah
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari berdasarkan nama atau kode MK"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Mata Kuliah Tersedia</h3>
        {error && <FormAlert>{error}</FormAlert>}
        {success && (
          <p
            role="status"
            className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
          >
            {success}
          </p>
        )}
        {!semesterId ? (
          <p className="text-slate-500">Pilih semester untuk menampilkan daftar MK.</p>
        ) : isLoading ? (
          <p className="text-slate-500">Memuat daftar MK...</p>
        ) : courses.length === 0 ? (
          <p className="text-slate-500">
            {debouncedSearch
              ? 'Tidak ada mata kuliah yang sesuai dengan pencarian.'
              : 'Tidak ada mata kuliah tersedia untuk prodi Anda di semester ini.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courses.map((course) => {
              const isSelected = selectedCourseIds.has(course.curriculumId);
              const statusColors: Record<string, string> = {
                belum_diajukan: 'bg-slate-100 text-slate-800',
                diajukan: 'bg-primary-100 text-primary-800',
                disetujui: 'bg-green-100 text-green-800',
                ditolak: 'bg-red-100 text-red-800',
              };
              return (
                <div
                  key={course.curriculumId}
                  className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-slate-900">{course.courseName}</h4>
                    <span className="text-sm text-slate-500">{course.courseCode}</span>
                  </div>
                  <p className="text-sm text-slate-600 mb-1">Semester: {course.semesterNumber}</p>
                  <p className="text-sm text-slate-600 mb-2">SKS: {course.credits}</p>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-600">
                      Kelas tersedia: {course.availableClasses}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${statusColors[course.selectionStatus] ?? 'bg-slate-100 text-slate-800'}`}
                    >
                      {course.selectionStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(course.curriculumId)}
                        className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-slate-700">
                        {isSelected ? 'Dipilih' : 'Pilih'}
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || selectedCourseIds.size === 0 || !semesterId}
            className="px-6 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : `Ajukan ${selectedCourseIds.size} MK`}
          </button>
        </div>
      </div>
    </div>
  );
}
