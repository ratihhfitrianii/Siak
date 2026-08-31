import { Fragment, useEffect, useState, useCallback, useMemo } from 'react';
import { getSkripsiProposals, updateSkripsiProposal, getSkripsiProposalStatuses } from '../lib/api';
import type { SkripsiProposal, SkripsiStatus, SkripsiProposalStatus, SkripsiStatusHistory, SkripsiSupervisor } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';
import { Spinner } from '../components/Spinner';

const STATUS_LABEL: Record<SkripsiStatus, string> = {
  draft: 'Draft',
  diajukan: 'Diajukan',
  dilihat_dosen: 'Dilihat Dosen',
  disetujui_dosen: 'Disetujui Dosen',
  ditolak_dosen: 'Ditolak Dosen',
  disetujui_admin: 'Disetujui Admin',
  ditolak_admin: 'Ditolak Admin',
  dalam_bimbingan: 'Dalam Bimbingan',
  siap_sidang: 'Siap Sidang',
  lulus: 'Lulus',
  tidak_lulus: 'Tidak Lulus',
};

const STATUS_COLOR: Record<SkripsiStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  diajukan: 'bg-amber-100 text-amber-700',
  dilihat_dosen: 'bg-blue-100 text-blue-700',
  disetujui_dosen: 'bg-green-100 text-green-700',
  ditolak_dosen: 'bg-red-100 text-red-700',
  disetujui_admin: 'bg-emerald-100 text-emerald-700',
  ditolak_admin: 'bg-red-100 text-red-700',
  dalam_bimbingan: 'bg-indigo-100 text-indigo-700',
  siap_sidang: 'bg-purple-100 text-purple-700',
  lulus: 'bg-green-100 text-green-800 font-medium',
  tidak_lulus: 'bg-red-100 text-red-800 font-medium',
};

/**
 * Status transition map for admin akademik:
 * - Admin akademik sees proposals after dosen approval (disetujui_dosen)
 * - Admin can approve (→ disetujui_admin → dalam_bimbingan) or reject (→ ditolak_admin)
 */
const ADMIN_NEXT_STATUS_MAP: Partial<
  Record<SkripsiStatus, { approve: SkripsiStatus; reject: SkripsiStatus }>
