import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  listAdminClasses,
  createAdminClass,
  getAcademicCurricula,
  listRooms,
  listProdis,
  ApiError,
} from '../lib/api';
import type { AdminClass, Prodi, Room } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';
import { SearchableDropdown } from '../components/SearchableDropdown';
import { Spinner } from '../components/Spinner';

interface CurriculumOption {
  id: number;
  course_code: string;
  course_name: string;
  credits: number;
  semester_number: number;
  prodi_name: string;
}

const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

type SortKey =
  | 'classCode'
  | 'courseName'
  | 'prodiName'
  | 'dayOfWeek'
  | 'startTime'
  | 'room'
  | 'capacity'
  | 'lecturerName';

const DEFAULT_FORM = {
  prodiId: null as number | null,
  curriculumId: null as number | null,
  classCode: '',
  capacity: 30,
  room: null as string | null,
};

/**
 * Halaman Kelola Jadwal (Admin Akademik / Admin Sistem) — T3.2 (F-21, F-22)
 * - Daftar kelas (jadwal mengajar tetap: hari/jam/ruang/kapasitas) milik fakultas admin
 * - Tombol "Tambah Kelas" di atas daftar; fakultas otomatis dari akun admin akademik
 * - Ruangan dropdown: hanya ruangan aktif di fakultas admin, kapasitas belum penuh,
 *   dan tidak dipakai kelas lain di hari+jam yang sama
 * - permission: schedule.manage
 */
