import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSkripsiProposals,
  getSkripsiProposalStatuses,
  getSkripsiSupervisors,
  submitSkripsiProposal,
} from '../lib/api';
import type { SkripsiProposal, SkripsiProposalStatus, SkripsiSupervisor } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Halaman Mahasiswa — Ajukan Bimbingan Skripsi.
 * Form: judul + dosen pembimbing + file proposal (PDF, base64, max 10MB).
 * Daftar: proposal sendiri + riwayat status (expandable timeline).
 */

const STATUS_LABELS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  diajukan: 'bg-yellow-100 text-yellow-800',
  dilihat_dosen: 'bg-blue-100 text-blue-700',
  disetujui_dosen: 'bg-green-100 text-green-700',
  ditolak_dosen: 'bg-red-100 text-red-700',
  disetujui_admin: 'bg-green-100 text-green-700',
  ditolak_admin: 'bg-red-100 text-red-700',
  dalam_bimbingan: 'bg-indigo-100 text-indigo-700',
  siap_sidang: 'bg-purple-100 text-purple-700',
  lulus: 'bg-green-600 text-white font-semibold',
  tidak_lulus: 'bg-red-600 text-white font-semibold',
};

const MAX_FILE_SIZE_MB = 10;

export function MahasiswaAjukanBimbingan() {
  const [title, setTitle] = useState('');
  const [supervisorIds, setSupervisorIds] = useState<number[]>([]);
  const [supervisorSearch, setSupervisorSearch] = useState('');
  const [proposalFile, setProposalFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [supervisors, setSupervisors] = useState<SkripsiSupervisor[]>([]);
  const [proposals, setProposals] = useState<SkripsiProposal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Riwayat status per proposal (lazy load saat expand)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusHistories, setStatusHistories] = useState<Record<number, SkripsiProposalStatus[]>>(
    {},
  );
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [supervisorList, proposalList] = await Promise.all([
        getSkripsiSupervisors(),
        getSkripsiProposals(),
      ]);
      setSupervisors(supervisorList);
      setProposals(proposalList);
    } catch {
      setError('Gagal memuat data bimbingan skripsi');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) {
      setProposalFile(null);
      setFileName('');
      return;
    }
    if (!file.type.includes('pdf')) {
      setError('File harus berformat PDF');
      setProposalFile(null);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_FILE_SIZE_MB}MB`);
      setProposalFile(null);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProposalFile(String(reader.result));
      setFileName(file.name);
    };
    reader.onerror = () => {
      setError('Gagal membaca file proposal');
      setProposalFile(null);
      setFileName('');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (title.trim().length < 10) {
      setError('Judul proposal minimal 10 karakter');
      return;
    }
    if (supervisorIds.length === 0) {
      setError('Pilih minimal 1 dosen pembimbing');
      return;
    }
    if (!proposalFile) {
      setError('Upload file proposal (PDF) terlebih dahulu');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitSkripsiProposal({
        title: title.trim(),
        supervisorIds,
        proposalFile: proposalFile ?? undefined,
      });
      setSuccess('Proposal berhasil diajukan!');
      setTitle('');
      setSupervisorIds([]);
      setProposalFile(null);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data proposal tidak valid');
      } else if (apiError.code === 'FORBIDDEN') {
        setError(apiError.message ?? 'Anda belum dapat mengajukan proposal skripsi');
      } else {
        setError(apiError.message ?? 'Gagal mengajukan proposal');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleHistory = async (proposalId: number) => {
    if (expandedId === proposalId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(proposalId);
    if (statusHistories[proposalId]) return;

    setHistoryLoadingId(proposalId);
    try {
      const history = await getSkripsiProposalStatuses(proposalId);
      setStatusHistories((prev) => ({ ...prev, [proposalId]: history }));
    } catch {
      setError('Gagal memuat riwayat status proposal');
    } finally {
      setHistoryLoadingId(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-8 w-8 text-primary-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Ajukan Bimbingan Skripsi</h1>
        <p className="text-slate-500 mt-1">
          Ajukan proposal skripsi Anda beserta dosen pembimbing yang dipilih
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Form Pengajuan Proposal</h3>
        {error && <FormAlert>{error}</FormAlert>}
        {success && (
          <div
            role="status"
            className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
          >
            {success}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Judul Proposal</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Analisis Sistem Informasi Manajemen..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-slate-400 mt-1">Minimal 10 karakter</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Dosen Pembimbing
            </label>
            <div className="relative">
              <input
                type="text"
                value={supervisorSearch}
                onChange={(e) => setSupervisorSearch(e.target.value)}
                placeholder="Cari nama/NIDN dosen..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {supervisorSearch && (
                <button
                  type="button"
                  onClick={() => setSupervisorSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
            {supervisors.length > 0 && (
              <div className="mt-2 max-h-60 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                {supervisors
                  .filter(
                    (s) =>
                      !supervisorIds.includes(s.id) &&
                      (supervisorSearch === '' ||
                        s.fullName.toLowerCase().includes(supervisorSearch.toLowerCase()) ||
                        s.nidn.toLowerCase().includes(supervisorSearch.toLowerCase())),
                  )
                  .map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        disabled={supervisorIds.length >= 2 && !supervisorIds.includes(s.id)}
                        checked={supervisorIds.includes(s.id)}
                        onChange={() =>
                          setSupervisorIds((prev) =>
                            prev.includes(s.id)
                              ? prev.filter((id) => id !== s.id)
                              : [...prev, s.id],
                          )
                        }
                        className="h-4 w-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-slate-700">
                        {s.fullName} ({s.nidn})
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">{s.prodiName}</span>
                    </label>
                  ))}
              </div>
            )}
            {supervisorIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {supervisorIds.map((id) => {
                  const s = supervisors.find((sv) => sv.id === id);
                  return s ? (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-full"
                    >
                      {s.fullName}
                      <button
                        type="button"
                        onClick={() => setSupervisorIds((prev) => prev.filter((i) => i !== id))}
                        className="ml-1 hover:text-primary-900"
                      >
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {supervisorIds.length >= 2 && (
              <p className="mt-1 text-xs text-amber-600">Maksimal 2 dosen pembimbing</p>
            )}
            {isLoading && supervisors.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">Memuat daftar dosen...</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              File Proposal (PDF)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            {fileName && (
              <p className="text-xs text-green-600 mt-1">
                ✓ {fileName} siap diunggah (maks {MAX_FILE_SIZE_MB}MB)
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">Format PDF, maksimal {MAX_FILE_SIZE_MB}MB</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Mengirim...' : 'Ajukan Proposal'}
          </button>
        </div>
      </div>

      {/* Daftar Proposal */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Daftar Proposal Saya</h3>

        {isLoading && proposals.length === 0 ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-slate-500 mt-3">Memuat daftar proposal...</p>
          </div>
        ) : proposals.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="h-12 w-12 text-slate-300 mx-auto mb-3"
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
            <p className="text-slate-500 font-medium">Belum ada proposal skripsi</p>
            <p className="text-slate-400 text-sm mt-1">
              Ajukan proposal pertama Anda melalui formulir di atas.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => {
              const isExpanded = expandedId === p.id;
              const history = statusHistories[p.id];
              return (
                <div
                  key={p.id}
                  className={`border rounded-lg transition-all ${
                    isExpanded ? 'border-primary-300 ring-1 ring-primary-100' : 'border-slate-200'
                  }`}
                >
                  {/* Card Header — clickable */}
                  <button
                    type="button"
                    onClick={() => toggleHistory(p.id)}
                    className="w-full text-left p-4 flex items-start gap-3 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 text-sm">{p.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {p.supervisorName} &middot; diajukan {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          STATUS_COLORS[p.status] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
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

                  {/* Expanded — status history timeline */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 pb-4">
                      {historyLoadingId === p.id ? (
                        <div className="py-4 text-center">
                          <div className="animate-spin h-6 w-6 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
                          <p className="text-xs text-slate-400 mt-2">Memuat riwayat status...</p>
                        </div>
                      ) : history && history.length > 0 ? (
                        <div className="mt-3 space-y-0">
                          {history.map((h, idx) => (
                            <div key={h.id} className="flex items-start gap-3">
                              <div className="flex flex-col items-center">
                                <div
                                  className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                                    idx === history.length - 1 ? 'bg-primary-500' : 'bg-slate-300'
                                  }`}
                                />
                                {idx < history.length - 1 && (
                                  <div className="w-px flex-1 bg-slate-200 min-h-6" />
                                )}
                              </div>
                              <div className="pb-4">
                                <p className="text-sm font-medium text-slate-800">
                                  {STATUS_LABELS[h.status] ?? h.status}
                                </p>
                                {h.notes && (
                                  <p className="text-xs text-slate-500 mt-0.5">{h.notes}</p>
                                )}
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {h.changedByName} &middot;{' '}
                                  {new Date(h.changedAt).toLocaleString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 py-4 text-center">
                          Belum ada riwayat status.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
