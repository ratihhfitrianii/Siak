import { useState, useEffect, useCallback, useRef } from 'react';
import { getMentees, getGuidanceSessions, createGuidance } from '../lib/api';
import type { Mentee, GuidanceSession } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/**
 * Bimbingan akademik (T3.7 + T3.8, perm guidance.manage untuk dosen Wali).
 * Terhubung API nyata: GET /guidance/mentees, GET/POST /guidance/sessions.
 * Hanya dosen Wali yang memiliki mahasiswa binaan.
 * Search: NIM, nama, email (debounced 300ms) — keluhan lama #27.
 */
export function DosenGuidance() {
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [sessions, setSessions] = useState<GuidanceSession[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create form
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
    } catch (_err) {
      setError('Gagal memuat data bimbingan');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSessions = studentId ? sessions.filter((s) => s.studentId === studentId) : sessions;

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
      await createGuidance({
        studentId,
        sessionDate,
        progress,
        notes: notes.trim(),
      });
      setSuccess('Catatan bimbingan berhasil disimpan');
      setSessionDate('');
      setNotes('');
      setProgress('berjalan');
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
    berjalan: 'bg-primary-100 text-primary-800',
    selesai: 'bg-green-100 text-green-800',
    bermasalah: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Bimbingan Mahasiswa Binaan</h2>
        <p className="text-slate-600">
          Catat bimbingan akademik untuk mahasiswa binaan Anda. Hanya dosen Wali yang dapat
          mengakses modul ini.
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Form Bimbingan</h3>
        {error && <FormAlert>{error}</FormAlert>}
        {success && (
          <p
            role="status"
            className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
          >
            {success}
          </p>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Cari Mahasiswa Binaan (NIM / Nama / Email)
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ketik min 1 karakter..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Pilih Mahasiswa Binaan
              </label>
              <select
                value={studentId ?? ''}
                onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Pilih Mahasiswa</option>
                {mentees.map((m) => (
                  <option key={m.studentId} value={m.studentId}>
                    {m.nim} — {m.studentName}
                  </option>
                ))}
              </select>
              {mentees.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {debouncedSearch
                    ? 'Tidak ada mahasiswa cocok dengan pencarian.'
                    : 'Anda belum memiliki mahasiswa binaan (atribut Wali).'}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tanggal Bimbingan
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Progress</label>
            <select
              value={progress}
              onChange={(e) => setProgress(e.target.value as 'berjalan' | 'selesai' | 'bermasalah')}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="berjalan">Berjalan</option>
              <option value="selesai">Selesai</option>
              <option value="bermasalah">Bermasalah</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Catatan</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Masukkan detail bimbingan..."
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !studentId || !sessionDate || !notes.trim()}
            className="px-6 py-2 bg-purple-500 text-white font-medium rounded-lg hover:bg-purple-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Simpan Bimbingan'}
          </button>
        </div>
      </div>

      {/* Existing Guidance Sessions */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">
          Catatan Bimbingan yang Sudah Ada
        </h3>
        {isLoading && sessions.length === 0 ? (
          <p className="text-slate-500">Memuat catatan bimbingan...</p>
        ) : filteredSessions.length === 0 ? (
          <p className="text-slate-500">
            {studentId
              ? 'Belum ada catatan bimbingan untuk mahasiswa ini.'
              : 'Belum ada catatan bimbingan.'}
          </p>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      {session.studentName} ({session.nim})
                    </h4>
                    <p className="text-sm text-slate-600">
                      {session.sessionDate} | {session.lecturerName}
                    </p>
                    {session.notes && (
                      <p className="text-sm text-slate-700 mt-1">{session.notes}</p>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      progressColors[session.progress] ?? 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {progressLabels[session.progress] ?? session.progress}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
