import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, apiRequest, downloadKrsPdf, getKrsAccess } from '../lib/api';
import type { AvailableClass, KrsPeriod, MyKrs, MyKrsItem } from '../lib/types';

const DAY_LABELS: Record<number, string> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
  7: 'Minggu',
};

function dayLabel(d: number | null): string {
  return d === null ? '—' : (DAY_LABELS[d] ?? `Hari ${d}`);
}

function timeRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const fmt = (t: string): string => t.slice(0, 5);
  return `${start ? fmt(start) : '?'}–${end ? fmt(end) : '?'}`;
}

const STATUS_LABEL: Record<string, string> = {
  not_filled: 'Belum diisi',
  draft: 'Draft',
  submitted: 'Menunggu persetujuan',
  approved: 'Disetujui',
  rejected: 'Ditolak — perlu perbaikan',
};

/** Jumlah kartu matkul per halaman (keluhan #28 — agar halaman tidak panjang). */
const PAGE_SIZE = 5;

interface CourseGroup {
  key: string;
  course: AvailableClass['course'];
  classes: AvailableClass[];
  lecturerName: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  isMandatory: boolean;
}

/**
 * Halaman KRS mahasiswa (T1.11b) — redesign Gelombang 3 keluhan #28–#30:
 * - Layout 2 kolom: kiri = daftar pilihan matkul (kartu, 5 per halaman), kanan = draft KRS.
 * - Keluhan #29: gabungkan kelas dengan kode+jadwal+dosen SAMA menjadi satu kartu;
 *   hanya tampilkan kombinasi yang berbeda jadwal/dosen; tombol pilih → checkbox.
 * - Keluhan #30: format kartu "Nama MK - Kode | SKS / Dosen | Jadwal / Kuota tersisa".
 */
