import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getSkripsiProposals } from '../lib/api';
import type { SkripsiProposal, SkripsiStatus } from '../lib/types';
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

// Status yang berarti proposal sudah disetujui (bimbingan aktif)
const APPROVED_STATUSES: SkripsiStatus[] = [
  'disetujui_dosen',
  'dalam_bimbingan',
  'siap_sidang',
  'lulus',
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function DosenBimbinganMahasiswaBinaan() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<SkripsiProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadProposals = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getSkripsiProposals();
      // Filter: dosen is supervisor AND status is approved or later
      const filtered = data.filter(
        (p) =>
          p.supervisors?.some((s) => s.id === user?.id) && APPROVED_STATUSES.includes(p.status),
      );
      setProposals(filtered);
    } catch {
      setError('Gagal memuat daftar mahasiswa binaan');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Memuat mahasiswa binaan..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-slate-900">Belum ada mahasiswa binaan</h3>
          <p className="mt-1 text-slate-500">
            Mahasiswa yang proposalnya disetujui akan muncul di sini.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((p) => {
            const isExpanded = expandedId === p.id;
            const primarySupervisor = p.supervisors?.find((s) => s.isPrimary);
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
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
                        {primarySupervisor &&
                          ' (Pembimbing Utama: ' + primarySupervisor.fullName + ')'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-slate-500 hidden sm:block">
                      Diperbarui: {formatDate(p.updatedAt)}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-3 bg-white rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-400">Mahasiswa</p>
                        <p className="font-medium text-slate-900">{p.studentName}</p>
                        <p className="text-sm text-slate-500">{p.nim}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-400">Email</p>
                        <p className="font-medium text-slate-900">{p.studentEmail}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-400">Program Studi</p>
                        <p className="font-medium text-slate-900">{p.prodiName}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-400">Status Bimbingan</p>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[p.status]}`}
                        >
                          {STATUS_LABEL[p.status]}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-400 mb-1">Judul Proposal</p>
                      <p className="font-medium text-slate-900">{p.title}</p>
                    </div>

                    {p.proposalFile && (
                      <div className="p-3 bg-white rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-400 mb-1">File Proposal</p>
                        <a
                          href={p.proposalFile}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline text-sm flex items-center gap-1"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                            />
                          </svg>
                          Lihat Proposal (PDF)
                        </a>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-400 mb-2">Pembimbing</p>
                      <div className="flex flex-wrap gap-2">
                        {p.supervisors?.map((s) => (
                          <span
                            key={s.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                              s.isPrimary
                                ? 'bg-primary-50 text-primary-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {s.fullName} ({s.nidn}) {s.isPrimary && '⭐'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition">
                        Catat Bimbingan
                      </button>
                      <button className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition">
                        Lihat Log
                      </button>
                    </div>
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
