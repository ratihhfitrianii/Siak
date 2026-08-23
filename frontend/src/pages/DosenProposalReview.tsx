import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getSkripsiProposals, updateSkripsiProposal, getSkripsiProposalStatuses } from '../lib/api';
import type { SkripsiProposal, SkripsiStatus, SkripsiProposalStatus } from '../lib/types';
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

const NEXT_STATUS_MAP: Partial<
  Record<SkripsiStatus, { approve: SkripsiStatus; reject: SkripsiStatus }>
> = {
  diajukan: { approve: 'dilihat_dosen', reject: 'ditolak_dosen' },
  dilihat_dosen: { approve: 'disetujui_dosen', reject: 'ditolak_dosen' },
  disetujui_dosen: { approve: 'dalam_bimbingan', reject: 'ditolak_dosen' },
  ditolak_dosen: { approve: 'dalam_bimbingan', reject: 'ditolak_dosen' },
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

/**
 * Buka PDF dari data URL di tab baru.
 * Browser modern memblokir navigasi langsung ke data: URL, jadi kita
 * konversi ke Blob lalu buka via object URL. Return false jika gagal.
 */
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
    // Revoke setelah delay agar tab baru sempat load
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

/** Unduh PDF dari data URL dengan nama file. Return false jika gagal. */
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

export function DosenProposalReview() {
  const { user } = useAuth();
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
      // Filter proposals where this dosen is one of the supervisors
      const filtered = data.filter((p) => p.supervisors?.some((s) => s.id === user?.id));
      setProposals(filtered);
    } catch {
      setError('Gagal memuat daftar proposal');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

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

    const next = NEXT_STATUS_MAP[proposal.status];
    if (!next) {
      setError('Proposal tidak bisa diubah statusnya lagi');
      return;
    }

    const newStatus = action === 'approve' ? next.approve : next.reject;
    const notes =
      action === 'approve'
        ? 'Proposal disetujui oleh dosen pembimbing — menunggu persetujuan admin akademik untuk mulai bimbingan'
        : 'Proposal ditolak oleh dosen pembimbing';

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
        const next = { ...prev };
        delete next[proposalId];
        return next;
      });
      // Riwayat dimuat ulang agar keputusan tampil di detail
      void loadStatusHistory(proposalId);
    } catch {
      setError('Gagal mengubah status proposal');
    } finally {
      setUpdatingId(null);
    }
  };

  /**
   * Tombol aksi hanya aktif saat proposal masih "diajukan". Sekali dosen
   * menyetujui/menolak (→ dilihat_dosen / ditolak_dosen), SEMUA tombol hilang —
   * lanjut ke bimbingan menunggu persetujuan admin akademik.
   */
  const canAct = (status: SkripsiStatus) => status === 'diajukan';

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Memuat proposal..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            id="proposal-review-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari judul, NIM, nama mahasiswa, atau prodi..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      {proposals.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-slate-900">Belum ada proposal</h3>
          <p className="mt-1 text-slate-500">
            Tidak ada mahasiswa yang mengajukan proposal dengan Anda sebagai pembimbing.
          </p>
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">
            Tidak ada proposal yang cocok dengan pencarian "{searchTerm}".
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProposals.map((p) => {
            const isExpanded = expandedId === p.id;
            const history = statusHistories[p.id];
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white">
                <button
                  onClick={() => toggleExpand(p.id)}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900 truncate">{p.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>NIM: {p.nim}</span>
                      <span>{p.studentName}</span>
                      <span>Prodi: {p.prodiName}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[p.status]}`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    {p.supervisors && p.supervisors.length > 1 && (
                      <p className="mt-1 text-xs text-slate-400">
                        Pembimbing: {p.supervisors.map((s) => s.fullName).join(', ')}
                        {p.supervisors.find((s) => s.isPrimary) && ' (Pembimbing Utama)'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg px-3 py-1.5">
                      Detail
                    </span>
                    <svg
                      className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 space-y-4">
                    {/* Aksi Setujui/Tolak — hanya aktif saat menunggu keputusan dosen */}
                    {canAct(p.status) ? (
                      <div className="flex justify-end gap-2">
                        {updatingId === p.id ? (
                          <Spinner className="h-5 w-5" label="Menyimpan..." />
                        ) : (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(p.id, 'reject')}
                              disabled={updatingId === p.id}
                              className="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                            >
                              Tolak
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(p.id, 'approve')}
                              disabled={updatingId === p.id}
                              className="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                            >
                              Setujui
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 bg-slate-100 border border-slate-200 rounded-lg p-3">
                        {p.status === 'disetujui_dosen' || p.status === 'dilihat_dosen'
                          ? 'Keputusan Anda tersimpan. Menunggu persetujuan admin akademik — bimbingan dapat dimulai setelah admin menyetujui.'
                          : 'Keputusan sudah tidak dapat diubah lagi pada tahap ini.'}
                      </p>
                    )}

                    {/* File Proposal */}
                    {p.proposalFile && (
                      <div className="p-4 bg-white rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-400 mb-2">Lampiran Proposal</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              if (!openProposalFile(p.proposalFile!)) {
                                setError('Gagal membuka file proposal');
                              }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition font-medium text-sm"
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            Lihat Proposal (PDF)
                          </button>
                          <button
                            onClick={() => {
                              if (
                                !downloadProposalFile(
                                  p.proposalFile!,
                                  `proposal-${p.nim}-${p.title.slice(0, 30)}.pdf`,
                                )
                              ) {
                                setError('Gagal mengunduh file proposal');
                              }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition font-medium text-sm"
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                            Unduh
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Riwayat Status */}
                    <h4 className="font-medium text-slate-700">Riwayat Status</h4>
                    {historyLoadingId === p.id ? (
                      <Spinner className="h-4 w-4" label="Memuat riwayat..." />
                    ) : history ? (
                      <div className="space-y-2">
                        {history.map((h) => (
                          <div
                            key={h.id}
                            className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-100"
                          >
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                              <svg
                                className="h-4 w-4 text-primary-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900">
                                  {STATUS_LABEL[h.status]}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {formatDate(h.changedAt)}
                                </span>
                              </div>
                              <div className="text-sm text-slate-500">{h.changedByName}</div>
                              {h.notes && (
                                <div className="text-sm text-slate-500 mt-1">{h.notes}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">Belum ada riwayat status</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
