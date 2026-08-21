import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getSubstituteRequests,
  createSubstitute,
  cancelSubstitute,
  getLecturers,
  getMyClasses,
} from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import type { SubstituteRequest, LecturerBrief, MyClass } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/** Simple searchable select component */
function SearchableSelect<T extends { id: number; label: string }>({
  options,
  value,
  onChange,
  placeholder,
  maxHeight = 200,
}: {
  options: T[];
  value: number | null;
  onChange: (val: number | null) => void;
  placeholder: string;
  maxHeight?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() =>
    options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      onChange(filtered[highlightedIndex].id);
      setIsOpen(false);
      setSearch('');
      setHighlightedIndex(-1);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
      setHighlightedIndex(-1);
    }
  };

  const selectedOption = options.find(o => o.id === value);

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) setHighlightedIndex(-1); }}
        className={`w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-left ${value ? 'text-slate-900' : 'text-slate-500'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={placeholder}
      >
        {selectedOption?.label ?? placeholder}
      </button>
      {isOpen && (
        <div
          className="absolute z-10 w-full max-w-xs mt-1 bg-white border border-slate-300 rounded-md shadow-lg overflow-hidden"
          style={{ maxHeight: maxHeight }}
        >
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setHighlightedIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder="Cari..."
            className="w-full px-3 py-2 border-b border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            autoFocus
          />
          <ul role="listbox" className="max-h-[160px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Tidak ditemukan</li>
            ) : (
              filtered.map((opt, idx) => (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={idx === highlightedIndex}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearch('');
                    setHighlightedIndex(-1);
                  }}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    idx === highlightedIndex
                      ? 'bg-primary-50 text-primary-700'
                      : 'hover:bg-slate-50 text-slate-900'
                  }`}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Substitute teaching (T3.7 + T3.8, perm substitute.manage) — ajukan dosen pengganti.
 * Terhubung API nyata: GET/POST /substitute, PUT /substitute/:id/cancel,
 * GET /dosen/lecturers (daftar dosen), GET /dosen/my-classes (kelas + jadwal).
 */
