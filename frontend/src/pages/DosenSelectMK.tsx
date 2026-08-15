import { useState, useEffect, useRef, useMemo } from 'react';
import { getAvailableCourses, submitCourseSelection, getDosenSemesters } from '../lib/api';
import type { LecturerCourseAvailable, SemesterOption } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

type ViewMode = 'grid' | 'list';

const SELECTABLE_STATUS = 'belum_diajukan';

const statusColors: Record<string, string> = {
  belum_diajukan: 'bg-slate-100 text-slate-800',
  diajukan: 'bg-primary-100 text-primary-800',
  disetujui: 'bg-green-100 text-green-800',
  ditolak: 'bg-red-100 text-red-800',
};

function statusLabel(status: string): string {
  return status.replace('_', ' ');
}

/** Ikon grid (Heroicons outline). */
function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25A2.25 2.25 0 018.25 10.5H6A2.25 2.25 0 013.75 12.75V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 19.5v-3.75zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 19.5v-3.75z"
      />
    </svg>
  );
}

/** Ikon list (Heroicons outline). */
function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

/**
 * Pilih MK (T3.7 + T3.8 + T3.9, perm lecturer.select_course) — filter prodi + cari MK (typeahead 3 huruf).
 * Terhubung ke endpoint /dosen/courses/available dan /dosen/courses/select.
 * Semester diambil dari GET /dosen/semesters (semua semester aktif, tidak bergantung pada periode KRS).
 *
 * Fitur UI: toggle tampilan grid/list (ikon kanan-atas), MK dengan status selain
 * "belum_diajukan" tidak bisa dipilih ulang, dan daftar MK yang sudah diajukan ditampilkan
 * di bagian bawah grid/list.
 */
