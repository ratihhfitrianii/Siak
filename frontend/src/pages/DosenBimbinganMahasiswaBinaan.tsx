import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getSkripsiProposals, createSkripsiGuidanceLog, getSkripsiGuidanceLogs } from '../lib/api';
import type { SkripsiProposal, SkripsiStatus, SkripsiGuidanceLog } from '../lib/types';
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
  // Pencarian (judul/NIM/nama/prodi)
  const [searchTerm, setSearchTerm] = useState('');

  // Catat Bimbingan modal state
  const [catatProposal, setCatatProposal] = useState<SkripsiProposal | null>(null);
  const [logDate, setLogDate] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [catatSaving, setCatatSaving] = useState(false);
  const [catatError, setCatatError] = useState<string | null>(null);
  const [catatSuccess, setCatatSuccess] = useState<string | null>(null);

  // Lihat Log modal state
  const [logProposal, setLogProposal] = useState<SkripsiProposal | null>(null);
  const [logs, setLogs] = useState<SkripsiGuidanceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const openCatat = (p: SkripsiProposal) => {
    setCatatProposal(p);
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogNotes('');
    setCatatError(null);
    setCatatSuccess(null);
  };

  const handleCatatSubmit = async () => {
    if (!catatProposal) return;
    if (!logDate) {
      setCatatError('Tanggal bimbingan wajib diisi');
      return;
    }
    if (!logNotes.trim()) {
      setCatatError('Catatan bimbingan wajib diisi');
      return;
    }
    setCatatSaving(true);
    setCatatError(null);
    try {
      await createSkripsiGuidanceLog(catatProposal.id, {
        sessionDate: logDate,
        notes: logNotes.trim(),
      });
      setCatatSuccess('Catatan bimbingan berhasil disimpan');
      setLogNotes('');
    } catch {
      setCatatError('Gagal menyimpan catatan bimbingan');
    } finally {
      setCatatSaving(false);
    }
  };

  const openLog = async (p: SkripsiProposal) => {
    setLogProposal(p);
    setLogs([]);
    setLogsLoading(true);
    setLogsError(null);
    try {
      const data = await getSkripsiGuidanceLogs(p.id);
      setLogs(data);
      if (data.length === 0) setLogsError('Data belum ada');
    } catch {
      setLogsError('Gagal memuat log bimbingan');
    } finally {
      setLogsLoading(false);
    }
  };

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

  // Catat Bimbingan Modal
  if (catatProposal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={() => setCatatProposal(null)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catat-title"
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 id="catat-title" className="text-lg font-semibold text-slate-900">
              Catat Bimbingan
            </h2>
            <button
              onClick={() => setCatatProposal(null)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Tutup"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <p className="text-sm text-slate-600">
            {catatProposal.title} — {catatProposal.studentName} ({catatProposal.nim})
          </p>

          {catatError && <FormAlert>{catatError}</FormAlert>}
          {catatSuccess && (
            <div
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
            >
              {catatSuccess}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label htmlFor="logDate" className="block text-sm font-medium text-slate-700 mb-1">
                Tanggal Bimbingan
              </label>
              <input
                id="logDate"
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="logNotes" className="block text-sm font-medium text-slate-700 mb-1">
                Catatan Bimbingan
              </label>
              <textarea
                id="logNotes"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Tulis catatan pertemuan bimbingan di sini..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setCatatProposal(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
            >
              Batal
            </button>
            <button
              onClick={handleCatatSubmit}
              disabled={catatSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {catatSaving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Lihat Log Modal
  if (logProposal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={() => setLogProposal(null)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-title"
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 id="log-title" className="text-lg font-semibold text-slate-900">
              Log Bimbingan
            </h2>
            <button
              onClick={() => setLogProposal(null)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Tutup"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <p className="text-sm text-slate-600">
            {logProposal.title} — {logProposal.studentName} ({logProposal.nim})
          </p>

          {logsError && <FormAlert>{logsError}</FormAlert>}

          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner label="Memuat log bimbingan..." />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <svg
                className="mx-auto h-10 w-10 text-slate-300"
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
              <p className="mt-2">Belum ada catatan bimbingan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{log.notes}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(log.sessionDate).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {log.lecturerName && ` — ${log.lecturerName}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              onClick={() => setLogProposal(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
            >
              Tutup
            </button>
          </div>
        </div>
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
            id="binaan-search"
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-slate-900">Belum ada mahasiswa binaan</h3>
          <p className="mt-1 text-slate-500">
            Mahasiswa yang proposalnya disetujui akan muncul di sini.
          </p>
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">
            Tidak ada mahasiswa binaan yang cocok dengan pencarian "{searchTerm}".
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProposals.map((p) => {
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
                    {/* Grid data mahasiswa/email/prodi/status & judul dihapus —
                        info sudah tampil di header kartu; detail cukup file + pembimbing */}

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
                      <button
                        onClick={() => openCatat(p)}
                        disabled={p.studentStatus === 'lulus'}
                        className={`flex-1 px-4 py-2 text-sm font-medium ${p.studentStatus === 'lulus' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'text-white bg-primary-600 hover:bg-primary-700'} rounded-lg transition`}
                      >
                        Catat Bimbingan
                      </button>
                      <button
                        onClick={() => openLog(p)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
                      >
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