> = {
  disetujui_dosen: { approve: 'disetujui_admin', reject: 'ditolak_admin' },
  disetujui_admin: { approve: 'dalam_bimbingan', reject: 'ditolak_admin' },
  dalam_bimbingan: { approve: 'siap_sidang', reject: 'tidak_lulus' },
  siap_sidang: { approve: 'lulus', reject: 'tidak_lulus' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Buka PDF dari data URL di tab baru. */
function openProposalFile(dataUrl: string): boolean {
  try {
    const [meta, base64] = dataUrl.split(',');
    const mimeMatch = meta.match(/data:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

/** Unduh PDF dari data URL dengan nama file. */
function downloadProposalFile(dataUrl: string, filename: string): boolean {
  try {
    const [meta, base64] = dataUrl.split(',');
    const mimeMatch = meta.match(/data:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

export function AdminProposalReview() {
  const [proposals, setProposals] = useState<SkripsiProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusHistories, setStatusHistories] = useState<Record<number, SkripsiProposalStatus[]>>(
    {},
  );
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  // Pencarian (judul/NIM/nama/prodi)
  const [searchTerm, setSearchTerm] = useState('');

  // Filter klien-side: judul, NIM, nama mahasiswa, atau prodi
  const filteredProposals = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return proposals;
    return proposals.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.nim.toLowerCase().includes(q) ||
        p.studentName.toLowerCase().includes(q) ||
        p.prodiName.toLowerCase().includes(q),
    );
  }, [proposals, searchTerm]);

  const loadProposals = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getSkripsiProposals();
      // Admin akademik sees ALL proposals (not filtered by supervisor)
      setProposals(data);
    } catch {
      setError('Gagal memuat daftar proposal');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const loadStatusHistory = async (proposalId: number) => {
    if (statusHistories[proposalId]) return;
    setHistoryLoadingId(proposalId);
    try {
      const history = await getSkripsiProposalStatuses(proposalId);
      setStatusHistories((prev) => ({ ...prev, [proposalId]: history }));
    } catch {
      setError('Gagal memuat riwayat status');
    } finally {
      setHistoryLoadingId(null);
    }
  };

  const toggleExpand = async (proposalId: number) => {
    if (expandedId === proposalId) {
      setExpandedId(null);
    } else {
      setExpandedId(proposalId);
      await loadStatusHistory(proposalId);
    }
  };

  const handleUpdateStatus = async (proposalId: number, action: 'approve' | 'reject') => {
    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) return;

    const next = ADMIN_NEXT_STATUS_MAP[proposal.status];
    if (!next) {
      setError('Proposal tidak bisa diubah statusnya lagi');
      return;
    }

    const newStatus = action === 'approve' ? next.approve : next.reject;
    const notes =
      action === 'approve'
        ? 'Proposal disetujui oleh admin akademik'
        : 'Proposal ditolak oleh admin akademik';

    setUpdatingId(proposalId);
    try {
      await updateSkripsiProposal(proposalId, { status: newStatus, statusNotes: notes });
      // Update local state
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId ? { ...p, status: newStatus, statusNotes: notes } : p,
        ),
      );
      // Clear history cache to reload
      setStatusHistories((prev) => {
        const nextHist = { ...prev };
        delete nextHist[proposalId];
        return nextHist;
      });
      // Riwayat dimuat ulang agar keputusan tampil di detail
      void loadStatusHistory(proposalId);
    } catch {
      setError('Gagal mengubah status proposal');
    } finally {
      setUpdatingId(null);
    }
  };

  /** Admin bisa aksi saat proposal sudah disetujui dosen atau di tahap admin */
  const canAct = (status: SkripsiStatus) =>
    ['disetujui_dosen', 'disetujui_admin', 'dalam_bimbingan', 'siap_sidang'].includes(status);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Memuat proposal..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ajuan Proposal Skripsi</h1>
          <p className="text-slate-600">Review dan kelola proposal skripsi mahasiswa</p>
        </div>
        <div className="text-sm text-slate-500">
          Total: <span className="font-medium text-slate-900">{filteredProposals.length}</span>{' '}
          proposal
        </div>
      </div>

      {/* Pencarian */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            id="admin-proposal-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari judul, NIM, nama mahasiswa, atau prodi..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      {filteredProposals.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-4 text-slate-600">Tidak ada proposal yang ditampilkan</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Mahasiswa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Prodi
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Judul
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Dosen Pembimbing
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Diajukan
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredProposals.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{p.studentName}</p>
                          <p className="text-sm text-slate-500">{p.nim}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{p.prodiName}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 max-w-xs truncate" title={p.title}>
                          {p.title}
                        </p>
                        {p.proposalFile && (
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={() => openProposalFile(p.proposalFile!)}
                              className="text-xs text-primary-600 hover:underline"
                            >
                              Lihat PDF
                            </button>
                            <button
                              onClick={() =>
                                downloadProposalFile(p.proposalFile!, `proposal-${p.nim}.pdf`)
                              }
                              className="text-xs text-primary-600 hover:underline"
                            >
                              Unduh
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[p.status]}`}
                        >
                          {STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {p.supervisors?.map((s) => (
                          <span key={s.id} className="block">
                            {s.fullName} ({s.nidn})
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {formatDate(p.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {/* Expand/Collapse */}
                          <button
                            onClick={() => toggleExpand(p.id)}
                            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label={expandedId === p.id ? 'Tutup detail' : 'Lihat detail'}
                          >
                            {expandedId === p.id ? (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 15l7-7 7 7"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            )}
                          </button>

                          {/* Action Buttons */}
                          {canAct(p.status) && !updatingId && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleUpdateStatus(p.id, 'approve')}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                disabled={updatingId === p.id}
                              >
                                Setujui
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(p.id, 'reject')}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                                disabled={updatingId === p.id}
                              >
                                Tolak
                              </button>
                            </div>
                          )}
                          {updatingId === p.id && <Spinner label="Menyimpan..." />}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Row - Status History */}
                    {expandedId === p.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={7} className="px-4 py-2">
                          <div className="ml-4 mt-2 border-l-2 border-slate-200 pl-4 space-y-2">
                            {historyLoadingId === p.id ? (
                              <div className="flex justify-center py-4">
                                <Spinner label="Memuat riwayat..." />
                              </div>
                            ) : statusHistories[p.id]?.length ? (
                              statusHistories[p.id]!.map((h) => (
                                <div key={h.id} className="relative">
                                  <div className="absolute left-[-6px] top-0 w-2 h-2 rounded-full bg-slate-400" />
                                  <div className="text-sm">
                                    <p className="font-medium text-slate-900">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[h.status]}`}
                                      >
                                        {STATUS_LABEL[h.status as SkripsiStatus]}
                                      </span>
                                    </p>
                                    <p className="text-slate-600">{h.notes ?? '-'}</p>
                                    <p className="text-xs text-slate-400">
                                      Oleh: {h.changedByName} • {formatDate(h.changedAt)}
                                    </p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-slate-500">Belum ada riwayat status</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
