import { useParams } from 'react-router';
import { useState, useEffect } from 'react';
import { DosenSelectMK } from './DosenSelectMK';
import { DosenSchedule } from './DosenSchedule';
import { DosenAttendance } from './DosenAttendance';
import { DosenGuidance } from './DosenGuidance';
import { DosenSubstitute } from './DosenSubstitute';
import { DosenGrades } from './DosenGrades';
import { getMyClasses } from '../lib/api';
import type { ClassSchedule } from '../lib/types';

/**
 * Dashboard Dosen (T3.7) — container modul dosen:
 * Pilih MK, Jadwal, Absensi, Bimbingan, Substitute, Nilai (permission grade.input).
 *
 * Keluhan #5: menu dashboard dosen dipindah dari tab teks horizontal ke SIDEBAR ikon
 * (AppLayout MENU_ITEMS → route /dosen/:tab). Tab aktif dibaca dari URL sehingga
 * sidebar NavLink bisa menandai item aktif dan browser back/forward berfungsi.
 *
 * Perbaikan: header "Dashboard Dosen" hanya tampil di root `/dosen` (overview).
 * Sub-tab langsung render konten tanpa header container.
 */
const TABS = [
  { id: 'pilih-mk', component: DosenSelectMK },
  { id: 'jadwal', component: DosenSchedule },
  { id: 'absensi', component: DosenAttendance },
  { id: 'bimbingan', component: DosenGuidance },
  { id: 'substitute', component: DosenSubstitute },
  { id: 'nilai', component: DosenGrades },
] as const;

interface MyClassSummary {
  id: number;
  classCode: string;
  courseCode: string;
  courseName: string;
  schedules: ClassSchedule[];
}

export function DosenDashboardPage() {
  const { tab } = useParams<{ tab?: string }>();
  // Jika tab valid → render sub-komponen langsung (tanpa header dashboard)
  if (tab && TABS.some((t) => t.id === tab)) {
    const ActiveComponent = TABS.find((t) => t.id === tab)!.component;
    return <ActiveComponent />;
  }

  // Root `/dosen` (tanpa tab) → tampilkan dashboard overview dengan header
  // const activeTab: TabId = 'pilih-mk'; // default fallback jika tab tidak dikenal (unused)
  // const ActiveComponent = TABS.find((t) => t.id === activeTab)!.component; // unused

  // Fetch ringkasan kelas untuk dashboard overview
  const [myClasses, setMyClasses] = useState<MyClassSummary[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  useEffect(() => {
    getMyClasses()
      .then((res) => setMyClasses(res.items))
      .catch(() => setMyClasses([]))
      .finally(() => setLoadingClasses(false));
  }, []);

  const totalClasses = myClasses.length;
  const totalMeetings = myClasses.reduce((sum, c) => sum + c.schedules.length, 0);
  const completedMeetings = myClasses.reduce(
    (sum, c) => sum + c.schedules.filter((s) => s.isCompleted).length,
    0,
  );
  const upcomingMeetings = totalMeetings - completedMeetings;

  return (
    <div className="space-y-6">
      {/* Header Dashboard — hanya di root `/dosen` */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Dosen</h1>
        <p className="text-slate-600 mt-1">
          Ringkasan aktivitas mengajar: kelas, jadwal, absensi, dan bimbingan
        </p>
      </div>

      {/* Ringkasan Kartu (Important Info) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-primary-500">
          <p className="text-sm font-medium text-slate-600">Kelas Diampu</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{totalClasses}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-blue-500">
          <p className="text-sm font-medium text-slate-600">Total Pertemuan</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{totalMeetings}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-green-500">
          <p className="text-sm font-medium text-slate-600">Pertemuan Selesai</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{completedMeetings}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-amber-500">
          <p className="text-sm font-medium text-slate-600">Akan Datang</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{upcomingMeetings}</p>
        </div>
      </div>

      {/* Aksi Cepat */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Aksi Cepat</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <a
            href="/dosen/pilih-mk"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <svg className="h-6 w-6 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            <div>
              <p className="font-medium text-slate-900">Pilih MK</p>
              <p className="text-sm text-slate-500">Ajukan mata kuliah yang diampu</p>
            </div>
          </a>
          <a
            href="/dosen/jadwal"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <svg className="h-6 w-6 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <div>
              <p className="font-medium text-slate-900">Klaim Jadwal</p>
              <p className="text-sm text-slate-500">Pilih kelas yang akan diampu</p>
            </div>
          </a>
          <a
            href="/dosen/absensi"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <svg className="h-6 w-6 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p className="font-medium text-slate-900">Input Absensi</p>
              <p className="text-sm text-slate-500">Isi kehadiran pertemuan</p>
            </div>
          </a>
          <a
            href="/dosen/bimbingan"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <svg className="h-6 w-6 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <div>
              <p className="font-medium text-slate-900">Bimbingan</p>
              <p className="text-sm text-slate-500">Kelola mahasiswa binaan</p>
            </div>
          </a>
          <a
            href="/dosen/nilai"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <svg className="h-6 w-6 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
            <div>
              <p className="font-medium text-slate-900">Input Nilai</p>
              <p className="text-sm text-slate-500">Isi dan ubah nilai mahasiswa</p>
            </div>
          </a>
          <a
            href="/dosen/substitute"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <svg className="h-6 w-6 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" /></svg>
            <div>
              <p className="font-medium text-slate-900">Substitute</p>
              <p className="text-sm text-slate-500">Kelola penggantian jadwal</p>
            </div>
          </a>
        </div>
      </div>

      {/* Daftar Kelas Terbaru */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Kelas yang Diampu</h2>
        </div>
        {loadingClasses ? (
          <div className="p-6 text-center text-slate-500">Memuat...</div>
        ) : myClasses.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            Belum ada kelas yang diampu. <a href="/dosen/jadwal" className="text-primary-600 hover:underline">Klaim jadwal di sini</a>.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {myClasses.slice(0, 5).map((cls) => (
              <div key={cls.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{cls.courseName}</p>
                    <p className="text-sm text-slate-500">{cls.classCode} • {cls.courseCode}</p>
                  </div>
                  <a
                    href="/dosen/absensi"
                    className="text-sm text-primary-600 hover:underline"
                  >
                    Absensi
                  </a>
                </div>
              </div>
            ))}
            {myClasses.length > 5 && (
              <div className="p-4 text-center border-t border-slate-100">
                <a href="/dosen/jadwal" className="text-sm text-primary-600 hover:underline">
                  Lihat semua {myClasses.length} kelas →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
