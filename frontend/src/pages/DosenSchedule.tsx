import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getMyClasses, getMySubmission, submitSchedule } from '../lib/api';
import { ApiError } from '../lib/api';
import type { MyClass, ScheduleSubmission } from '../lib/types';

const DAY_LABELS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_COL_MAP: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };

// Every 30 min from 07:00 to 18:00 → 22 rows (row 2..23 in grid, row 1 = header)
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 17; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
TIME_SLOTS.push('18:00');

/** Map "HH:MM" to the nearest slot index (0-based from 07:00) */
function timeToSlotIdx(t: string): number {
  const [h, m] = t.split(':').map(Number);
  const totalMin = h * 60 + m;
  const startMin = 7 * 60;
  return Math.floor((totalMin - startMin) / 30);
}

// Distinct pastel colors for class blocks
const BLOCK_COLORS = [
  {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-blue-800',
    badge: 'bg-blue-200 text-blue-700',
  },
  {
    bg: 'bg-emerald-100',
    border: 'border-emerald-300',
    text: 'text-emerald-800',
    badge: 'bg-emerald-200 text-emerald-700',
  },
  {
    bg: 'bg-violet-100',
    border: 'border-violet-300',
    text: 'text-violet-800',
    badge: 'bg-violet-200 text-violet-700',
  },
  {
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    text: 'text-amber-800',
    badge: 'bg-amber-200 text-amber-700',
  },
  {
    bg: 'bg-rose-100',
    border: 'border-rose-300',
    text: 'text-rose-800',
    badge: 'bg-rose-200 text-rose-700',
  },
  {
    bg: 'bg-cyan-100',
    border: 'border-cyan-300',
    text: 'text-cyan-800',
    badge: 'bg-cyan-200 text-cyan-700',
  },
  {
    bg: 'bg-fuchsia-100',
    border: 'border-fuchsia-300',
    text: 'text-fuchsia-800',
    badge: 'bg-fuchsia-200 text-fuchsia-700',
  },
  {
    bg: 'bg-lime-100',
    border: 'border-lime-300',
    text: 'text-lime-800',
    badge: 'bg-lime-200 text-lime-700',
  },
];

/**
 * Jadwal mengajar dosen — 2-panel layout.
 * Panel Kiri: daftar mata kuliah yang di-plot (to-do list cards).
 * Panel Kanan: kalender mingguan visual (Senin-Sabtu, 07:00-18:00).
 * Data dari GET /dosen/my-classes.
 */
