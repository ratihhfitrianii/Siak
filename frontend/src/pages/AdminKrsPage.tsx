import { useCallback, useEffect, useState } from 'react';
import { ApiError, approveKrs, getAdminPendingKrs, rejectKrs } from '../lib/api';
import type { AdminKrsItem } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Halaman admin KRS (T1.11c) — daftar pengajuan menunggu persetujuan (perm krs.approve).
 * Setujui / tolak dengan alasan; mahasiswa mendapat notifikasi in-app (AC-04).
 */
export function AdminKrsPage() {
  const [pending, setPending] = useState<AdminKrsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminPendingKrs();
      setPending(data.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat daftar pengajuan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = useCallback(
    async (id: number) => {
      setBusyId(id);
      setActionError(null);
      try {
        await approveKrs(id);
        await load();
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Gagal menyetujui KRS');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const confirmReject = useCallback(async () => {
    if (rejectId === null || rejectReason.trim().length < 5) return;
    const id = rejectId;
    const reason = rejectReason.trim();
    setRejectSubmitting(true);
    setActionError(null);
    try {
      await rejectKrs(id, reason);
      setRejectId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Gagal menolak KRS');
    } finally {
      setRejectSubmitting(false);
    }
  }, [rejectId, rejectReason, load]);

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Muat Ulang
        </button>
      </div>

      {actionError && <FormAlert>{actionError}</FormAlert>}

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">Semua pengajuan KRS sudah diproses. 🎉</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    NIM
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Mahasiswa
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Prodi
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Diajukan
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-medium text-slate-600">
                    Kelas
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-medium text-slate-600">
                    SKS
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.nim}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.studentName}</td>
                    <td className="px-4 py-3 text-slate-600">{item.prodiCode}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(item.submittedAt)}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{item.itemCount}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{item.totalCredits}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void approve(item.id)}
                          disabled={busyId !== null}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyId === item.id ? 'Memproses…' : 'Setujui'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectId(item.id)}
                          disabled={busyId !== null}
                          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          Tolak
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rejectId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Tolak KRS"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Tolak KRS</h2>
            <p className="mt-1 text-sm text-slate-500">
              Mahasiswa akan menerima notifikasi berisi alasan ini (min. 5 karakter).
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={500}
              autoFocus
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Contoh: Jumlah SKS melebihi batas maksimal semester ini. Silakan kurangi satu mata kuliah."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectId(null);
                  setRejectReason('');
                }}
                disabled={rejectSubmitting}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void confirmReject()}
                disabled={rejectReason.trim().length < 5 || rejectSubmitting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {rejectSubmitting ? 'Menolak…' : 'Tolak KRS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
