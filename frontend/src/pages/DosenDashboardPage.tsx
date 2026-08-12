import { useParams } from 'react-router';
import { DosenSelectMK } from './DosenSelectMK';
import { DosenSchedule } from './DosenSchedule';
import { DosenAttendance } from './DosenAttendance';
import { DosenGuidance } from './DosenGuidance';
import { DosenSubstitute } from './DosenSubstitute';
import { DosenGrades } from './DosenGrades';

/**
 * Dashboard Dosen (T3.7) — container modul dosen:
 * Pilih MK, Jadwal, Absensi, Bimbingan, Substitute, Nilai (permission grade.input).
 *
 * Keluhan #5: menu dashboard dosen dipindah dari tab teks horizontal ke SIDEBAR ikon
 * (AppLayout MENU_ITEMS → route /dosen/:tab). Tab aktif dibaca dari URL sehingga
 * sidebar NavLink bisa menandai item aktif dan browser back/forward berfungsi.
 */
const TABS = [
  { id: 'pilih-mk', component: DosenSelectMK },
  { id: 'jadwal', component: DosenSchedule },
  { id: 'absensi', component: DosenAttendance },
  { id: 'bimbingan', component: DosenGuidance },
  { id: 'substitute', component: DosenSubstitute },
  { id: 'nilai', component: DosenGrades },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function DosenDashboardPage() {
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: TabId = TABS.some((t) => t.id === tab) ? (tab as TabId) : 'pilih-mk';
  const ActiveComponent = TABS.find((t) => t.id === activeTab)!.component;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Dosen</h1>
        <p className="text-slate-600 mt-1">
          Kelola MK yang diajar, absensi, bimbingan, substitute, dan nilai
        </p>
      </div>

      {/* Konten modul aktif — navigasi lewat sidebar ikon (keluhan #5) */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
