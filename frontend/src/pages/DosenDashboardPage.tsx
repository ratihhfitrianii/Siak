import { useState } from 'react';
import { DosenSelectMK } from './DosenSelectMK';
import { DosenSchedule } from './DosenSchedule';
import { DosenAttendance } from './DosenAttendance';
import { DosenGuidance } from './DosenGuidance';
import { DosenSubstitute } from './DosenSubstitute';
import { DosenGrades } from './DosenGrades';

/**
 * Dashboard Dosen (T3.7) — container tab untuk modul dosen:
 * Pilih MK, Jadwal, Absensi, Bimbingan, Substitute, Nilai (permission grade.input).
 */
export function DosenDashboardPage() {
  const [activeTab, setActiveTab] = useState('pilih_mk');

  const tabs = [
    { id: 'pilih_mk', label: 'Pilih MK', component: DosenSelectMK },
    { id: 'jadwal', label: 'Jadwal', component: DosenSchedule },
    { id: 'absensi', label: 'Absensi', component: DosenAttendance },
    { id: 'bimbingan', label: 'Bimbingan', component: DosenGuidance },
    { id: 'substitute', label: 'Substitute', component: DosenSubstitute },
    { id: 'nilai', label: 'Nilai', component: DosenGrades },
  ];

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component ?? tabs[0].component;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Dosen</h1>
        <p className="text-slate-600 mt-1">
          Kelola MK yang diajar, absensi, bimbingan, substitute, dan nilai
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