export function AdminSchedulePage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [prodis, setProdis] = useState<Prodi[]>([]);
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [sortKey, setSortKey] = useState<SortKey>('dayOfWeek');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Fakultas admin diambil dari akun (user.adminFacultyCode) — disamakan dengan Master Akademik.
  // Kita tidak menyimpan pilihan fakultas; hanya butuh prodi + ruangan fakultas tsb.
  const facultyCode = user?.adminFacultyCode ?? null;

  // Load prodi fakultas admin + kurikulum + ruangan aktif fakultas admin (sekali mount)
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Daftar prodi fakultas admin (via admin-master /prodis dengan facultyId)
        // butuh faculty ID — cari lewat listAcademicFaculties? listProdis butuh facultyId
        // internal: kita bisa pakai /prodis?facultyId= yang butuh id, bukan code.
        // Solusi: pakai listRooms(facultyId) → rooms punya facultyId, ambil dari sana.
        // Untuk prodi: listProdis butuh facultyId (number). Cari dari rooms tak cukup.
        // Fallback: listProdis tanpa filter lalu filter prodi yang faculty-nya cocok? tidak
        // punya facultyId di Prodi tanpa filter. Pakai /admin/classes langsung untuk listing.
        const [cls, cur, roomRes] = await Promise.all([
          listAdminClasses(),
          getAcademicCurricula(),
          listRooms({ limit: 100 }),
        ]);
        setClasses(cls);
        setCurricula(
          (cur.items ?? []).map((c) => ({
            id: Number(c.id),
            course_code: String(c.course_code ?? ''),
            course_name: String(c.course_name ?? ''),
            credits: Number(c.credits ?? 0),
            semester_number: Number(c.semester_number ?? 0),
            prodi_name: String(c.prodi_name ?? ''),
          })),
        );
        setRooms(roomRes.items ?? []);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Gagal memuat data jadwal');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // Fakultas ini → prodi (listProdis perlu facultyId number; kita cari dari curricula:
  // tiap kurikulum punya prodi_id, prodi milik fakultas kita bisa diambil via listProdis
  // dengan facultyId = rooms[0]?.facultyId — kalau ada ruangan fakultas tsb).
  const adminFacultyId = useMemo(
    () =>
      rooms.find((r) => r.facultyCode === facultyCode)?.facultyId ?? rooms[0]?.facultyId ?? null,
    [rooms, facultyCode],
  );

  useEffect(() => {
    if (adminFacultyId == null) {
      setProdis([]);
      return;
    }
    listProdis({ facultyId: adminFacultyId, limit: 100 })
      .then((res) => setProdis(res.items ?? []))
      .catch(() => {});
  }, [adminFacultyId]);

  // Opsi kurikulum hanya untuk prodi fakultas admin (cocokkan via prodi_name)
  const prodiNames = useMemo(() => new Set(prodis.map((p) => p.name)), [prodis]);
  const curriculumOptions = useMemo(
    () =>
      curricula
        .filter((c) => prodiNames.has(c.prodi_name))
        .sort(
          (a, b) =>
            a.prodi_name.localeCompare(b.prodi_name) || a.course_code.localeCompare(b.course_code),
        ),
    [curricula, prodiNames],
  );

  // Opsi ruangan: aktif + kapasitas > 0 milik fakultas admin.
  // Hari & jam belum ditentukan di tahap ini (dosen pengampu yang menentukan),
  // jadi cek bentrok ruangan dilakukan saat dosen menetapkan jadwal (halaman dosen).
  const roomOptions = useMemo(() => {
    return rooms
      .filter(
        (r) => r.isActive && (r.facultyCode === facultyCode || !facultyCode) && r.capacity > 0,
      )
      .map((r) => ({
        value: r.code,
        label: `${r.code} — ${r.name} (${r.capacity} kursi)`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rooms, facultyCode]);

  // Kode kelas tersedia: huruf A-Z yang BELUM dipakai di matkul (kurikulum) yang dipilih
  const availableClassCodes = useMemo(() => {
    if (form.curriculumId == null) return [];
    const used = new Set(
      classes.filter((c) => c.curriculumId === form.curriculumId).map((c) => c.classCode),
    );
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      .split('')
      .filter((ch) => !used.has(ch))
      .map((ch) => ({ value: ch, label: ch }));
  }, [classes, form.curriculumId]);

  // --- Sort ---
  const sortedClasses = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...classes].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'classCode':
          av = `${a.courseCode}-${a.classCode}`.toLowerCase();
          bv = `${b.courseCode}-${b.classCode}`.toLowerCase();
          break;
        case 'courseName':
          av = `${a.courseName} ${a.semesterNumber}`.toLowerCase();
          bv = `${b.courseName} ${b.semesterNumber}`.toLowerCase();
          break;
        case 'prodiName':
          av = a.prodiName.toLowerCase();
          bv = b.prodiName.toLowerCase();
          break;
        case 'dayOfWeek':
          av = a.dayOfWeek ?? 99;
          bv = b.dayOfWeek ?? 99;
          break;
        case 'startTime':
          av = a.startTime ?? '';
          bv = b.startTime ?? '';
          break;
        case 'room':
          av = a.room?.toLowerCase() ?? '';
          bv = b.room?.toLowerCase() ?? '';
          break;
        case 'capacity':
          av = a.currentEnrolled / a.capacity;
          bv = b.currentEnrolled / b.capacity;
          break;
        case 'lecturerName':
          av = a.lecturerName?.toLowerCase() ?? '';
          bv = b.lecturerName?.toLowerCase() ?? '';
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [classes, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await createAdminClass({
        curriculumId: form.curriculumId!,
        classCode: form.classCode.trim(),
        capacity: form.capacity,
        room: form.room ?? undefined,
      });
      setShowForm(false);
      setForm(DEFAULT_FORM);
      setClasses(await listAdminClasses(adminFacultyId ?? undefined));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal menyimpan kelas');
    } finally {
      setSaving(false);
    }
  };

  const selectedCurriculum = curriculumOptions.find((c) => c.id === form.curriculumId);

  return (
    <div className="space-y-6">
      {/* Header + tombol Tambah Kelas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kelola Jadwal</h1>
          <p className="text-sm text-slate-600">
            Daftar kelas (jadwal mengajar) fakultas{' '}
            {facultyCode ? <span className="font-medium">{facultyCode}</span> : 'admin akademik'}
          </p>
        </div>
        {!loading && (
          <button
            onClick={() => {
              setFormError(null);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            + Tambah Kelas
          </button>
        )}
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      {/* Form Tambah Kelas */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Tambah Kelas Baru</h2>
          {formError && <FormAlert>{formError}</FormAlert>}
          <form onSubmit={handleCreate} className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Program Studi *
                </label>
                <SearchableDropdown
                  options={prodis.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                  value={form.prodiId}
                  onChange={(v) => {
                    setForm({ ...form, prodiId: v, curriculumId: null });
                  }}
                  placeholder="Pilih Prodi"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mata Kuliah *
                </label>
                <SearchableDropdown
                  options={curriculumOptions.map((c) => ({
                    value: c.id,
                    label: `${c.course_code} — ${c.course_name} (Sem ${c.semester_number})`,
                  }))}
                  value={form.curriculumId}
                  onChange={(v) => setForm({ ...form, curriculumId: v })}
                  placeholder="Pilih Mata Kuliah"
                  disabled={form.prodiId == null}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="class-code"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Kode Kelas *
                </label>
                <SearchableDropdown
                  options={availableClassCodes}
                  value={form.classCode || null}
                  onChange={(v) => setForm({ ...form, classCode: v ?? '' })}
                  placeholder={
                    form.curriculumId == null
                      ? 'Pilih Mata Kuliah dulu'
                      : availableClassCodes.length === 0
                        ? 'Semua kode terpakai'
                        : 'Pilih Kode Kelas'
                  }
                  disabled={form.curriculumId == null || availableClassCodes.length === 0}
                />
                {form.curriculumId != null && availableClassCodes.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Semua kode kelas (A–Z) sudah dipakai untuk matkul ini.
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="class-capacity"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Kapasitas *
                </label>
                <input
                  id="class-capacity"
                  type="number"
                  min={1}
                  max={500}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ruangan</label>
                <SearchableDropdown
                  options={roomOptions}
                  value={form.room}
                  onChange={(v) => setForm({ ...form, room: v })}
                  placeholder="Pilih Ruangan"
                />
                {roomOptions.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Belum ada ruangan aktif di fakultas ini.
                  </p>
                )}
              </div>
            </div>

            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="font-medium">Catatan:</span> hari dan jam mengajar akan diatur oleh
              dosen pengampu pada halaman dosen setelah kelas ini dibuat.
            </p>

            {selectedCurriculum && (
              <p className="text-sm text-slate-500">
                Prodi: <span className="font-medium">{selectedCurriculum.prodi_name}</span> ·{' '}
                {selectedCurriculum.course_code} — {selectedCurriculum.course_name} (
                {selectedCurriculum.credits} SKS)
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || form.curriculumId == null || !form.classCode.trim()}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Menyimpan...' : 'Simpan Kelas'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(DEFAULT_FORM);
                  setFormError(null);
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Daftar Kelas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Memuat jadwal..." />
          </div>
        ) : classes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg
              className="mx-auto h-12 w-12 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mt-4">Belum ada kelas untuk fakultas ini.</p>
            <p className="text-sm mt-1">Klik "+ Tambah Kelas" untuk membuat jadwal pertama.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-slate-50">
                <tr>
                  {(
                    [
                      ['classCode', 'Kelas'],
                      ['courseName', 'Mata Kuliah'],
                      ['prodiName', 'Prodi'],
                      ['dayOfWeek', 'Jadwal'],
                      ['room', 'Ruangan'],
                      ['capacity', 'Kapasitas'],
                      ['lecturerName', 'Pengampu'],
                    ] as Array<[SortKey, string]>
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap"
                    >
                      <button
                        onClick={() => toggleSort(key)}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                        title={`Urutkan ${label}`}
                      >
                        {label}
                        <span
                          className={`text-xs ${
                            sortKey === key ? 'text-primary-600' : 'text-slate-300'
                          }`}
                          aria-hidden="true"
                        >
                          {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedClasses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">
                        {c.courseCode}-{c.classCode}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {c.courseName}
                      <span className="block text-xs text-slate-400">Sem {c.semesterNumber}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{c.prodiName}</td>
                    <td className="px-6 py-4 text-sm text-slate-700 whitespace-nowrap">
                      {c.dayOfWeek ? dayNames[c.dayOfWeek] : '-'}
                      {c.startTime && c.endTime ? ` ${c.startTime}–${c.endTime}` : ''}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{c.room ?? '-'}</td>
                    <td className="px-6 py-4 text-center text-sm">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.currentEnrolled >= c.capacity
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {c.currentEnrolled}/{c.capacity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {c.lecturerName ?? 'Belum ada pengampu'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