export function DosenSelectMK() {
  const [semesterId, setSemesterId] = useState<number | null>(null);
  const [semesterOptions, setSemesterOptions] = useState<SemesterOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [courses, setCourses] = useState<LecturerCourseAvailable[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Muat daftar semester aktif → set default ke yang terbaru
  useEffect(() => {
    getDosenSemesters()
      .then((res) => {
        setSemesterOptions(res);
        if (res.length > 0) {
          const latest = res[0];
          setSemesterId(latest.id);
        }
      })
      .catch(() => {
        setError('Gagal memuat daftar semester');
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

  // Pisahkan MK yang masih bisa dipilih vs yang sudah diajukan (akibat filter search/local)
  const selectableCourses = useMemo(
    () => courses.filter((c) => c.selection_status === SELECTABLE_STATUS),
    [courses],
  );
  const submittedCourses = useMemo(
    () => courses.filter((c) => c.selection_status !== SELECTABLE_STATUS),
    [courses],
  );

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

  const renderCourseCard = (course: LecturerCourseAvailable) => {
    const isSelected = selectedCourseIds.has(course.curriculum_id);
    const isDisabled = course.selection_status !== SELECTABLE_STATUS;
    return (
      <div
        key={course.curriculum_id}
        className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
      >
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-semibold text-slate-900">{course.course_name}</h4>
          <span className="text-sm text-slate-500">{course.course_code}</span>
        </div>
        <p className="text-sm text-slate-600 mb-1">Semester: {course.semester_number}</p>
        <p className="text-sm text-slate-600 mb-2">SKS: {course.credits}</p>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-slate-600">Kelas tersedia: {course.available_classes}</span>
          <span
            className={`text-xs px-2 py-1 rounded-full ${statusColors[course.selection_status] ?? 'bg-slate-100 text-slate-800'}`}
          >
            {statusLabel(course.selection_status)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <label
            className={`flex items-center space-x-2 ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isDisabled}
              onChange={() => toggleSelect(course.curriculum_id)}
              className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500 disabled:opacity-50"
            />
            <span className="text-sm text-slate-700">
              {isDisabled ? 'Sudah diajukan' : isSelected ? 'Dipilih' : 'Pilih'}
            </span>
          </label>
        </div>
      </div>
    );
  };

  const renderCourseRow = (course: LecturerCourseAvailable) => {
    const isSelected = selectedCourseIds.has(course.curriculum_id);
    const isDisabled = course.selection_status !== SELECTABLE_STATUS;
    return (
      <div
        key={course.curriculum_id}
        className="flex items-center justify-between gap-4 border border-slate-200 rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{course.course_name}</span>
            <span className="text-sm text-slate-500">{course.course_code}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${statusColors[course.selection_status] ?? 'bg-slate-100 text-slate-800'}`}
            >
              {statusLabel(course.selection_status)}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Semester {course.semester_number} · SKS {course.credits} · Kelas tersedia:{' '}
            {course.available_classes}
          </p>
        </div>
        <label
          className={`flex items-center space-x-2 shrink-0 ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          <input
            type="checkbox"
            checked={isSelected}
            disabled={isDisabled}
            onChange={() => toggleSelect(course.curriculum_id)}
            className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500 disabled:opacity-50"
          />
          <span className="text-sm text-slate-700">
            {isDisabled ? 'Sudah diajukan' : isSelected ? 'Dipilih' : 'Pilih'}
          </span>
        </label>
      </div>
    );
  };

  const renderCourseList = (list: LecturerCourseAvailable[]) =>
    viewMode === 'grid' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((course) => renderCourseCard(course))}
      </div>
    ) : (
      <div className="space-y-2">{list.map((course) => renderCourseRow(course))}</div>
    );

  const toggleButtonClass = (mode: ViewMode) =>
    `p-2 rounded-md border transition-colors ${
      viewMode === mode
        ? 'border-primary-500 bg-primary-50 text-primary-600'
        : 'border-slate-300 text-slate-500 hover:bg-slate-100'
    }`;

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
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-slate-900">Mata Kuliah Tersedia</h3>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Pilih tampilan grid atau list"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={toggleButtonClass('grid')}
              aria-pressed={viewMode === 'grid'}
              aria-label="Tampilan grid"
              title="Tampilan grid"
            >
              <GridIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={toggleButtonClass('list')}
              aria-pressed={viewMode === 'list'}
              aria-label="Tampilan list"
              title="Tampilan list"
            >
              <ListIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

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
          <>
            {selectableCourses.length === 0 ? (
              <p className="text-slate-500">
                {debouncedSearch
                  ? 'Tidak ada mata kuliah yang sesuai dengan pencarian.'
                  : 'Semua mata kuliah di semester ini sudah diajukan.'}
              </p>
            ) : (
              renderCourseList(selectableCourses)
            )}

            {/* Daftar MK yang sudah diajukan → di bawah grid/list, tidak bisa dipilih lagi */}
            {submittedCourses.length > 0 && (
              <div className="mt-8 border-t border-slate-200 pt-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">
                  Mata Kuliah Sudah Diajukan ({submittedCourses.length})
                </h4>
                <div
                  className={
                    viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-2'
                  }
                >
                  {submittedCourses.map((course) =>
                    viewMode === 'grid' ? (
                      <div
                        key={course.curriculum_id}
                        className="border border-slate-200 rounded-lg p-4 bg-slate-50"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h5 className="font-semibold text-slate-900">{course.course_name}</h5>
                          <span className="text-sm text-slate-500">{course.course_code}</span>
                        </div>
                        <p className="text-sm text-slate-600 mb-1">
                          Semester: {course.semester_number}
                        </p>
                        <p className="text-sm text-slate-600 mb-2">SKS: {course.credits}</p>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${statusColors[course.selection_status] ?? 'bg-slate-100 text-slate-800'}`}
                        >
                          {statusLabel(course.selection_status)}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={course.curriculum_id}
                        className="flex items-center justify-between gap-4 border border-slate-200 rounded-lg px-4 py-3 bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900">
                              {course.course_name}
                            </span>
                            <span className="text-sm text-slate-500">{course.course_code}</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${statusColors[course.selection_status] ?? 'bg-slate-100 text-slate-800'}`}
                            >
                              {statusLabel(course.selection_status)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            Semester {course.semester_number} · SKS {course.credits} · Kelas
                            tersedia: {course.available_classes}
                          </p>
                        </div>
                        <span className="text-sm text-slate-400 shrink-0">Sudah diajukan</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </>
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