export function DosenSchedule() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submission, setSubmission] = useState<ScheduleSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getMyClasses();
      setClasses(res.items);
    } catch {
      setError('Gagal memuat jadwal mengajar');
    } finally {
      setIsLoading(false);
    }
    try {
      const sub = await getMySubmission();
      setSubmission(sub);
    } catch {
      // status pengajuan gagal dimuat — tidak memblokir tampilan jadwal
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ---- Derived data ---- */
  const summary = useMemo(() => {
    if (classes.length === 0) return null;

    const semMap = new Map<
      number,
      { id: number; code: string; name: string; totalSks: number; scheduledSks: number }
    >();
    let totalSksAll = 0;
    let scheduledSksAll = 0;

    for (const cls of classes) {
      const sem = semMap.get(cls.semesterId) ?? {
        id: cls.semesterId,
        code: cls.semesterCode,
        name: cls.semesterName,
        totalSks: 0,
        scheduledSks: 0,
      };
      sem.totalSks += cls.credits;
      if (cls.schedules.length > 0) sem.scheduledSks += cls.credits;
      semMap.set(cls.semesterId, sem);

      totalSksAll += cls.credits;
      if (cls.schedules.length > 0) scheduledSksAll += cls.credits;
    }

    const semesters = Array.from(semMap.values());
    const activeSemester =
      semesters.length === 1
        ? semesters[0]
        : (semesters.find((s) => s.code.includes('-1')) ?? semesters[0]);

    const allScheduled = scheduledSksAll === totalSksAll;
    const noneScheduled = scheduledSksAll === 0;

    // Status pengajuan: prioritas dari backend (submission).
    // - Kalau belum ada submission (null): status = draft/proses (pakai kelengkapan lokal), TAMPILKAN tombol ajukan.
    // - Kalau ada submission: ikuti status backend (awaiting/approved/rejected).
    let statusPengajuan: 'disetujui' | 'draft' | 'proses' | 'ditolak';
    if (submission) {
      if (submission.status === 'approved') statusPengajuan = 'disetujui';
      else if (submission.status === 'rejected') statusPengajuan = 'ditolak';
      else if (submission.status === 'awaiting') statusPengajuan = 'proses';
      else statusPengajuan = 'draft';
    } else {
      // Belum ada submission sama sekali
      if (noneScheduled) statusPengajuan = 'draft';
      else if (allScheduled)
        statusPengajuan = 'proses'; // lengkap, siap diajukan
      else statusPengajuan = 'proses'; // sebagian
    }

    return {
      totalSks: totalSksAll,
      scheduledSks: scheduledSksAll,
      unscheduledSks: totalSksAll - scheduledSksAll,
      classCount: classes.length,
      activeSemester,
      statusPengajuan,
    };
  }, [classes, submission]);

  // Auto-select first class on load
  useEffect(() => {
    if (classes.length > 0 && selectedId === null) {
      setSelectedId(classes[0].id);
    }
  }, [classes, selectedId]);

  /** Assign colors to each class by courseCode */
  const colorMap = useMemo(() => {
    const map = new Map<string, (typeof BLOCK_COLORS)[number]>();
    let idx = 0;
    for (const cls of classes) {
      if (!map.has(cls.courseCode)) {
        map.set(cls.courseCode, BLOCK_COLORS[idx % BLOCK_COLORS.length]);
        idx++;
      }
    }
    return map;
  }, [classes]);

  /** Scheduled classes → calendar block positions */
  const calendarBlocks = useMemo(() => {
    const blocks: {
      cls: MyClass;
      gridRow: string;
      gridColumn: string;
      color: (typeof BLOCK_COLORS)[number];
    }[] = [];

    for (const cls of classes) {
      if (!cls.dayOfWeek || !cls.startTime || !cls.endTime) continue;
      const col = DAY_COL_MAP[cls.dayOfWeek];
      if (!col) continue;

      const startSlot = timeToSlotIdx(cls.startTime);
      const endSlot = timeToSlotIdx(cls.endTime);
      const startRow = startSlot + 2; // row 1 = header, row 2 = 07:00
      const endRow = endSlot + 2;

      blocks.push({
        cls,
        gridRow: `${startRow} / ${endRow}`,
        gridColumn: `${col} / ${col + 1}`,
        color: colorMap.get(cls.courseCode) ?? BLOCK_COLORS[0],
      });
    }

    return blocks;
  }, [classes, colorMap]);

  const statusLabels: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700' },
    proses: { label: 'Menunggu Persetujuan Kaprodi', color: 'bg-amber-100 text-amber-700' },
    disetujui: { label: 'Disetujui', color: 'bg-green-100 text-green-700' },
    ditolak: { label: 'Ditolak Kaprodi', color: 'bg-red-100 text-red-700' },
  };

  const handleSubmit = useCallback(async () => {
    if (!summary || summary.unscheduledSks > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitSchedule(summary.activeSemester.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengajukan jadwal');
    } finally {
      setSubmitting(false);
    }
  }, [summary, load]);

  const schedPercent = summary ? Math.round((summary.scheduledSks / summary.totalSks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ===== HEADER & RINGKASAN ===== */}
      {summary && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-primary-50 to-white px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-lg font-bold">
                  {user?.fullName?.charAt(0) ?? 'D'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {user?.fullName ?? 'Dosen'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {summary.activeSemester.name || summary.activeSemester.code}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full ${statusLabels[summary.statusPengajuan].color}`}
                >
                  {statusLabels[summary.statusPengajuan].label}
                </span>
                {((summary.statusPengajuan === 'proses' && !submission) ||
                  summary.statusPengajuan === 'ditolak') &&
                  summary.unscheduledSks === 0 && (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Mengirim...' : 'Ajukan Persetujuan'}
                    </button>
                  )}
                {summary.statusPengajuan === 'ditolak' && submission?.reviewNote && (
                  <p className="text-xs text-red-600">Catatan: {submission.reviewNote}</p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Beban Mengajar SKS</span>
              <span className="text-sm text-slate-500">
                {summary.scheduledSks}/{summary.totalSks} SKS terjadwal
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-primary-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${schedPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
              <span>
                {summary.classCount} kelas • {summary.scheduledSks} SKS terjadwal
              </span>
              <span>
                {summary.unscheduledSks > 0
                  ? `${summary.unscheduledSks} SKS belum dijadwalkan`
                  : 'Semua SKS sudah terjadwal'}
              </span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-center text-slate-500">
          Memuat jadwal mengajar...
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-center text-slate-500">
          Belum ada kelas yang diampu.
        </div>
      ) : (
        /* ===== 2-PANEL LAYOUT ===== */
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* --- Panel Kiri: To-Do List --- */}
          <div className="w-full lg:w-72 shrink-0">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Daftar Mata Kuliah
            </h3>
            <div className="space-y-2">
              {classes.map((cls) => {
                const hasSchedules = cls.schedules.length > 0;

                return (
                  <div
                    key={cls.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(cls.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(cls.id);
                    }}
                    className={`w-full text-left rounded-lg border-2 p-3 transition-all duration-150 cursor-pointer ${
                      cls.id === selectedId
                        ? 'border-primary-500 ring-2 ring-primary-200 bg-white shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            hasSchedules ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {cls.courseName}
                        </h4>
                        <p className="text-xs text-slate-500 truncate">
                          {cls.classCode} • {cls.credits} SKS
                        </p>
                        {cls.room && <p className="text-xs text-slate-400 truncate">{cls.room}</p>}
                        {!hasSchedules && (
                          <p className="text-xs text-red-500 mt-1">Belum dijadwalkan</p>
                        )}
                      </div>
                    </div>
                    {hasSchedules && (
                      <div className="mt-2 text-xs text-slate-500">
                        {cls.schedules.length} pertemuan terjadwal
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* --- Panel Kanan: Kalender Mingguan --- */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Jadwal Mingguan</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {DAY_LABELS[0]}–{DAY_LABELS[5]} • 07:00–18:00
              </p>
            </div>

            <div className="overflow-x-auto max-h-[620px]">
              <div
                className="grid relative min-w-[720px]"
                style={{
                  gridTemplateColumns: '56px repeat(6, 1fr)',
                  gridTemplateRows: `36px repeat(${TIME_SLOTS.length - 1}, minmax(28px, auto))`,
                }}
              >
                {/* — Header row: day names — */}
                <div className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 flex items-center justify-center">
                  Jam
                </div>
                {DAY_LABELS.map((d) => (
                  <div
                    key={d}
                    className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 border-l border-slate-100 text-xs font-medium text-slate-700 flex items-center justify-center"
                  >
                    {d}
                  </div>
                ))}

                {/* — Time labels (column 1) — */}
                {TIME_SLOTS.map((t, i) => (
                  <div
                    key={t}
                    className="text-[11px] text-slate-400 border-t border-slate-100 flex items-center justify-center pr-1"
                    style={{ gridRow: i + 2, gridColumn: 1 }}
                  >
                    {i % 2 === 0 ? t : '\u00A0'}
                  </div>
                ))}

                {/* — Grid cells (background) — */}
                {TIME_SLOTS.slice(0, -1).map((_, rowIdx) =>
                  DAY_LABELS.map((_, colIdx) => (
                    <div
                      key={`${rowIdx}-${colIdx}`}
                      className="border-t border-l border-slate-100"
                      style={{ gridRow: rowIdx + 2, gridColumn: colIdx + 2 }}
                    />
                  )),
                )}

                {/* — Scheduled class blocks — */}
                {calendarBlocks.map((block) => (
                  <div
                    key={block.cls.id}
                    className={`${block.color.bg} ${block.color.border} border rounded-md p-1.5 overflow-hidden cursor-default transition-shadow hover:shadow-md z-10`}
                    style={{
                      gridRow: block.gridRow,
                      gridColumn: block.gridColumn,
                    }}
                    title={`${block.cls.courseName} (${block.cls.classCode})\n${block.cls.startTime}–${block.cls.endTime}\n${block.cls.room ?? ''}`}
                  >
                    <p
                      className={`text-[11px] font-semibold leading-tight ${block.color.text} truncate`}
                    >
                      {block.cls.courseName}
                    </p>
                    <p className={`text-[10px] ${block.color.text} opacity-75 leading-tight`}>
                      {block.cls.classCode}
                      {block.cls.room ? ` • ${block.cls.room}` : ''}
                    </p>
                    <p className={`text-[10px] ${block.color.text} opacity-60 leading-tight`}>
                      {block.cls.startTime}–{block.cls.endTime}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
