import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../lib/api';
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

/**
 * Halaman KRS mahasiswa (T1.11b):
 * - periode aktif + status pengisian (GET /krs/period, /krs/my)
 * - kelas tersedia (GET /krs/available-classes) → pilih/tambah
 * - simpan draft / submit (POST /krs/draft, /krs/submit), total SKS
 * - terkunci saat submitted/approved atau periode tutup (AC-07)
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
      if (periodRes.status === 'open') {
        try {
          const data = await apiRequest<{ items: AvailableClass[] }>('/krs/available-classes');
          avail = data.items;
        } catch (err) {
          if (!(err instanceof ApiError && err.code === 'KRS_PERIOD_CLOSED')) throw err;
        }
      }
      setAvailable(avail);
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

  const addClass = useCallback((cls: AvailableClass) => {
    setPicked((prev) =>
      prev.some((i) => i.id === cls.id)
        ? prev
        : [
            ...prev,
            {
              id: cls.id,
              classCode: cls.classCode,
              course: cls.course,
              dayOfWeek: cls.dayOfWeek,
              startTime: cls.startTime,
              endTime: cls.endTime,
              room: cls.room,
            },
          ],
    );
  }, []);

  const removeClass = useCallback((classId: number) => {
    setPicked((prev) => prev.filter((i) => i.id !== classId));
  }, []);

  const persist = useCallback(
    async (endpoint: 'draft' | 'submit') => {
      const classIds = picked.map((i) => i.id);
      if (classIds.length === 0) {
        setActionError('Pilih minimal satu kelas terlebih dahulu.');
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

  const status = myKrs?.status ?? 'not_filled';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kartu Rencana Studi</h1>
          <p className="mt-1 text-sm text-slate-500">
            {period?.status === 'open' ? (
              <>
                Periode <span className="font-medium text-slate-700">{period.name}</span> — buka
                sampai {period.endDate ? new Date(period.endDate).toLocaleDateString('id-ID') : '—'}
              </>
            ) : (
              'Periode KRS sedang tutup.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Kelas terpilih */}
      <section className="rounded-2xl bg-white p-5 shadow-sm" aria-label="Kelas terpilih">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Kelas Terpilih</h2>
          <p className="text-sm text-slate-600">
            Total SKS: <span className="font-bold text-slate-900">{totalCredits}</span>
          </p>
        </div>

        {picked.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Belum ada kelas. Pilih dari daftar kelas tersedia di bawah.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {picked.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {it.course.code} — {it.course.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {it.classCode} · {dayLabel(it.dayOfWeek)} {timeRange(it.startTime, it.endTime)}
                    {it.room ? ` · ${it.room}` : ''} · {it.course.credits} SKS
                  </p>
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
      </section>

      {/* Kelas tersedia */}
      <section className="rounded-2xl bg-white p-5 shadow-sm" aria-label="Kelas tersedia">
        <h2 className="font-semibold text-slate-900">Kelas Tersedia</h2>
        {available.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Tidak ada kelas tersedia untuk prodi Anda pada periode ini.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Kode</th>
                  <th className="py-2 pr-3 font-medium">Mata Kuliah</th>
                  <th className="py-2 pr-3 font-medium">SKS</th>
                  <th className="py-2 pr-3 font-medium">Jadwal</th>
                  <th className="py-2 pr-3 font-medium">Ruang</th>
                  <th className="py-2 pr-3 font-medium">Kuota</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {available.map((cls) => {
                  const pickedNow = picked.some((i) => i.id === cls.id);
                  return (
                    <tr key={cls.id} className="align-top">
                      <td className="py-3 pr-3 font-medium text-slate-900">{cls.course.code}</td>
                      <td className="py-3 pr-3 text-slate-700">
                        {cls.course.name}
                        {cls.isMandatory && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            WAJIB
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{cls.course.credits}</td>
                      <td className="py-3 pr-3 text-slate-600">
                        {dayLabel(cls.dayOfWeek)} {timeRange(cls.startTime, cls.endTime)}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{cls.room ?? '—'}</td>
                      <td className="py-3 pr-3 text-slate-600">
                        {cls.quotaLeft} / {cls.capacity}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => addClass(cls)}
                          disabled={locked || saving !== null || pickedNow}
                          className="rounded-md border border-primary-600 px-3 py-1 text-xs font-medium text-primary-700 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {pickedNow ? 'Dipilih' : 'Tambah'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