export function DosenSubstitute() {
  const { user } = useAuth();
  const [lecturers, setLecturers] = useState<LecturerBrief[]>([]);
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [requests, setRequests] = useState<SubstituteRequest[]>([]);

  const [originalLecturerId, setOriginalLecturerId] = useState<number | null>(null);
  const [substituteLecturerId, setSubstituteLecturerId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [reqList, lecList, clsList] = await Promise.all([
        getSubstituteRequests(),
        getLecturers(),
        getMyClasses(),
      ]);
      setRequests(reqList.items);
      setLecturers(lecList.items);
      setClasses(clsList.items);
      // Default dosen asli = diri sendiri (cocokkan userId dari /dosen/lecturers)
      if (user?.id) {
        const me = lecList.items.find((l) => l.userId === user.id);
        if (me) {
          setOriginalLecturerId((prev) => prev ?? me.id);
        }
      }
    } catch (_err) {
      setError('Gagal memuat data substitute');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  // Keluhan lama: "dosen asli tidak perlu dipilih karena langsung generate berdasarkan dosen
  // yang login, kecuali user yang login adalah admin akademik" — dropdown dikunci untuk non-admin.
  const isAdmin = user?.role === 'admin_akademik' || user?.role === 'admin_sistem';
  const originalLecturer = lecturers.find((l) => l.id === originalLecturerId) ?? null;

  const handleSubmit = async () => {
    if (!originalLecturerId || !substituteLecturerId || !classId || !scheduleId) {
      setError('Lengkapi dosen asli, dosen pengganti, kelas, dan jadwal pertemuan');
      return;
    }
    if (originalLecturerId === substituteLecturerId) {
      setError('Dosen pengganti tidak boleh sama dengan dosen asli');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await createSubstitute({
        originalLecturerId,
        substituteLecturerId,
        classId,
        scheduleId,
        reason: reason.trim() || undefined,
      });
      setSuccess('Substitute teaching berhasil diajukan (langsung aktif)');
      setSubstituteLecturerId(null);
      setClassId(null);
      setScheduleId(null);
      setReason('');
      await loadData();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else if (apiError.code === 'CONFLICT') {
        setError(apiError.message ?? 'Sudah ada substitute aktif untuk jadwal ini');
      } else {
        setError('Gagal mengirim permintaan pengganti');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (req: SubstituteRequest) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await cancelSubstitute(req.id, 'Dibatalkan oleh dosen');
      setSuccess('Substitute dibatalkan');
      await loadData();
    } catch (_err) {
      setError('Gagal membatalkan substitute');
    } finally {
      setIsLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    cancelled: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-6">
      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Form Substitute</h3>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Dosen Asli</label>
              {isAdmin ? (
                <select
                  value={originalLecturerId ?? ''}
                  onChange={(e) =>
                    setOriginalLecturerId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Pilih Dosen Asli</option>
                  {lecturers.map((lec) => (
                    <option key={lec.id} value={lec.id}>
                      {lec.fullName} ({lec.prodiCode})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm text-slate-700">
                  {originalLecturer
                    ? `${originalLecturer.fullName} (${originalLecturer.prodiCode})`
                    : 'Memuat…'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Dosen Pengganti
              </label>
              <SearchableSelect
                options={lecturers
                  .filter(
                    (lec) =>
                      lec.id !== originalLecturerId &&
                      lec.prodiCode === originalLecturer?.prodiCode,
                  )
                  .map((lec) => ({
                    id: lec.id,
                    label: `${lec.fullName} (${lec.prodiCode})`,
                  }))}
                value={substituteLecturerId}
                onChange={setSubstituteLecturerId}
                placeholder="Pilih Dosen Pengganti"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Kelas</label>
              <SearchableSelect
                options={classes.map((cls) => ({
                  id: cls.id,
                  label: `${cls.courseCode} — ${cls.classCode}`,
                }))}
                value={classId}
                onChange={(val) => { setClassId(val); setScheduleId(null); }}
                placeholder="Pilih Kelas"
              />
              {classes.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Anda belum memiliki kelas dengan jadwal pertemuan.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Jadwal Pertemuan
              </label>
              <SearchableSelect
                options={selectedClass?.schedules.map((s) => ({
                  id: s.id,
                  label: `Pertemuan ${s.meetingNumber} — ${s.scheduledDate}${s.topic ? ` (${s.topic})` : ''}`,
                })) ?? []}
                value={scheduleId}
                onChange={setScheduleId}
                placeholder="Pilih Jadwal"
                maxHeight={180}
              />
            </div>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-slate-700 mb-2">
              Alasan (opsional)
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Mis. Dosen berhalangan hadir karena sakit"
            />
          </div>
        </div>

        {/* Validation Warning */}
        {originalLecturerId === substituteLecturerId && originalLecturerId !== null && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              ⚠️ Dosen pengganti tidak boleh sama dengan dosen asli
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isLoading ||
              !originalLecturerId ||
              !substituteLecturerId ||
              !classId ||
              !scheduleId ||
              originalLecturerId === substituteLecturerId
            }
            className="px-6 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Ajukan Substitute'}
          </button>
        </div>
      </div>

      {/* Existing Substitute Requests */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">
          Permintaan Substitute yang Sudah Ada
        </h3>
        {isLoading && requests.length === 0 ? (
          <p className="text-slate-500">Memuat permintaan substitute...</p>
        ) : requests.length === 0 ? (
          <p className="text-slate-500">Belum ada permintaan substitute.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      {req.courseCode} — {req.classCode} · Pertemuan {req.meetingNumber}
                    </h4>
                    <p className="text-sm text-slate-600">
                      {req.scheduledDate} | {req.originalLecturerName} →{' '}
                      {req.substituteLecturerName ?? 'Belum ditentukan'}
                    </p>
                    {req.reason && <p className="text-sm text-slate-600 mt-1">{req.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        statusColors[req.status] ?? 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {req.status === 'active' ? 'Aktif' : 'Dibatalkan'}
                    </span>
                    {req.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => handleCancel(req)}
                        disabled={isLoading}
                        className="text-xs px-3 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Batalkan
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