export function KrsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<KrsPeriod | null>(null);
  const [myKrs, setMyKrs] = useState<MyKrs | null>(null);
  const [available, setAvailable] = useState<AvailableClass[]>([]);
  const [picked, setPicked] = useState<MyKrsItem[]>([]);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [page, setPage] = useState(1);
  // Gerbang pembayaran (keluhan: KRS DIBLOKIR tapi halaman masih bisa diakses) —
  // true = tampilkan layar blokir penuh, bukan hanya error kecil.
  const [blockedByPayment, setBlockedByPayment] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [periodRes, myRes] = await Promise.all([
        apiRequest<KrsPeriod>('/krs/period'),
        apiRequest<MyKrs>('/krs/my'),
      ]);
      setPeriod(periodRes);
      setMyKrs(myRes);
      setPicked(myRes.items);

      let avail: AvailableClass[] = [];
      let paymentBlocked = false;
      if (periodRes.status === 'open') {
        // Cek lunas dulu (satu sumber kebenaran: can_access_krs — tanpa tagihan juga blokir)
        const access = await getKrsAccess(periodRes.semesterId).catch(() => null);
        paymentBlocked = access !== null && !access.canAccess;
        if (!paymentBlocked) {
          try {
            const data = await apiRequest<{ items: AvailableClass[] }>('/krs/available-classes');
            avail = data.items;
          } catch (err) {
            if (err instanceof ApiError && err.code === 'KRS_PERIOD_CLOSED') {
              // period closed, ignore
            } else if (err instanceof ApiError && err.code === 'PAYMENT_UNPAID') {
              paymentBlocked = true;
            } else {
              throw err;
            }
          }
        }
      }
      setAvailable(avail);
      setPage(1);
      setBlockedByPayment(paymentBlocked);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data KRS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = useMemo(() => {
    if (period?.status !== 'open') return true;
    return (
      myKrs?.isLocked === true || myKrs?.status === 'submitted' || myKrs?.status === 'approved'
    );
  }, [period, myKrs]);

  const totalCredits = useMemo(
    () => picked.reduce((sum, it) => sum + it.course.credits, 0),
    [picked],
  );

  // Keluhan #29 — kelompokkan kelas dengan kode matkul + jadwal + dosen yang sama.
  const groups = useMemo<CourseGroup[]>(() => {
    const map = new Map<string, CourseGroup>();
    for (const cls of available) {
      const key = `${cls.course.code}|${cls.dayOfWeek ?? ''}|${cls.startTime ?? ''}|${cls.endTime ?? ''}|${cls.lecturerName ?? ''}`;
      const existing = map.get(key);
      if (existing) {
        existing.classes.push(cls);
      } else {
        map.set(key, {
          key,
          course: cls.course,
          classes: [cls],
          lecturerName: cls.lecturerName,
          dayOfWeek: cls.dayOfWeek,
          startTime: cls.startTime,
          endTime: cls.endTime,
          isMandatory: cls.isMandatory,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.course.code.localeCompare(b.course.code));
  }, [available]);

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageGroups = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const groupPicked = useCallback(
    (g: CourseGroup) => g.classes.some((c) => picked.some((i) => i.id === c.id)),
    [picked],
  );

  const groupQuota = useCallback(
    (g: CourseGroup) => g.classes.reduce((sum, c) => sum + c.quotaLeft, 0),
    [],
  );

  // Checkbox kartu: centang → pilih semua kelas grup (kuota>0); uncentang → hapus semua.
  const toggleGroup = useCallback((g: CourseGroup, checked: boolean) => {
    if (checked) {
      setPicked((prev) => {
        const next = [...prev];
        for (const cls of g.classes) {
          if (cls.quotaLeft <= 0) continue;
          if (!next.some((i) => i.id === cls.id)) {
            next.push({
              id: cls.id,
              classCode: cls.classCode,
              course: cls.course,
              dayOfWeek: cls.dayOfWeek,
              startTime: cls.startTime,
              endTime: cls.endTime,
              room: cls.room,
              lecturerName: cls.lecturerName,
            });
          }
        }
        return next;
      });
    } else {
      const ids = new Set(g.classes.map((c) => c.id));
      setPicked((prev) => prev.filter((i) => !ids.has(i.id)));
    }
  }, []);

  const removeClass = useCallback((classId: number) => {
    setPicked((prev) => prev.filter((i) => i.id !== classId));
  }, []);

  const persist = useCallback(
    async (endpoint: 'draft' | 'submit') => {
      const classIds = picked.map((i) => i.id);
      if (classIds.length === 0) {
        setActionError('Pilih minimal satu mata kuliah terlebih dahulu.');
        return;
      }
      setSaving(endpoint);
      setActionError(null);
      try {
        await apiRequest(`/krs/${endpoint}`, { method: 'POST', body: { classIds } });
        await load();
        setConfirmSubmit(false);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Gagal menyimpan KRS');
        setConfirmSubmit(false);
      } finally {
        setSaving(null);
      }
    },
    [picked, load],
  );

  // Keluhan lama: "download PDF belum berhasil" — tampilkan pesan error bila unduhan gagal.
  const handleDownload = useCallback(async () => {
    setActionError(null);
    try {
      await downloadKrsPdf();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Gagal mengunduh PDF KRS');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-label="Memuat">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  // Keluhan: banner "KRS DIBLOKIR" muncul di Pembayaran tapi halaman ini masih terbuka —
  // sekarang diblokir penuh dengan CTA ke halaman pembayaran.
  if (blockedByPayment) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-lg font-bold tracking-wide text-amber-800">KRS DIBLOKIR</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-amber-700">
          Pengisian KRS tidak dapat dilakukan karena pembayaran semester ini belum lunas. Silakan
          selesaikan pembayaran terlebih dahulu.
        </p>
        <Link
          to="/pembayaran"
          className="mt-4 inline-block rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
        >
          Ke Halaman Pembayaran
        </Link>
      </div>
    );
  }

  const status = myKrs?.status ?? 'not_filled';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Keluhan lama: "KRS yang sudah disetujui bisa di download PDF" — tombol hanya utk approved */}
          {status === 'approved' && (
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="rounded-md border border-primary-300 px-3 py-1 text-xs font-medium text-primary-700 transition hover:bg-primary-50"
            >
              Download PDF
            </button>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              period?.status === 'open'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {period?.status === 'open' ? 'Periode Buka' : 'Periode Tutup'}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              locked ? 'bg-slate-200 text-slate-600' : 'bg-primary-100 text-primary-700'
            }`}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
      </div>

      {myKrs?.status === 'rejected' && myKrs.rejectionReason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">KRS ditolak:</span> {myKrs.rejectionReason} — silakan
          perbaiki lalu kirim ulang.
        </div>
      )}

      {period?.status !== 'open' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Pengisian KRS hanya dapat dilakukan saat periode KRS sedang buka.
        </div>
      )}

      {/* Keluhan #28 — layout 2 kolom: pilihan matkul (kiri) + draft KRS (kanan, sticky) */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* KIRI — daftar mata kuliah (kartu + checkbox + 5 per halaman) */}
        <section className="lg:col-span-3" aria-label="Daftar mata kuliah">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Daftar Mata Kuliah</h2>
              <p className="text-xs text-slate-500">
                Menampilkan {Math.min(groups.length, PAGE_SIZE)} dari {groups.length} matkul
              </p>
            </div>

            {groups.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Tidak ada kelas tersedia untuk prodi Anda pada periode ini.
              </p>
            ) : (
              <>
                <ul className="mt-4 space-y-3">
                  {pageGroups.map((g) => {
                    const checked = groupPicked(g);
                    const quota = groupQuota(g);
                    const full = quota <= 0;
                    return (
                      <li
                        key={g.key}
                        className={`rounded-xl border p-4 transition ${
                          checked
                            ? 'border-primary-300 bg-primary-50/60'
                            : 'border-slate-200 bg-slate-50'
                        } ${full ? 'opacity-60' : ''}`}
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            aria-label={`Pilih ${g.course.name}`}
                            checked={checked}
                            disabled={locked || saving !== null || full}
                            onChange={(e) => toggleGroup(g, e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="min-w-0 flex-1">
                            {/* Keluhan #30 — format kartu: "Nama MK - Kode | SKS" */}
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {g.course.name}{' '}
                                <span className="text-slate-500">— {g.course.code}</span>
                                {g.isMandatory && (
                                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-slate-600">
                                    WAJIB
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-sm font-bold text-slate-900">
                                {g.course.credits} SKS
                              </span>
                            </span>
                            {/* Keluhan #30 — "Nama Dosen | Jadwal" */}
                            <span className="mt-1 flex items-baseline justify-between gap-2">
                              <span className="truncate text-xs text-slate-600">
                                {g.lecturerName ?? 'Dosen: —'}
                              </span>
                              <span className="shrink-0 text-xs font-medium text-slate-700">
                                {dayLabel(g.dayOfWeek)} {timeRange(g.startTime, g.endTime)}
                              </span>
                            </span>
                            {/* Keluhan #30 — "Kuota tersisa" */}
                            <span className="mt-1 block text-xs text-slate-500">
                              Kuota tersisa: {quota}
                            </span>
                            {g.classes.length > 1 && (
                              <span className="mt-1 block text-[10px] text-slate-400">
                                {g.classes.length} kelas (
                                {g.classes.map((c) => c.classCode).join(', ')})
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {/* Keluhan #28 — pagination 5 matkul per halaman */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ← Sebelumnya
                    </button>
                    <span className="text-xs text-slate-500">
                      Halaman {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Berikutnya →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* KANAN — draft KRS (sticky) */}
        <section className="lg:col-span-2" aria-label="Kelas terpilih">
          <div className="rounded-2xl bg-white p-5 shadow-sm lg:sticky lg:top-20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Draft KRS</h2>
              <p className="text-sm text-slate-600">
                Total SKS: <span className="font-bold text-slate-900">{totalCredits}</span>
              </p>
            </div>

            {picked.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Belum ada mata kuliah. Centang dari daftar di sebelah kiri.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {picked.map((it) => (
                  <li
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {it.course.code} — {it.course.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {it.classCode} · {dayLabel(it.dayOfWeek)}{' '}
                        {timeRange(it.startTime, it.endTime)}
                        {it.room ? ` · ${it.room}` : ''} · {it.course.credits} SKS
                      </p>
                      {it.lecturerName && (
                        <p className="mt-0.5 text-xs text-slate-500">Dosen: {it.lecturerName}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeClass(it.id)}
                      disabled={locked || saving !== null}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => void persist('draft')}
                disabled={locked || saving !== null}
                className="rounded-md border border-primary-600 px-4 py-2 text-sm font-medium text-primary-700 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving === 'draft' ? 'Menyimpan…' : 'Simpan Draft'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmSubmit(true)}
                disabled={locked || saving !== null}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving === 'submit' ? 'Mengirim…' : 'Submit KRS'}
              </button>
              {locked && (
                <p className="text-xs text-slate-500">KRS terkunci — tidak dapat diubah lagi.</p>
              )}
              {actionError && <p className="text-sm font-medium text-red-600">{actionError}</p>}
            </div>
          </div>
        </section>
      </div>

      {/* Konfirmasi submit */}
      {confirmSubmit && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi submit KRS"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Submit KRS?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Setelah dikirim, KRS Anda terkunci dan menunggu persetujuan Admin Akademik. Anda tidak
              dapat mengubahnya lagi.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmSubmit(false)}
                disabled={saving !== null}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void persist('submit')}
                disabled={saving !== null}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
              >
                {saving === 'submit' ? 'Mengirim…' : 'Ya, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
