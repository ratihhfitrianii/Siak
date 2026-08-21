import { useState, useEffect, useCallback, useRef } from 'react';
import { getMentees, getGuidanceSessions, createGuidance } from '../lib/api';
import type { Mentee, GuidanceSession } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Bimbingan akademik — dosen Wali catat pertemuan bimbingan.
 * Layout: kartu per mahasiswa binaan (expandable) + form catat bimbingan.
 */
export function DosenGuidance() {
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [sessions, setSessions] = useState<GuidanceSession[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create form
  const [studentId, setStudentId] = useState<number | null>(null);
  const [sessionDate, setSessionDate] = useState('');
  const [progress, setProgress] = useState<'berjalan' | 'selesai' | 'bermasalah'>('berjalan');
  const [notes, setNotes] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchTerm]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [menteeList, sessionList] = await Promise.all([
        getMentees(debouncedSearch),
        getGuidanceSessions(),
      ]);
      setMentees(menteeList);
      setSessions(sessionList);
    } catch {
      setError('Gagal memuat data bimbingan');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Group sessions by studentId
  const sessionsByStudent = sessions.reduce<Record<number, GuidanceSession[]>>((acc, s) => {
    (acc[s.studentId] ??= []).push(s);
    return acc;
  }, {});

  const handleSubmit = async () => {
    if (!studentId) {
      setError('Pilih mahasiswa binaan terlebih dahulu');
      return;
    }
    if (!sessionDate) {
      setError('Tanggal bimbingan wajib diisi');
      return;
    }
    if (!notes.trim()) {
      setError('Catatan bimbingan wajib diisi');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await createGuidance({ studentId, sessionDate, progress, notes: notes.trim() });
      setSuccess('Catatan bimbingan berhasil disimpan');
      setSessionDate('');
      setNotes('');
      setProgress('berjalan');
      setStudentId(null);
      await loadData();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else if (apiError.code === 'FORBIDDEN') {
        setError('Anda tidak memiliki izin untuk bimbingan mahasiswa ini (hanya dosen Wali)');
      } else {
        setError('Gagal menyimpan catatan bimbingan');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const progressLabels: Record<string, string> = {
    berjalan: 'Berjalan',
    selesai: 'Selesai',
    bermasalah: 'Bermasalah',
  };
  const progressColors: Record<string, string> = {
    berjalan: 'bg-blue-100 text-blue-700',
    selesai: 'bg-green-100 text-green-700',
    bermasalah: 'bg-red-100 text-red-700',
  };
  const statusColors: Record<string, string> = {
    aktif: 'bg-green-100 text-green-700',
    lulus: 'bg-blue-100 text-blue-700',
    cuti: 'bg-amber-100 text-amber-700',
    keluar: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* Search */}
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
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari berdasarkan NIM, nama, email, atau prodi..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Student Cards Grid */}
      <div className="space-y-3">
        {isLoading && mentees.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-slate-500 mt-3">Memuat data bimbingan...</p>
          </div>
        ) : mentees.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <p className="text-slate-500 font-medium">Belum ada mahasiswa binaan</p>
            <p className="text-slate-400 text-sm mt-1">
              {debouncedSearch
                ? 'Tidak ditemukan mahasiswa yang cocok dengan pencarian.'
                : 'Anda belum memiliki mahasiswa binaan (atribut Wali).'}
            </p>
          </div>
        ) : (
          mentees.map((m) => {
            const studentSessions = sessionsByStudent[m.studentId] ?? [];
            const isExpanded = expandedId === m.studentId;
            const latestSession = studentSessions[0]; // sorted DESC by date

            return (
              <div
                key={m.studentId}
                className={`bg-white rounded-lg shadow-sm border transition-all ${
                  isExpanded ? 'border-primary-300 ring-1 ring-primary-100' : 'border-slate-200'
                }`}
              >
                {/* Card Header — clickable */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : m.studentId)}
                  className="w-full text-left p-4 flex items-center gap-4 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold shrink-0">
                    {m.studentName
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900 text-sm">{m.studentName}</h3>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          statusColors[m.status] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {m.nim} &middot; {m.prodiCode} &middot; {m.email}
                    </p>
                    {latestSession && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Terakhir: {latestSession.sessionDate} &mdash;{' '}
                        <span
                          className={`font-medium ${
                            progressColors[latestSession.progress]?.split(' ')[1] ?? ''
                          }`}
                        >
                          {progressLabels[latestSession.progress]}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Session count + chevron */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-900">{studentSessions.length}</p>
                      <p className="text-[10px] text-slate-400 leading-none">sesi</p>
                    </div>
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

                {/* Expanded — session list */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 pb-4">
                    {studentSessions.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">
                        Belum ada catatan bimbingan.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {studentSessions.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                          >
                            {/* Date badge */}
                            <div className="w-14 text-center shrink-0">
                              <p className="text-xs font-bold text-primary-600">
                                {new Date(s.sessionDate).getDate()}
                              </p>
                              <p className="text-[10px] text-slate-400 leading-none">
                                {new Date(s.sessionDate).toLocaleDateString('id-ID', {
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </p>
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    progressColors[s.progress] ?? 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {progressLabels[s.progress]}
                                </span>
                                {!s.isVisibleToStudent && (
                                  <span className="text-[10px] text-slate-400">Privat</span>
                                )}
                              </div>
                              {s.notes && (
                                <p className="text-sm text-slate-700 mt-1 line-clamp-2">
                                  {s.notes}
                                </p>
                              )}
                              <p className="text-[10px] text-slate-400 mt-1">{s.lecturerName}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick action — catat bimbingan untuk mahasiswa ini */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStudentId(m.studentId);
                        document
                          .getElementById('guidance-form')
                          ?.scrollIntoView?.({ behavior: 'smooth' });
                      }}
                      className="mt-3 w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-500 hover:border-primary-300 hover:text-primary-600 transition-colors"
                    >
                      + Catat Bimbingan Baru
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Form */}
      <div id="guidance-form" className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Catat Bimbingan Baru</h3>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mahasiswa Binaan
            </label>
            <select
              value={studentId ?? ''}
              onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Pilih Mahasiswa</option>
              {mentees.map((m) => (
                <option key={m.studentId} value={m.studentId}>
                  {m.nim} &mdash; {m.studentName} [{m.prodiCode}]
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tanggal Bimbingan
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Progress</label>
              <select
                value={progress}
                onChange={(e) =>
                  setProgress(e.target.value as 'berjalan' | 'selesai' | 'bermasalah')
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="berjalan">Berjalan</option>
                <option value="selesai">Selesai</option>
                <option value="bermasalah">Bermasalah</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Catatan Bimbingan
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Deskripsikan hasil/hasil bimbingan..."
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !studentId || !sessionDate || !notes.trim()}
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Menyimpan...' : 'Simpan Catatan'}
          </button>
        </div>
      </div>
    </div>
  );
}
