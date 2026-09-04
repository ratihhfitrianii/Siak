import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  listFaculties,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  listProdis,
  createProdi,
  updateProdi,
  deleteProdi,
  listMasterStudents,
  listMasterLecturers,
  createMasterStudent,
  updateMasterStudent,
  createMasterLecturer,
  updateMasterLecturer,
  listAcademicFaculties,
  listAcademicProdis,
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  listCourses,
  createCourse,
  updateCourse,
  deleteCourse,
} from '../lib/api';
import type {
  Faculty,
  Prodi,
  CreateFacultyInput,
  CreateProdiInput,
  MasterStudent,
  MasterLecturer,
  CreateMasterStudentInput,
  CreateMasterLecturerInput,
  Room,
  CreateRoomInput,
  Course,
  CreateCourseInput,
} from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

type ModalTab =
  'faculties' | 'prodis' | 'students' | 'lecturers' | 'rooms' | 'prodi-akademik' | 'courses' | null;

const PAGE_SIZE = 10;

function PaginationBar({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-slate-500">
        Menampilkan {from}-{to} dari {total} data
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹ Sebelumnya
        </button>
        <span className="text-sm text-slate-600">
          Halaman {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Berikutnya ›
        </button>
      </div>
    </div>
  );
}

/** Halaman Master Data (Admin Sistem) — Fakultas, Prodi, Mahasiswa, Dosen. */
export function AdminMasterPage({ akademikOnly = false }: { akademikOnly?: boolean } = {}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'faculties' | 'prodis' | 'students' | 'lecturers' | 'rooms' | 'prodi-akademik' | 'courses'
  >(akademikOnly ? 'rooms' : 'faculties');
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [prodis, setProdis] = useState<Prodi[]>([]);
  const [students, setStudents] = useState<MasterStudent[]>([]);
  const [lecturers, setLecturers] = useState<MasterLecturer[]>([]);
  const [facultyPage, setFacultyPage] = useState(1);
  const [prodiPage, setProdiPage] = useState(1);
  const [studentPage, setStudentPage] = useState(1);
  const [lecturerPage, setLecturerPage] = useState(1);
  const [facultyTotal, setFacultyTotal] = useState(0);
  const [prodiTotal, setProdiTotal] = useState(0);
  const [studentTotal, setStudentTotal] = useState(0);
  const [lecturerTotal, setLecturerTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<ModalTab>(null);
  const [saving, setSaving] = useState(false);

  // ===== Admin Akademik — Master Data (Ruangan, Prodi per fakultas, Mata Kuliah) =====
  // Fakultas admin ditentukan lewat seleksi yang dipertahankan (localStorage);
  // daftar prodi & ruangan disaring berdasarkan fakultas admin ini.
  const [adminFaculties, setAdminFaculties] = useState<Faculty[]>([]);
  const [adminFacultyId, setAdminFacultyId] = useState<number | null>(() => {
    const stored = window.localStorage.getItem('siak.admin_faculty');
    return stored ? Number(stored) : null;
  });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [roomPage, setRoomPage] = useState(1);
  const [roomSearch, setRoomSearch] = useState('');
  const [akademikProdis, setAkademikProdis] = useState<Prodi[]>([]);
  const [akademikProdiTotal, setAkademikProdiTotal] = useState(0);
  const [akademikProdiPage, setAkademikProdiPage] = useState(1);
  const [akademikProdiSearch, setAkademikProdiSearch] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSearch, setCourseSearch] = useState('');

  // Search states
  const [facultySearch, setFacultySearch] = useState('');
  const [prodiSearch, setProdiSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [lecturerSearch, setLecturerSearch] = useState('');

  // Form Faculty
  const [facultyForm, setFacultyForm] = useState<CreateFacultyInput>({
    code: '',
    name: '',
    isActive: true,
  });
  const [editingFacultyId, setEditingFacultyId] = useState<number | null>(null);

  // Form Prodi
  const [prodiForm, setProdiForm] = useState<CreateProdiInput>({
    code: '',
    name: '',
    facultyCode: '',
    degree: 'S1',
    accreditation: '',
    isActive: true,
  });
  const [editingProdiId, setEditingProdiId] = useState<number | null>(null);

  // Form Student
  const [studentForm, setStudentForm] = useState<CreateMasterStudentInput>({
    nim: '',
    fullName: '',
    prodiCode: '',
    angkatan: '',
    email: '',
  });
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);

  // Form Lecturer
  const [lecturerForm, setLecturerForm] = useState<CreateMasterLecturerInput>({
    nidn: '',
    fullName: '',
    prodiCode: '',
    email: '',
  });
  const [editingLecturerId, setEditingLecturerId] = useState<number | null>(null);

  // Form Ruangan
  const [roomForm, setRoomForm] = useState<CreateRoomInput>({
    code: '',
    name: '',
    capacity: 40,
    facultyCode: '',
    isActive: true,
  });
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);

  // Form Prodi (admin akademik — fakultas admin ditentukan)
  const [akademikProdiForm, setAkademikProdiForm] = useState<CreateProdiInput>({
    code: '',
    name: '',
    facultyCode: '',
    degree: 'S1',
    accreditation: '',
    isActive: true,
  });
  const [editingAkademikProdiId, setEditingAkademikProdiId] = useState<number | null>(null);

  // Form Mata Kuliah
  const [courseForm, setCourseForm] = useState<CreateCourseInput>({
    code: '',
    name: '',
    credits: 3,
    description: '',
  });
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);

  const loadFaculties = useCallback(
    async (page = 1) => {
      try {
        const data = await listFaculties({ page, limit: PAGE_SIZE, search: facultySearch });
        setFaculties(data.items);
        setFacultyTotal(data.pagination.total);
        setFacultyPage(page);
      } catch {
        setError('Gagal memuat data fakultas');
      }
    },
    [facultySearch],
  );

  const loadProdis = useCallback(
    async (page = 1) => {
      try {
        const data = await listProdis({ page, limit: PAGE_SIZE, search: prodiSearch });
        setProdis(data.items);
        setProdiTotal(data.pagination.total);
        setProdiPage(page);
      } catch {
        setError('Gagal memuat data prodi');
      }
    },
    [prodiSearch],
  );

  const loadStudents = useCallback(
    async (page = 1) => {
      try {
        const response = await listMasterStudents({
          page,
          limit: PAGE_SIZE,
          search: studentSearch,
        });
        setStudents(response.items);
        setStudentTotal(response.pagination.total);
        setStudentPage(page);
      } catch {
        setError('Gagal memuat data mahasiswa');
      }
    },
    [studentSearch],
  );

  const loadLecturers = useCallback(
    async (page = 1) => {
      try {
        const response = await listMasterLecturers({
          page,
          limit: PAGE_SIZE,
          search: lecturerSearch,
        });
        setLecturers(response.items);
        setLecturerTotal(response.pagination.total);
        setLecturerPage(page);
      } catch {
        setError('Gagal memuat data dosen');
      }
    },
    [lecturerSearch],
  );

  // ===== Admin Akademik: Fakultas (untuk seleksi fakultas admin) =====
  const loadAdminFaculties = useCallback(async () => {
    try {
      const data = await listAcademicFaculties({ limit: 100 });
      setAdminFaculties(data.items);
    } catch {
      setError('Gagal memuat data fakultas');
    }
  }, []);

  // ===== Admin Akademik: Prodi per fakultas =====
  const loadAkademikProdis = useCallback(
    async (page = 1) => {
      try {
        const params: { page: number; limit: number; search: string; facultyId?: number } = {
          page,
          limit: PAGE_SIZE,
          search: akademikProdiSearch,
        };
        if (adminFacultyId) params.facultyId = adminFacultyId;
        const data = await listAcademicProdis(params);
        setAkademikProdis(data.items);
        setAkademikProdiTotal(data.pagination.total);
        setAkademikProdiPage(page);
      } catch {
        setError('Gagal memuat data prodi');
      }
    },
    [akademikProdiSearch, adminFacultyId],
  );

  // ===== Admin Akademik: Ruangan =====
  const loadRooms = useCallback(
    async (page = 1) => {
      try {
        const params: { page: number; limit: number; search: string; facultyId?: number } = {
          page,
          limit: PAGE_SIZE,
          search: roomSearch,
        };
        if (adminFacultyId) params.facultyId = adminFacultyId;
        const data = await listRooms(params);
        setRooms(data.items);
        setRoomsTotal(data.pagination.total);
        setRoomPage(page);
      } catch {
        setError('Gagal memuat data ruangan');
      }
    },
    [roomSearch, adminFacultyId],
  );

  // ===== Admin Akademik: Mata Kuliah =====
  const loadCourses = useCallback(async () => {
    try {
      const data = await listCourses({ search: courseSearch || undefined });
      setCourses(data.items);
    } catch {
      setError('Gagal memuat data mata kuliah');
    }
  }, [courseSearch]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    if (akademikOnly) {
      Promise.all([loadAdminFaculties(), loadCourses()]).finally(() => setLoading(false));
    } else {
      Promise.all([
        loadFaculties(),
        loadProdis(),
        loadStudents(),
        loadLecturers(),
        loadAdminFaculties(),
        loadCourses(),
      ]).finally(() => setLoading(false));
    }
  }, [
    akademikOnly,
    loadFaculties,
    loadProdis,
    loadStudents,
    loadLecturers,
    loadAdminFaculties,
    loadCourses,
  ]);

  // Muat ulang prodi & ruangan saat fakultas admin berubah.
  useEffect(() => {
    if (activeTab === 'prodi-akademik') loadAkademikProdis(1);
    if (activeTab === 'rooms') loadRooms(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFacultyId, activeTab]);

  // Mode akademik: fakultas terikat dari akun (user.adminFacultyCode), bukan localStorage bebas.
  useEffect(() => {
    if (!akademikOnly) return;
    const code = user?.adminFacultyCode;
    if (!code) {
      // Tak ada fakultas terikat → kosongkan (tampilkan pesan "admin belum terikat fakultas").
      setAdminFacultyId(null);
      return;
    }
    const match = adminFaculties.find((f) => f.code === code);
    const id = match?.id ?? null;
    setAdminFacultyId((prev) => (prev === id ? prev : id));
    if (id) window.localStorage.setItem('siak.admin_faculty', String(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [akademikOnly, user?.adminFacultyCode, adminFaculties]);

  // ===== Fakultas =====
  const openFacultyModal = (f?: Faculty) => {
    setError(null);
    setSuccess(null);
    if (f) {
      setFacultyForm({ code: f.code, name: f.name, isActive: f.isActive });
      setEditingFacultyId(f.id);
    } else {
      setFacultyForm({ code: '', name: '', isActive: true });
      setEditingFacultyId(null);
    }
    setModalTab('faculties');
  };

  const handleFacultySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (editingFacultyId) {
        await updateFaculty(editingFacultyId, {
          code: facultyForm.code,
          name: facultyForm.name,
          isActive: facultyForm.isActive,
        });
        setSuccess('Fakultas berhasil diupdate');
      } else {
        await createFaculty(facultyForm);
        setSuccess('Fakultas berhasil dibuat');
      }
      setModalTab(null);
      setEditingFacultyId(null);
      await loadFaculties(facultyPage);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan fakultas');
    } finally {
      setSaving(false);
    }
  };

  const handleFacultyDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan fakultas ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteFaculty(id);
      setSuccess('Fakultas dinonaktifkan');
      if (faculties.length === 1 && facultyPage > 1) {
        await loadFaculties(facultyPage - 1);
      } else {
        await loadFaculties(facultyPage);
      }
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan fakultas');
    }
  };

  // ===== Prodi =====
  const openProdiModal = (p?: Prodi) => {
    setError(null);
    setSuccess(null);
    if (p) {
      setProdiForm({
        code: p.code,
        name: p.name,
        facultyCode: p.facultyCode,
        degree: p.degree as CreateProdiInput['degree'],
        accreditation: p.accreditation ?? '',
        isActive: p.isActive,
      });
      setEditingProdiId(p.id);
    } else {
      setProdiForm({
        code: '',
        name: '',
        facultyCode: '',
        degree: 'S1',
        accreditation: '',
        isActive: true,
      });
      setEditingProdiId(null);
    }
    setModalTab('prodis');
  };

  const handleProdiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const payload = { ...prodiForm, accreditation: prodiForm.accreditation || undefined };
      if (editingProdiId) {
        await updateProdi(editingProdiId, payload);
        setSuccess('Prodi berhasil diupdate');
      } else {
        await createProdi(payload);
        setSuccess('Prodi berhasil dibuat');
      }
      setProdiForm({
        code: '',
        name: '',
        facultyCode: '',
        degree: 'S1',
        accreditation: '',
        isActive: true,
      });
      setEditingProdiId(null);
      setModalTab(null);
      await loadProdis(prodiPage);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan prodi');
    } finally {
      setSaving(false);
    }
  };

  const handleProdiDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan prodi ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteProdi(id);
      setSuccess('Prodi dinonaktifkan');
      if (prodis.length === 1 && prodiPage > 1) {
        await loadProdis(prodiPage - 1);
      } else {
        await loadProdis(prodiPage);
      }
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan prodi');
    }
  };

  // ===== Mahasiswa =====
  const openStudentModal = (s?: MasterStudent) => {
    setError(null);
    setSuccess(null);
    if (s) {
      setStudentForm({
        nim: s.nim,
        fullName: s.fullName,
        prodiCode: s.prodiCode,
        angkatan: s.angkatan,
        email: s.email,
      });
      setEditingStudentId(s.id);
    } else {
      setStudentForm({ nim: '', fullName: '', prodiCode: '', angkatan: '', email: '' });
      setEditingStudentId(null);
    }
    setModalTab('students');
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (editingStudentId) {
        await updateMasterStudent(editingStudentId, {
          fullName: studentForm.fullName,
          prodiCode: studentForm.prodiCode,
          angkatan: studentForm.angkatan,
          email: studentForm.email || undefined,
        });
        setSuccess('Mahasiswa berhasil diupdate');
      } else {
        await createMasterStudent(studentForm);
        setSuccess('Mahasiswa berhasil dibuat');
      }
      setStudentForm({ nim: '', fullName: '', prodiCode: '', angkatan: '', email: '' });
      setEditingStudentId(null);
      setModalTab(null);
      await loadStudents(studentPage);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan mahasiswa');
    } finally {
      setSaving(false);
    }
  };

  // ===== Dosen =====
  const openLecturerModal = (l?: MasterLecturer) => {
    setError(null);
    setSuccess(null);
    if (l) {
      setLecturerForm({
        nidn: l.nidn,
        fullName: l.fullName,
        prodiCode: l.prodiCode,
        email: l.email,
      });
      setEditingLecturerId(l.id);
    } else {
      setLecturerForm({ nidn: '', fullName: '', prodiCode: '', email: '' });
      setEditingLecturerId(null);
    }
    setModalTab('lecturers');
  };

  const handleLecturerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (editingLecturerId) {
        await updateMasterLecturer(editingLecturerId, {
          fullName: lecturerForm.fullName,
          prodiCode: lecturerForm.prodiCode,
          email: lecturerForm.email || undefined,
        });
        setSuccess('Dosen berhasil diupdate');
      } else {
        await createMasterLecturer(lecturerForm);
        setSuccess('Dosen berhasil dibuat');
      }
      setLecturerForm({ nidn: '', fullName: '', prodiCode: '', email: '' });
      setEditingLecturerId(null);
      setModalTab(null);
      await loadLecturers(lecturerPage);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan dosen');
    } finally {
      setSaving(false);
    }
  };

  // ===== Ruangan =====
  const openRoomModal = (r?: Room) => {
    setError(null);
    setSuccess(null);
    const activeFaculty = adminFaculties.find((f) => f.id === adminFacultyId) ?? adminFaculties[0];
    if (r) {
      setRoomForm({
        code: r.code,
        name: r.name,
        capacity: r.capacity,
        facultyCode: activeFaculty?.code ?? r.facultyCode,
        isActive: r.isActive,
      });
      setEditingRoomId(r.id);
    } else {
      setRoomForm({
        code: '',
        name: '',
        capacity: 40,
        facultyCode: activeFaculty?.code ?? '',
        isActive: true,
      });
      setEditingRoomId(null);
    }
    setModalTab('rooms');
  };

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (editingRoomId) {
        await updateRoom(editingRoomId, {
          name: roomForm.name,
          capacity: roomForm.capacity,
          facultyCode: roomForm.facultyCode,
          isActive: roomForm.isActive,
        });
        setSuccess('Ruangan berhasil diupdate');
      } else {
        await createRoom(roomForm);
        setSuccess('Ruangan berhasil dibuat');
      }
      setRoomForm({ code: '', name: '', capacity: 40, facultyCode: '', isActive: true });
      setEditingRoomId(null);
      setModalTab(null);
      await loadRooms(roomPage);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan ruangan');
    } finally {
      setSaving(false);
    }
  };

  const handleRoomDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan ruangan ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteRoom(id);
      setSuccess('Ruangan dinonaktifkan');
      if (rooms.length === 1 && roomPage > 1) {
        await loadRooms(roomPage - 1);
      } else {
        await loadRooms(roomPage);
      }
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan ruangan');
    }
  };

  // ===== Prodi (admin akademik — per fakultas admin) =====
  const openAkademikProdiModal = (p?: Prodi) => {
    setError(null);
    setSuccess(null);
    const activeFaculty = adminFaculties.find((f) => f.id === adminFacultyId) ?? adminFaculties[0];
    const facultyCode = activeFaculty?.code ?? '';
    if (p) {
      setAkademikProdiForm({
        code: p.code,
        name: p.name,
        facultyCode: p.facultyCode,
        degree: p.degree as CreateProdiInput['degree'],
        accreditation: p.accreditation ?? '',
        isActive: p.isActive,
      });
      setEditingAkademikProdiId(p.id);
    } else {
      setAkademikProdiForm({
        code: '',
        name: '',
        facultyCode,
        degree: 'S1',
        accreditation: '',
        isActive: true,
      });
      setEditingAkademikProdiId(null);
    }
    setModalTab('prodi-akademik');
  };

  const handleAkademikProdiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const payload = {
        ...akademikProdiForm,
        accreditation: akademikProdiForm.accreditation || undefined,
      };
      if (editingAkademikProdiId) {
        await updateProdi(editingAkademikProdiId, payload);
        setSuccess('Prodi berhasil diupdate');
      } else {
        await createProdi(payload);
        setSuccess('Prodi berhasil dibuat');
      }
      setAkademikProdiForm({
        code: '',
        name: '',
        facultyCode: '',
        degree: 'S1',
        accreditation: '',
        isActive: true,
      });
      setEditingAkademikProdiId(null);
      setModalTab(null);
      await loadAkademikProdis(akademikProdiPage);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan prodi');
    } finally {
      setSaving(false);
    }
  };

  const handleAkademikProdiDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan prodi ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteProdi(id);
      setSuccess('Prodi dinonaktifkan');
      if (akademikProdis.length === 1 && akademikProdiPage > 1) {
        await loadAkademikProdis(akademikProdiPage - 1);
      } else {
        await loadAkademikProdis(akademikProdiPage);
      }
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan prodi');
    }
  };

  // ===== Mata Kuliah =====
  const openCourseModal = (c?: Course) => {
    setError(null);
    setSuccess(null);
    if (c) {
      setCourseForm({
        code: c.code,
        name: c.name,
        credits: c.credits,
        description: c.description ?? '',
      });
      setEditingCourseId(c.id);
    } else {
      setCourseForm({ code: '', name: '', credits: 3, description: '' });
      setEditingCourseId(null);
    }
    setModalTab('courses');
  };

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (editingCourseId) {
        await updateCourse(editingCourseId, {
          name: courseForm.name,
          credits: courseForm.credits,
          description: courseForm.description || undefined,
        });
        setSuccess('Mata kuliah berhasil diupdate');
      } else {
        await createCourse(courseForm);
        setSuccess('Mata kuliah berhasil dibuat');
      }
      setCourseForm({ code: '', name: '', credits: 3, description: '' });
      setEditingCourseId(null);
      setModalTab(null);
      await loadCourses();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan mata kuliah');
    } finally {
      setSaving(false);
    }
  };

  const handleCourseDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan mata kuliah ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteCourse(id);
      setSuccess('Mata kuliah dinonaktifkan');
      await loadCourses();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan mata kuliah');
    }
  };

  if (loading) return <div className="p-6 text-center text-slate-500">Memuat data master...</div>;

  const closeModal = () => {
    setModalTab(null);
    setEditingFacultyId(null);
    setEditingProdiId(null);
    setEditingStudentId(null);
    setEditingLecturerId(null);
    setEditingRoomId(null);
    setEditingAkademikProdiId(null);
    setEditingCourseId(null);
  };

  const inputCls =
    'w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="bg-white rounded-lg shadow-sm border-b">
        <nav className="flex -mb-px" role="tablist">
          {!akademikOnly && (
            <>
              <button
                role="tab"
                aria-selected={activeTab === 'faculties'}
                onClick={() => setActiveTab('faculties')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'faculties'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Fakultas
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'prodis'}
                onClick={() => setActiveTab('prodis')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'prodis'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Program Studi
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'students'}
                onClick={() => setActiveTab('students')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'students'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Mahasiswa
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'lecturers'}
                onClick={() => setActiveTab('lecturers')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'lecturers'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Dosen
              </button>
            </>
          )}
          <button
            role="tab"
            aria-selected={activeTab === 'rooms'}
            onClick={() => setActiveTab('rooms')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'rooms'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Ruangan
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'prodi-akademik'}
            onClick={() => setActiveTab('prodi-akademik')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'prodi-akademik'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Prodi
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'courses'}
            onClick={() => setActiveTab('courses')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'courses'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Mata Kuliah
          </button>
        </nav>
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

      {/* Fakultas Tab */}
      {!akademikOnly && activeTab === 'faculties' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-slate-900">Daftar Fakultas</h3>
            <button
              onClick={() => openFacultyModal()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Tambah Fakultas
            </button>
          </div>

          {/* Search Fakultas */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Cari kode/nama fakultas..."
              value={facultySearch}
              onChange={(e) => {
                setFacultySearch(e.target.value);
                loadFaculties(1);
              }}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Table Fakultas */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Kode</th>
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Dibuat</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {faculties.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada data fakultas.
                    </td>
                  </tr>
                ) : (
                  faculties.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono text-slate-900">{f.code}</td>
                      <td className="py-3 text-slate-900">{f.name}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            f.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {f.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-500">{f.createdAt.split('T')[0]}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openFacultyModal(f)}
                            className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleFacultyDelete(f.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                          >
                            Nonaktifkan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={facultyPage}
            total={facultyTotal}
            onPageChange={(p) => loadFaculties(p)}
          />
        </div>
      )}

      {/* Prodi Tab */}
      {!akademikOnly && activeTab === 'prodis' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-slate-900">Daftar Program Studi</h3>
            <button
              onClick={() => openProdiModal()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Tambah Prodi
            </button>
          </div>

          {/* Search Prodi */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Cari kode/nama prodi..."
              value={prodiSearch}
              onChange={(e) => {
                setProdiSearch(e.target.value);
                loadProdis(1);
              }}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Table Prodi */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Kode</th>
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Fakultas</th>
                  <th className="pb-2 font-medium">Jenjang</th>
                  <th className="pb-2 font-medium">Akr.</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {prodis.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Belum ada data program studi.
                    </td>
                  </tr>
                ) : (
                  prodis.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono text-slate-900">{p.code}</td>
                      <td className="py-3 text-slate-900">{p.name}</td>
                      <td className="py-3 text-slate-700">
                        {p.facultyCode} - {p.facultyName}
                      </td>
                      <td className="py-3 text-slate-600">{p.degree}</td>
                      <td className="py-3 text-slate-600">{p.accreditation || '-'}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            p.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {p.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openProdiModal(p)}
                            className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleProdiDelete(p.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                          >
                            Nonaktifkan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar page={prodiPage} total={prodiTotal} onPageChange={(p) => loadProdis(p)} />
        </div>
      )}

      {/* Mahasiswa Tab */}
      {!akademikOnly && activeTab === 'students' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-slate-900">Daftar Mahasiswa</h3>
            <button
              onClick={() => openStudentModal()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Tambah Mahasiswa
            </button>
          </div>

          {/* Search Mahasiswa */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Cari NIM/nama/email mahasiswa..."
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                loadStudents(1);
              }}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Table Mahasiswa */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">NIM</th>
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Prodi</th>
                  <th className="pb-2 font-medium">Angkatan</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Belum ada data mahasiswa.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono text-slate-900">{s.nim}</td>
                      <td className="py-3 text-slate-900">{s.fullName}</td>
                      <td className="py-3 text-slate-700">
                        {s.prodiCode} - {s.prodiName}
                      </td>
                      <td className="py-3 text-slate-600">{s.angkatan}</td>
                      <td className="py-3 text-slate-600">{s.email}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            s.userActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {s.userActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openStudentModal(s)}
                            className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={studentPage}
            total={studentTotal}
            onPageChange={(p) => loadStudents(p)}
          />
        </div>
      )}

      {/* Dosen Tab */}
      {!akademikOnly && activeTab === 'lecturers' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-slate-900">Daftar Dosen</h3>
            <button
              onClick={() => openLecturerModal()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Tambah Dosen
            </button>
          </div>

          {/* Search Dosen */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Cari NIDN/nama/email dosen..."
              value={lecturerSearch}
              onChange={(e) => {
                setLecturerSearch(e.target.value);
                loadLecturers(1);
              }}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Table Dosen */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">NIDN</th>
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Prodi</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Wali</th>
                  <th className="pb-2 font-medium">Jenis</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {lecturers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Belum ada data dosen.
                    </td>
                  </tr>
                ) : (
                  lecturers.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono text-slate-900">{l.nidn}</td>
                      <td className="py-3 text-slate-900">{l.fullName}</td>
                      <td className="py-3 text-slate-700">
                        {l.prodiCode} - {l.prodiName}
                      </td>
                      <td className="py-3 text-slate-600">{l.email}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            l.userActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {l.userActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            l.isWali ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {l.isWali ? 'Ya' : 'Tidak'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600">{l.employmentType}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openLecturerModal(l)}
                            className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={lecturerPage}
            total={lecturerTotal}
            onPageChange={(p) => loadLecturers(p)}
          />
        </div>
      )}

      {/* Ruangan Tab */}
      {activeTab === 'rooms' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-medium text-slate-900">Daftar Ruangan</h3>
              {akademikOnly ? (
                <p className="text-sm text-slate-500 mt-1">
                  Fakultas:{' '}
                  <span className="font-medium text-slate-700">
                    {adminFaculties.find((f) => f.id === adminFacultyId)?.name ??
                      (user?.adminFacultyCode
                        ? user.adminFacultyCode
                        : '— belum terikat fakultas —')}
                  </span>
                </p>
              ) : (
                <label className="block text-sm text-slate-500 mt-1">
                  Fakultas
                  <select
                    value={adminFacultyId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      setAdminFacultyId(value);
                      if (value) window.localStorage.setItem('siak.admin_faculty', String(value));
                      else window.localStorage.removeItem('siak.admin_faculty');
                    }}
                    className="ml-2 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Pilih Fakultas</option>
                    {adminFaculties
                      .filter((f) => f.isActive)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} - {f.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <button
              onClick={() => openRoomModal()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Tambah Ruangan
            </button>
          </div>

          {!adminFacultyId ? (
            <p className="py-8 text-center text-slate-500">
              Pilih fakultas terlebih dahulu untuk melihat ruangan.
            </p>
          ) : (
            <>
              {/* Search Ruangan */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Cari kode/nama ruangan..."
                  value={roomSearch}
                  onChange={(e) => {
                    setRoomSearch(e.target.value);
                    loadRooms(1);
                  }}
                  className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Table Ruangan */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="pb-2 font-medium">Kode</th>
                      <th className="pb-2 font-medium">Nama</th>
                      <th className="pb-2 font-medium">Kapasitas</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Belum ada data ruangan.
                        </td>
                      </tr>
                    ) : (
                      rooms.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 font-mono text-slate-900">{r.code}</td>
                          <td className="py-3 text-slate-900">{r.name}</td>
                          <td className="py-3 text-slate-600">{r.capacity}</td>
                          <td className="py-3">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                r.isActive
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {r.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openRoomModal(r)}
                                className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleRoomDelete(r.id)}
                                className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                              >
                                Nonaktifkan
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={roomPage}
                total={roomsTotal}
                onPageChange={(p) => loadRooms(p)}
              />
            </>
          )}
        </div>
      )}

      {/* Prodi (Admin Akademik) Tab */}
      {activeTab === 'prodi-akademik' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-medium text-slate-900">Daftar Prodi (Per Fakultas)</h3>
              {akademikOnly ? (
                <p className="text-sm text-slate-500 mt-1">
                  Fakultas:{' '}
                  <span className="font-medium text-slate-700">
                    {adminFaculties.find((f) => f.id === adminFacultyId)?.name ??
                      (user?.adminFacultyCode
                        ? user.adminFacultyCode
                        : '— belum terikat fakultas —')}
                  </span>
                </p>
              ) : (
                <label className="block text-sm text-slate-500 mt-1">
                  Fakultas
                  <select
                    value={adminFacultyId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      setAdminFacultyId(value);
                      if (value) window.localStorage.setItem('siak.admin_faculty', String(value));
                      else window.localStorage.removeItem('siak.admin_faculty');
                    }}
                    className="ml-2 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Pilih Fakultas</option>
                    {adminFaculties
                      .filter((f) => f.isActive)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} - {f.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <button
              onClick={() => openAkademikProdiModal()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Tambah Prodi
            </button>
          </div>

          {!adminFacultyId ? (
            <p className="py-8 text-center text-slate-500">
              Pilih fakultas terlebih dahulu untuk melihat prodi fakultas ini.
            </p>
          ) : (
            <>
              {/* Search Prodi */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Cari kode/nama prodi..."
                  value={akademikProdiSearch}
                  onChange={(e) => {
                    setAkademikProdiSearch(e.target.value);
                    loadAkademikProdis(1);
                  }}
                  className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Table Prodi */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="pb-2 font-medium">Kode</th>
                      <th className="pb-2 font-medium">Nama</th>
                      <th className="pb-2 font-medium">Jenjang</th>
                      <th className="pb-2 font-medium">Akr.</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {akademikProdis.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Belum ada data program studi pada fakultas ini.
                        </td>
                      </tr>
                    ) : (
                      akademikProdis.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 font-mono text-slate-900">{p.code}</td>
                          <td className="py-3 text-slate-900">{p.name}</td>
                          <td className="py-3 text-slate-600">{p.degree}</td>
                          <td className="py-3 text-slate-600">{p.accreditation || '-'}</td>
                          <td className="py-3">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                p.isActive
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {p.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openAkademikProdiModal(p)}
                                className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleAkademikProdiDelete(p.id)}
                                className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                              >
                                Nonaktifkan
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={akademikProdiPage}
                total={akademikProdiTotal}
                onPageChange={(p) => loadAkademikProdis(p)}
              />
            </>
          )}
        </div>
      )}

      {/* Mata Kuliah Tab */}
      {activeTab === 'courses' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-slate-900">Daftar Mata Kuliah</h3>
            <button
              onClick={() => openCourseModal()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Tambah Mata Kuliah
            </button>
          </div>

          {/* Search Mata Kuliah */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Cari kode/nama mata kuliah..."
              value={courseSearch}
              onChange={(e) => {
                setCourseSearch(e.target.value);
                loadCourses();
              }}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Table Mata Kuliah */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Kode</th>
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">SKS</th>
                  <th className="pb-2 font-medium">Deskripsi</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {courses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada data mata kuliah.
                    </td>
                  </tr>
                ) : (
                  courses.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono text-slate-900">{c.code}</td>
                      <td className="py-3 text-slate-900">{c.name}</td>
                      <td className="py-3 text-slate-600">{c.credits}</td>
                      <td
                        className="py-3 text-slate-600 max-w-xs truncate"
                        title={c.description || ''}
                      >
                        {c.description || '-'}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openCourseModal(c)}
                            className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleCourseDelete(c.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                          >
                            Nonaktifkan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Modal Tambah/Edit ===== */}
      {modalTab && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={
            modalTab === 'faculties'
              ? editingFacultyId
                ? 'Edit fakultas'
                : 'Tambah fakultas'
              : modalTab === 'prodis'
                ? editingProdiId
                  ? 'Edit prodi'
                  : 'Tambah prodi'
                : modalTab === 'students'
                  ? editingStudentId
                    ? 'Edit mahasiswa'
                    : 'Tambah mahasiswa'
                  : modalTab === 'lecturers'
                    ? editingLecturerId
                      ? 'Edit dosen'
                      : 'Tambah dosen'
                    : modalTab === 'rooms'
                      ? editingRoomId
                        ? 'Edit ruangan'
                        : 'Tambah ruangan'
                      : modalTab === 'prodi-akademik'
                        ? editingAkademikProdiId
                          ? 'Edit prodi'
                          : 'Tambah prodi'
                        : editingCourseId
                          ? 'Edit mata kuliah'
                          : 'Tambah mata kuliah'
          }
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {modalTab === 'faculties' &&
                  (editingFacultyId ? 'Edit Fakultas' : 'Tambah Fakultas')}
                {modalTab === 'prodis' && (editingProdiId ? 'Edit Prodi' : 'Tambah Prodi')}
                {modalTab === 'students' &&
                  (editingStudentId ? 'Edit Mahasiswa' : 'Tambah Mahasiswa')}
                {modalTab === 'lecturers' && (editingLecturerId ? 'Edit Dosen' : 'Tambah Dosen')}
                {modalTab === 'rooms' && (editingRoomId ? 'Edit Ruangan' : 'Tambah Ruangan')}
                {modalTab === 'prodi-akademik' &&
                  (editingAkademikProdiId ? 'Edit Prodi' : 'Tambah Prodi')}
                {modalTab === 'courses' &&
                  (editingCourseId ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah')}
              </h3>
              <button
                onClick={closeModal}
                aria-label="Tutup"
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Form Fakultas */}
            {modalTab === 'faculties' && (
              <form onSubmit={handleFacultySubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="faculty-code"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Kode Fakultas *
                  </label>
                  <input
                    id="faculty-code"
                    type="text"
                    value={facultyForm.code}
                    onChange={(e) =>
                      setFacultyForm({ ...facultyForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="Contoh: FT, FE, FH"
                    maxLength={10}
                    className={inputCls}
                    required
                    disabled={!!editingFacultyId}
                  />
                  {editingFacultyId && (
                    <p className="mt-1 text-xs text-slate-500">Kode tidak bisa diubah saat edit</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="faculty-name"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Nama Fakultas *
                  </label>
                  <input
                    id="faculty-name"
                    type="text"
                    value={facultyForm.name}
                    onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
                    placeholder="Contoh: Fakultas Teknik"
                    maxLength={100}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="faculty-active"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      id="faculty-active"
                      type="checkbox"
                      checked={facultyForm.isActive}
                      onChange={(e) =>
                        setFacultyForm({ ...facultyForm, isActive: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700">Aktif</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving
                      ? 'Menyimpan...'
                      : editingFacultyId
                        ? 'Update Fakultas'
                        : 'Simpan Fakultas'}
                  </button>
                </div>
              </form>
            )}

            {/* Form Prodi */}
            {modalTab === 'prodis' && (
              <form onSubmit={handleProdiSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="prodi-code"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Kode Prodi *
                    </label>
                    <input
                      id="prodi-code"
                      type="text"
                      value={prodiForm.code}
                      onChange={(e) =>
                        setProdiForm({ ...prodiForm, code: e.target.value.toUpperCase() })
                      }
                      placeholder="Contoh: TI, SI, AKT"
                      maxLength={10}
                      className={inputCls}
                      required
                      disabled={!!editingProdiId}
                    />
                    {editingProdiId && (
                      <p className="mt-1 text-xs text-slate-500">
                        Kode tidak bisa diubah saat edit
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="prodi-name"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Nama Prodi *
                    </label>
                    <input
                      id="prodi-name"
                      type="text"
                      value={prodiForm.name}
                      onChange={(e) => setProdiForm({ ...prodiForm, name: e.target.value })}
                      placeholder="Contoh: Teknik Informatika"
                      maxLength={100}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="prodi-faculty"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Fakultas *
                    </label>
                    <select
                      id="prodi-faculty"
                      value={prodiForm.facultyCode}
                      onChange={(e) => setProdiForm({ ...prodiForm, facultyCode: e.target.value })}
                      className={inputCls}
                      required
                    >
                      <option value="">Pilih Fakultas</option>
                      {faculties
                        .filter((f) => f.isActive)
                        .map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.code} - {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="prodi-degree"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Jenjang *
                    </label>
                    <select
                      id="prodi-degree"
                      value={prodiForm.degree}
                      onChange={(e) =>
                        setProdiForm({
                          ...prodiForm,
                          degree: e.target.value as CreateProdiInput['degree'],
                        })
                      }
                      className={inputCls}
                      required
                    >
                      <option value="S1">S1</option>
                      <option value="S2">S2</option>
                      <option value="S3">S3</option>
                      <option value="D3">D3</option>
                      <option value="D4">D4</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="prodi-accreditation"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Akreditasi
                    </label>
                    <input
                      id="prodi-accreditation"
                      type="text"
                      value={prodiForm.accreditation}
                      onChange={(e) =>
                        setProdiForm({ ...prodiForm, accreditation: e.target.value })
                      }
                      placeholder="Contoh: A, B, Unggul"
                      maxLength={20}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-end">
                    <label
                      htmlFor="prodi-active"
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        id="prodi-active"
                        type="checkbox"
                        checked={prodiForm.isActive}
                        onChange={(e) => setProdiForm({ ...prodiForm, isActive: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                      />
                      <span className="text-sm text-slate-700">Aktif</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan...' : editingProdiId ? 'Update Prodi' : 'Simpan Prodi'}
                  </button>
                </div>
              </form>
            )}

            {/* Form Mahasiswa */}
            {modalTab === 'students' && (
              <form onSubmit={handleStudentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="student-nim"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      NIM *
                    </label>
                    <input
                      id="student-nim"
                      type="text"
                      value={studentForm.nim}
                      onChange={(e) =>
                        setStudentForm({ ...studentForm, nim: e.target.value.toUpperCase() })
                      }
                      placeholder="Contoh: 20240001"
                      maxLength={20}
                      className={inputCls}
                      required
                      disabled={!!editingStudentId}
                    />
                    {editingStudentId && (
                      <p className="mt-1 text-xs text-slate-500">NIM tidak bisa diubah saat edit</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="student-name"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Nama Lengkap *
                    </label>
                    <input
                      id="student-name"
                      type="text"
                      value={studentForm.fullName}
                      onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                      placeholder="Contoh: Budi Santoso"
                      maxLength={150}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="student-prodi"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Program Studi *
                    </label>
                    <select
                      id="student-prodi"
                      value={studentForm.prodiCode}
                      onChange={(e) =>
                        setStudentForm({ ...studentForm, prodiCode: e.target.value })
                      }
                      className={inputCls}
                      required
                    >
                      <option value="">Pilih Prodi</option>
                      {prodis
                        .filter((p) => p.isActive)
                        .map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.code} - {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="student-angkatan"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Angkatan *
                    </label>
                    <select
                      id="student-angkatan"
                      value={studentForm.angkatan}
                      onChange={(e) => setStudentForm({ ...studentForm, angkatan: e.target.value })}
                      className={inputCls}
                      required
                    >
                      <option value="">Pilih Angkatan</option>
                      <option value="2023/2024">2023/2024</option>
                      <option value="2024/2025">2024/2025</option>
                      <option value="2025/2026">2025/2026</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="student-email"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="student-email"
                    type="email"
                    value={studentForm.email}
                    onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                    placeholder="Kosongkan untuk auto-generate (nim@student.siak.local)"
                    maxLength={255}
                    className={inputCls}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving
                      ? 'Menyimpan...'
                      : editingStudentId
                        ? 'Update Mahasiswa'
                        : 'Simpan Mahasiswa'}
                  </button>
                </div>
              </form>
            )}

            {/* Form Dosen */}
            {modalTab === 'lecturers' && (
              <form onSubmit={handleLecturerSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="lecturer-nidn"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      NIDN *
                    </label>
                    <input
                      id="lecturer-nidn"
                      type="text"
                      value={lecturerForm.nidn}
                      onChange={(e) =>
                        setLecturerForm({ ...lecturerForm, nidn: e.target.value.toUpperCase() })
                      }
                      placeholder="Contoh: 198001001"
                      maxLength={20}
                      className={inputCls}
                      required
                      disabled={!!editingLecturerId}
                    />
                    {editingLecturerId && (
                      <p className="mt-1 text-xs text-slate-500">
                        NIDN tidak bisa diubah saat edit
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="lecturer-name"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Nama Lengkap *
                    </label>
                    <input
                      id="lecturer-name"
                      type="text"
                      value={lecturerForm.fullName}
                      onChange={(e) =>
                        setLecturerForm({ ...lecturerForm, fullName: e.target.value })
                      }
                      placeholder="Contoh: Dr. Siti Rahayu"
                      maxLength={150}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="lecturer-prodi"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Program Studi *
                  </label>
                  <select
                    id="lecturer-prodi"
                    value={lecturerForm.prodiCode}
                    onChange={(e) =>
                      setLecturerForm({ ...lecturerForm, prodiCode: e.target.value })
                    }
                    className={inputCls}
                    required
                  >
                    <option value="">Pilih Prodi</option>
                    {prodis
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="lecturer-email"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="lecturer-email"
                    type="email"
                    value={lecturerForm.email}
                    onChange={(e) => setLecturerForm({ ...lecturerForm, email: e.target.value })}
                    placeholder="Kosongkan untuk auto-generate (nidn@siak.local)"
                    maxLength={255}
                    className={inputCls}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan...' : editingLecturerId ? 'Update Dosen' : 'Simpan Dosen'}
                  </button>
                </div>
              </form>
            )}

            {/* Form Ruangan */}
            {modalTab === 'rooms' && (
              <form onSubmit={handleRoomSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="room-code"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Kode Ruangan *
                    </label>
                    <input
                      id="room-code"
                      type="text"
                      value={roomForm.code}
                      onChange={(e) =>
                        setRoomForm({ ...roomForm, code: e.target.value.toUpperCase() })
                      }
                      placeholder="Contoh: R.301"
                      maxLength={20}
                      className={inputCls}
                      required
                      disabled={!!editingRoomId}
                    />
                    {editingRoomId && (
                      <p className="mt-1 text-xs text-slate-500">
                        Kode tidak bisa diubah saat edit
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="room-name"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Nama Ruangan *
                    </label>
                    <input
                      id="room-name"
                      type="text"
                      value={roomForm.name}
                      onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                      placeholder="Contoh: Ruang 301"
                      maxLength={100}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="room-capacity"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Kapasitas *
                    </label>
                    <input
                      id="room-capacity"
                      type="number"
                      min={1}
                      value={roomForm.capacity}
                      onChange={(e) =>
                        setRoomForm({ ...roomForm, capacity: Number(e.target.value) })
                      }
                      className={inputCls}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="room-faculty"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Fakultas *
                    </label>
                    <select
                      id="room-faculty"
                      value={roomForm.facultyCode}
                      onChange={(e) => setRoomForm({ ...roomForm, facultyCode: e.target.value })}
                      className={inputCls}
                      required
                    >
                      <option value="">Pilih Fakultas</option>
                      {adminFaculties
                        .filter((f) => f.isActive)
                        .map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.code} - {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center">
                  <label htmlFor="room-active" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="room-active"
                      type="checkbox"
                      checked={roomForm.isActive}
                      onChange={(e) => setRoomForm({ ...roomForm, isActive: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700">Aktif</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan...' : editingRoomId ? 'Update Ruangan' : 'Simpan Ruangan'}
                  </button>
                </div>
              </form>
            )}

            {/* Form Prodi (Admin Akademik) */}
            {modalTab === 'prodi-akademik' && (
              <form onSubmit={handleAkademikProdiSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="ak-prodi-code"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Kode Prodi *
                    </label>
                    <input
                      id="ak-prodi-code"
                      type="text"
                      value={akademikProdiForm.code}
                      onChange={(e) =>
                        setAkademikProdiForm({
                          ...akademikProdiForm,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="Contoh: TI, SI"
                      maxLength={10}
                      className={inputCls}
                      required
                      disabled={!!editingAkademikProdiId}
                    />
                    {editingAkademikProdiId && (
                      <p className="mt-1 text-xs text-slate-500">
                        Kode tidak bisa diubah saat edit
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="ak-prodi-name"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Nama Prodi *
                    </label>
                    <input
                      id="ak-prodi-name"
                      type="text"
                      value={akademikProdiForm.name}
                      onChange={(e) =>
                        setAkademikProdiForm({ ...akademikProdiForm, name: e.target.value })
                      }
                      placeholder="Contoh: Teknik Informatika"
                      maxLength={100}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="ak-prodi-faculty"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Fakultas *
                    </label>
                    <select
                      id="ak-prodi-faculty"
                      value={akademikProdiForm.facultyCode}
                      onChange={(e) =>
                        setAkademikProdiForm({
                          ...akademikProdiForm,
                          facultyCode: e.target.value,
                        })
                      }
                      className={inputCls}
                      required
                    >
                      <option value="">Pilih Fakultas</option>
                      {adminFaculties
                        .filter((f) => f.isActive)
                        .map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.code} - {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="ak-prodi-degree"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Jenjang *
                    </label>
                    <select
                      id="ak-prodi-degree"
                      value={akademikProdiForm.degree}
                      onChange={(e) =>
                        setAkademikProdiForm({
                          ...akademikProdiForm,
                          degree: e.target.value as CreateProdiInput['degree'],
                        })
                      }
                      className={inputCls}
                      required
                    >
                      <option value="S1">S1</option>
                      <option value="S2">S2</option>
                      <option value="S3">S3</option>
                      <option value="D3">D3</option>
                      <option value="D4">D4</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="ak-prodi-accreditation"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Akreditasi
                    </label>
                    <input
                      id="ak-prodi-accreditation"
                      type="text"
                      value={akademikProdiForm.accreditation}
                      onChange={(e) =>
                        setAkademikProdiForm({
                          ...akademikProdiForm,
                          accreditation: e.target.value,
                        })
                      }
                      placeholder="Contoh: A, B, Unggul"
                      maxLength={20}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-end">
                    <label
                      htmlFor="ak-prodi-active"
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        id="ak-prodi-active"
                        type="checkbox"
                        checked={akademikProdiForm.isActive}
                        onChange={(e) =>
                          setAkademikProdiForm({
                            ...akademikProdiForm,
                            isActive: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                      />
                      <span className="text-sm text-slate-700">Aktif</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving
                      ? 'Menyimpan...'
                      : editingAkademikProdiId
                        ? 'Update Prodi'
                        : 'Simpan Prodi'}
                  </button>
                </div>
              </form>
            )}

            {/* Form Mata Kuliah */}
            {modalTab === 'courses' && (
              <form onSubmit={handleCourseSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="course-code"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Kode Mata Kuliah *
                    </label>
                    <input
                      id="course-code"
                      type="text"
                      value={courseForm.code}
                      onChange={(e) =>
                        setCourseForm({ ...courseForm, code: e.target.value.toUpperCase() })
                      }
                      placeholder="Contoh: TI101"
                      maxLength={20}
                      className={inputCls}
                      required
                      disabled={!!editingCourseId}
                    />
                    {editingCourseId && (
                      <p className="mt-1 text-xs text-slate-500">
                        Kode tidak bisa diubah saat edit
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="course-name"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Nama Mata Kuliah *
                    </label>
                    <input
                      id="course-name"
                      type="text"
                      value={courseForm.name}
                      onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                      placeholder="Contoh: Algoritma dan Pemrograman"
                      maxLength={150}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="course-credits"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      SKS *
                    </label>
                    <input
                      id="course-credits"
                      type="number"
                      min={1}
                      max={6}
                      value={courseForm.credits}
                      onChange={(e) =>
                        setCourseForm({ ...courseForm, credits: Number(e.target.value) })
                      }
                      className={inputCls}
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <p className="text-xs text-slate-500">SKS maksimal 6</p>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="course-description"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Deskripsi
                  </label>
                  <textarea
                    id="course-description"
                    value={courseForm.description}
                    onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                    rows={3}
                    placeholder="Deskripsi singkat mata kuliah"
                    className={inputCls}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving
                      ? 'Menyimpan...'
                      : editingCourseId
                        ? 'Update Mata Kuliah'
                        : 'Simpan Mata Kuliah'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
