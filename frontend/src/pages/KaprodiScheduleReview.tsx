import { useState, useEffect, useCallback } from 'react';
import { listScheduleSubmissions, reviewScheduleSubmission } from '../lib/api';
import { ApiError } from '../lib/api';
import type { ScheduleSubmissionItem } from '../lib/types';

const STATUS_META: Record<string, { label: string; color: string }> = {
  awaiting: { label: 'Menunggu', color: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Disetujui', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Ditolak', color: 'bg-red-100 text-red-700' },
};

/**
 * Persetujuan Jadwal — halaman kaprodi/wakil kaprodi.
 * Menampilkan pengajuan jadwal dosen seprodi (semester aktif) untuk disetujui/ditolak.
 */
export function KaprodiScheduleReview() {
  const [items, setItems] = useState<ScheduleSubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [noteTarget, setNoteTarget] = useState<ScheduleSubmissionItem | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listScheduleSubmissions(filter || undefined);
      setItems(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat pengajuan');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const doAction = useCallback(
    async (item: ScheduleSubmissionItem, action: 'approved' | 'rejected', note?: string) => {
      setActionId(item.id);
      setError(null);
      try {
        await reviewScheduleSubmission(item.id, action, note);
        setNoteTarget(null);
        setRejectNote('');
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memproses pengajuan');
      } finally {
        setActionId(null);
      }
    },
    [load],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Persetujuan Jadwal</h2>
          <p className="text-sm text-slate-500">
            Pengajuan jadwal mengajar dosen pada program studi Anda.
          </p>
        </div>
        <select
          aria-label="Filter status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">Semua Status</option>
          <option value="awaiting">Menunggu</option>
          <option value="approved">Disetujui</option>
          <option value="rejected">Ditolak</option>
        </select>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Memuat pengajuan...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            {filter
              ? 'Tidak ada pengajuan dengan status tersebut.'
              : 'Belum ada pengajuan jadwal dari dosen.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Dosen
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Semester
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Kelas
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Diajukan
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{item.lecturerName}</p>
                      <p className="text-xs text-slate-500">{item.lecturerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {item.semesterName || item.semesterCode}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">
                      {item.totalClasses}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                      {item.submittedAt
                        ? new Date(item.submittedAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${
                          STATUS_META[item.status]?.color ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {STATUS_META[item.status]?.label ?? item.status}
                      </span>
                      {item.reviewNote && (
                        <p className="text-xs text-slate-500 mt-1">{item.reviewNote}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'awaiting' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={actionId === item.id}
                            onClick={() => doAction(item, 'approved')}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {actionId === item.id ? 'Memproses...' : 'Setujui'}
                          </button>
                          <button
                            type="button"
                            disabled={actionId === item.id}
                            onClick={() => {
                              setRejectNote('');
                              setNoteTarget(item);
                            }}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {item.reviewerName ? `oleh ${item.reviewerName}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal catatan penolakan */}
      {noteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tolak pengajuan jadwal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        >
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-5">
            <h3 className="text-base font-semibold text-slate-900">
              Tolak Pengajuan — {noteTarget.lecturerName}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Berikan alasan penolakan agar dosen dapat memperbaiki jadwal.
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Contoh: ada kelas yang bentrok dengan ruangan..."
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={actionId === noteTarget.id}
                onClick={() => setNoteTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={actionId === noteTarget.id || !rejectNote.trim()}
                onClick={() => doAction(noteTarget, 'rejected', rejectNote.trim())}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionId === noteTarget.id ? 'Memproses...' : 'Tolak Pengajuan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
