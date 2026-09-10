import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  getMyClasses,
  getMySubmission,
  submitSchedule,
  getClassAvailability,
  setClassSchedule,
  clearClassSchedule,
} from '../lib/api';
import { ApiError } from '../lib/api';
import type { MyClass, ScheduleSubmission, ClassAvailability } from '../lib/types';

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
  // Modal "Atur Jadwal"
  const [scheduleFor, setScheduleFor] = useState<MyClass | null>(null);
  const [schedDay, setSchedDay] = useState<number>(1);
  const [schedStart, setSchedStart] = useState<string>('08:00');
  const [schedEnd, setSchedEnd] = useState<string>('09:50');
  const [availability, setAvailability] = useState<ClassAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  /** "HH:MM" → menit sejak 00:00 */
  const minutesOf = useCallback((t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m ?? 0);
  }, []);
  /** menit → "HH:MM" */
  const formatTime = useCallback((mins: number): string => {
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }, []);

  /** Durasi blok = SKS × 50 menit (umum SIAKAD). */
  const durationMin = useCallback((credits: number): number => Math.max(credits, 1) * 50, []);

  /** Auto-fill jam selesai dari start + SKS (hanya display). */
  const endFor = useCallback(
    (start: string, credits: number): string => {
      return formatTime(Math.min(minutesOf(start) + durationMin(credits), 18 * 60));
    },
    [formatTime, minutesOf, durationMin],
  );

  // Buka modal "Atur Jadwal" utk kelas tertentu → auto-check jam awal.
  const openScheduleModal = useCallback(
    (cls: MyClass) => {
      setScheduleFor(cls);
      setSchedDay(1);
      setSchedStart('08:00');
      const end = endFor('08:00', cls.credits);
      setSchedEnd(end);
      setAvailability(null);
      setModalError(null);
      setChecking(true);
      getClassAvailability(cls.id, { day: 1, start: '08:00' })
        .then((a) => {
          setAvailability(a);
          setChecking(false);
        })
        .catch((err: unknown) => {
          setModalError(err instanceof ApiError ? err.message : 'Gagal memeriksa ketersediaan');
          setChecking(false);
        });
    },
    [endFor],
  );

  // Tutup modal.
  const closeScheduleModal = useCallback(() => {
    setScheduleFor(null);
    setAvailability(null);
    setModalError(null);
    setChecking(false);
    setSaving(false);
  }, []);

  // Saat hari/jam berubah → hitung ulang jam selesai + cek ketersediaan (Cek 1 & 2).
  const onDayChange = useCallback(
    (d: number) => {
      setSchedDay(d);
      if (!scheduleFor) return;
      const end = endFor(schedStart, scheduleFor.credits);
      setSchedEnd(end);
      setChecking(true);
      setModalError(null);
      getClassAvailability(scheduleFor.id, { day: d, start: schedStart })
        .then((a) => {
          setAvailability(a);
          setChecking(false);
        })
        .catch((err: unknown) => {
          setModalError(err instanceof ApiError ? err.message : 'Gagal memeriksa ketersediaan');
          setChecking(false);
        });
    },
    [scheduleFor, schedStart, endFor],
  );

  const onStartChange = useCallback(
    (s: string) => {
      setSchedStart(s);
      if (!scheduleFor) return;
      const end = endFor(s, scheduleFor.credits);
      setSchedEnd(end);
      setChecking(true);
      setModalError(null);
      getClassAvailability(scheduleFor.id, { day: schedDay, start: s })
        .then((a) => {
          setAvailability(a);
          setChecking(false);
        })
        .catch((err: unknown) => {
          setModalError(err instanceof ApiError ? err.message : 'Gagal memeriksa ketersediaan');
          setChecking(false);
        });
    },
    [scheduleFor, schedDay, endFor],
  );

  // Simpan jadwal (PUT /dosen/my-classes/:id/schedule) → re-fetch classes → kalender auto-update.
  const handleSaveSchedule = useCallback(async () => {
    if (!scheduleFor || !availability || !availability.ok) return;
    setSaving(true);
    setModalError(null);
    try {
      await setClassSchedule(scheduleFor.id, { dayOfWeek: schedDay, startTime: schedStart });
      await load();
      closeScheduleModal();
    } catch (err: unknown) {
      setModalError(
        err instanceof ApiError ? err.message : 'Gagal menyimpan jadwal. Silakan coba lagi.',
      );
      if (err instanceof ApiError && err.status === 409) {
        // Backend return konflik → refresh availability supaya pesan akurat
        try {
          const a = await getClassAvailability(scheduleFor.id, {
            day: schedDay,
            start: schedStart,
          });
          setAvailability(a);
        } catch {
          // abaikan
        }
      }
    } finally {
      setSaving(false);
    }
  }, [scheduleFor, availability, schedDay, schedStart, load, closeScheduleModal]);

  // Hapus jadwal (DELETE /dosen/my-classes/:id/schedule) → re-fetch.
  const handleClearSchedule = useCallback(
    async (cls: MyClass) => {
      if (cls.id === null) return;
      if (!window.confirm(`Hapus jadwal ${cls.courseName} (kelas ${cls.classCode})?`)) return;
      setError(null);
      try {
        await clearClassSchedule(cls.id);
        await load();
      } catch (err: unknown) {
        setError(err instanceof ApiError ? err.message : 'Gagal menghapus jadwal');
      }
    },
    [load],
  );

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

  // Panel kiri: kelas yang SUDAH terjadwal (hijau) tampil lebih dulu, sisanya di bawah.
  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => {
      const aScheduled = a.dayOfWeek && a.startTime ? 1 : 0;
      const bScheduled = b.dayOfWeek && b.startTime ? 1 : 0;
      return bScheduled - aScheduled;
    });
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
              {sortedClasses.map((cls) => {
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
                            cls.dayOfWeek && cls.startTime ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {cls.courseName}
                        </h4>
                        {/* Kelas - Angkatan - SKS */}
                        <p className="text-xs text-slate-500 truncate">
                          {cls.classCode} - {cls.semesterCode.split('-')[0] || cls.semesterCode} -{' '}
                          {cls.credits} SKS
                        </p>
                        {/* Ruangan */}
                        <p className="text-xs text-slate-400 truncate">{cls.room ?? '—'}</p>
                        {cls.dayOfWeek && cls.startTime ? (
                          <p className="text-xs font-medium text-green-700 mt-1">
                            {DAY_LABELS[cls.dayOfWeek - 1]} {cls.startTime}–{cls.endTime}
                          </p>
                        ) : (
                          <p className="text-xs text-red-500 mt-1">Belum Terjadwal</p>
                        )}
                      </div>
                    </div>
                    {cls.dayOfWeek && cls.startTime ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">
                          {cls.schedules.length} pertemuan
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openScheduleModal(cls);
                            }}
                            className="text-[11px] font-medium px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleClearSchedule(cls);
                            }}
                            className="text-[11px] font-medium px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openScheduleModal(cls);
                        }}
                        className="mt-2 w-full text-xs font-semibold px-3 py-1.5 rounded-md bg-primary-600 text-white hover:bg-primary-700 shadow-sm"
                      >
                        Atur Jadwal
                      </button>
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

      {/* ===== MODAL: Atur Jadwal ===== */}
      {scheduleFor && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={closeScheduleModal}
          role="dialog"
          aria-modal="true"
          aria-label="Atur Jadwal"
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-primary-50 to-white">
              <h3 className="text-base font-semibold text-slate-900">Atur Jadwal</h3>
              <p className="text-xs text-slate-500 mt-0.5">{scheduleFor.courseName}</p>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Info Matkul (Read-Only) */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-lg py-2 px-1">
                  <p className="text-[10px] uppercase text-slate-400">Matkul</p>
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {scheduleFor.courseName}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2 px-1">
                  <p className="text-[10px] uppercase text-slate-400">SKS</p>
                  <p className="text-xs font-semibold text-slate-800">{scheduleFor.credits} SKS</p>
                </div>
                <div className="bg-slate-50 rounded-lg py-2 px-1">
                  <p className="text-[10px] uppercase text-slate-400">Kelas</p>
                  <p className="text-xs font-semibold text-slate-800">{scheduleFor.classCode}</p>
                </div>
              </div>

              {/* Ruangan (Read-Only) */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Ruangan</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                    {scheduleFor.room ? (
                      <>Ditetapkan oleh Sistem: {scheduleFor.room}</>
                    ) : (
                      'Belum ada ruangan'
                    )}
                  </span>
                </div>
              </div>

              {/* Pilihan Waktu */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hari</label>
                  <select
                    value={schedDay}
                    onChange={(e) => onDayChange(Number(e.target.value))}
                    className="w-full px-2 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    {DAY_LABELS.map((d, i) => (
                      <option key={d} value={i + 1}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Jam Mulai</label>
                  <select
                    value={schedStart}
                    onChange={(e) => onStartChange(e.target.value)}
                    className="w-full px-2 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Jam Selesai
                  </label>
                  <input
                    type="text"
                    value={schedEnd}
                    readOnly
                    className="w-full px-2 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-md text-sm"
                  />
                </div>
              </div>

              {/* Status validasi real-time */}
              {checking ? (
                <p className="text-xs text-slate-400">Memeriksa ketersediaan...</p>
              ) : availability ? (
                availability.ok ? (
                  <p className="text-xs font-medium text-green-600">
                    ✓ Waktu ini tersedia. Ruangan {availability.room ?? '—'} kosong dan jadwal
                    Bapak/Ibu tidak bentrok.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {availability.conflicts.map((c, i) => (
                      <li key={i} className="text-xs text-red-600">
                        🔴{' '}
                        {c.kind === 'dosen'
                          ? `Bapak/Ibu sudah memiliki jadwal mengajar ${c.courseName} (${c.classCode}) di waktu ini.`
                          : `Ruang ${c.room ?? ''} sudah digunakan oleh kelas lain (${c.courseName} ${c.classCode}) pada waktu ini. Silakan pilih hari atau jam yang berbeda.`}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                modalError && <p className="text-xs text-red-600">{modalError}</p>
              )}

              {/* Saran Waktu */}
              {availability && availability.recommendations.length > 0 && (
                <div className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  💡 Rekomendasi Waktu Kosong untuk Ruang {scheduleFor.room ?? '—'}:{' '}
                  {availability.recommendations
                    .slice(0, 3)
                    .map((r) => `${DAY_LABELS[r.day - 1]} (${r.startTime}–${r.endTime})`)
                    .join(', ')}
                </div>
              )}

              {modalError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                  {modalError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={closeScheduleModal}
                className="text-sm font-medium px-4 py-2 rounded-md text-slate-500 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSchedule()}
                disabled={saving || checking || !availability || !availability.ok}
                className={`px-4 py-2 rounded-md text-sm font-semibold shadow-sm transition-colors ${
                  availability && availability.ok
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
