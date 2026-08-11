import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  createMasterLecturer,
  createMasterStudent,
  importMasterCsv,
  listMasterLecturers,
  listMasterStudents,
} from '../lib/api';
import type {
  CreateMasterLecturerInput,
  CreateMasterStudentInput,
  ImportResult,
  MasterLecturer,
  MasterStudent,
} from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

type TabKind = 'students' | 'lecturers';
type CreateKind = 'students' | 'lecturers';

const PAGE_SIZE = 20;

const EMPTY_STUDENT_FORM: CreateMasterStudentInput = {
  nim: '',
  fullName: '',
  prodiCode: '',
  angkatan: '',
  email: '',
};

const EMPTY_LECTURER_FORM: CreateMasterLecturerInput = {
  nidn: '',
  fullName: '',
  prodiCode: '',
  email: '',
};

/**
 * Admin Master Data (keluhan #16) — admin sistem dapat melihat Master Mahasiswa &
 * Master Dosen, diinput dari sistem (form manual) ATAU dari CSV (POST /import/*).
 * - Tab Mahasiswa / Dosen: tabel list (NIM/NIDN, nama, prodi, angkatan, email, status)
 * - Pencarian (NIM/NIDN/nama) + filter prodi + pagination
 * - "+ Tambah Manual": modal form (password default = NIM/NIDN, must change password)
 * - "Import CSV": upload file → ringkasan hasil (inserted/updated/failed)
 */
export function AdminMasterPage() {
  const [tab, setTab] = useState<TabKind>('students');

  // --- state list ---
  const [students, setStudents] = useState<MasterStudent[]>([]);
  const [lecturers, setLecturers] = useState<MasterLecturer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [prodiFilter, setProdiFilter] = useState('');
  const [prodis, setProdis] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- state aksi ---
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>('students');
  const [form, setForm] = useState<CreateMasterStudentInput | CreateMasterLecturerInput>(
    EMPTY_STUDENT_FORM,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProdis = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/academic/prodis', {
        headers: { Authorization: `Bearer ${localStorage.getItem('siak.access_token') ?? ''}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        data?: { items?: Array<{ code: string; name: string }> };
      };
      setProdis(body?.data?.items ?? []);
    } catch {
      /* dropdown prodi opsional */
    }
  }, []);

  const load = useCallback(
    async (p: number, q: string, prodi: string) => {
      setLoading(true);
      setError(null);
      try {
        if (tab === 'students') {
          const data = await listMasterStudents({
            page: p,
            limit: PAGE_SIZE,
            search: q || undefined,
            prodi: prodi || undefined,
          });
          setStudents(data.items);
          setTotal(data.pagination.total);
        } else {
          const data = await listMasterLecturers({
            page: p,
            limit: PAGE_SIZE,
            search: q || undefined,
            prodi: prodi || undefined,
          });
          setLecturers(data.items);
          setTotal(data.pagination.total);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat master data');
      } finally {
        setLoading(false);
      }
    },
    [tab],
  );

  // debounce pencarian 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void loadProdis();
  }, [loadProdis]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch, prodiFilter]);

  useEffect(() => {
    void load(page, debouncedSearch, prodiFilter);
  }, [page, debouncedSearch, prodiFilter, load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const openCreate = (kind: CreateKind) => {
    setCreateKind(kind);
    setForm(kind === 'students' ? EMPTY_STUDENT_FORM : EMPTY_LECTURER_FORM);
    setFieldErrors(null);
    setActionError(null);
    setCreateOpen(true);
  };

  const submitCreate = useCallback(async () => {
    if (createKind === 'students') {
      const input = form as CreateMasterStudentInput;
      setCreating(true);
      setActionError(null);
      setFieldErrors(null);
      try {
        await createMasterStudent({
          nim: input.nim.trim(),
          fullName: input.fullName.trim(),
          prodiCode: input.prodiCode.trim(),
          angkatan: input.angkatan.trim(),
          email: input.email?.trim() || undefined,
        });
        setCreateOpen(false);
        setSuccess(`Mahasiswa ${input.nim.trim()} berhasil dibuat (password awal = NIM).`);
        setPage(1);
        await load(1, debouncedSearch, prodiFilter);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.fields) setFieldErrors(err.fields);
          else setActionError(err.message);
        } else {
          setActionError('Gagal membuat mahasiswa');
        }
      } finally {
        setCreating(false);
      }
      return;
    }
    const input = form as CreateMasterLecturerInput;
    setCreating(true);
    setActionError(null);
    setFieldErrors(null);
    try {
      await createMasterLecturer({
        nidn: input.nidn.trim(),
        fullName: input.fullName.trim(),
        prodiCode: input.prodiCode.trim(),
        email: input.email?.trim() || undefined,
      });
      setCreateOpen(false);
      setSuccess(`Dosen ${input.nidn.trim()} berhasil dibuat (password awal = NIDN).`);
      setPage(1);
      await load(1, debouncedSearch, prodiFilter);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setFieldErrors(err.fields);
        else setActionError(err.message);
      } else {
        setActionError('Gagal membuat dosen');
      }
    } finally {
      setCreating(false);
    }
  }, [createKind, form, debouncedSearch, prodiFilter, load]);

  const handleImportFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportResult(null);
      setActionError(null);
      try {
        const result = await importMasterCsv(tab, file);
        setImportResult(result);
        setSuccess(
          `Import ${file.name} selesai: ${result.inserted} baru, ${result.updated} diperbarui, ${result.failed.length} gagal.`,
        );
        await load(1, debouncedSearch, prodiFilter);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Import CSV gagal');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [tab, debouncedSearch, prodiFilter, load],
  );

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const labelCls = 'block text-sm font-medium text-slate-700';
  const errText = (field: string): string | undefined =>
    fieldErrors?.[field] ? fieldErrors[field].join(', ') : undefined;

  const isStudentTab = tab === 'students';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Master Data</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola master {isStudentTab ? 'mahasiswa' : 'dosen'} — input manual atau import CSV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            {importing ? 'Mengimpor…' : 'Import CSV'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => openCreate(tab)}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
          >
            + Tambah Manual
          </button>
        </div>
      </div>

      {/* Tab Mahasiswa / Dosen */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1" role="tablist">
        {(
          [
            { kind: 'students', label: 'Master Mahasiswa' },
            { kind: 'lecturers', label: 'Master Dosen' },
          ] as const
        ).map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            aria-selected={tab === t.kind}
            onClick={() => setTab(t.kind)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.kind ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {success}
        </div>
      )}
      {actionError && <FormAlert>{actionError}</FormAlert>}

      {importResult && importResult.failed.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            {importResult.failed.length} baris gagal diproses:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            {importResult.failed.slice(0, 10).map((f) => (
              <li key={f.row}>
                Baris {f.row}: {f.reason}
              </li>
            ))}
            {importResult.failed.length > 10 && (
              <li>…dan {importResult.failed.length - 10} baris lainnya.</li>
            )}
          </ul>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={isStudentTab ? 'Cari NIM atau nama…' : 'Cari NIDN atau nama…'}
          aria-label="Cari master data"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <select
          value={prodiFilter}
          onChange={(e) => {
            setProdiFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter prodi"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">Semua prodi</option>
          {prodis.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void load(page, debouncedSearch, prodiFilter)}
            className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Coba lagi
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-label="Memuat">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                {isStudentTab ? (
                  <>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      NIM
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Nama
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Prodi
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Angkatan
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Status
                    </th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      NIDN
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Nama
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Prodi
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Wali
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                      Status
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isStudentTab ? (
                students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Tidak ada mahasiswa yang cocok.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                        {s.nim}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.fullName}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.prodiCode} — {s.prodiName}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.angkatan}</td>
                      <td className="px-4 py-3 text-slate-600">{s.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            s.userActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {s.userActive ? s.status : 'Nonaktif'}
                        </span>
                      </td>
                    </tr>
                  ))
                )
              ) : lecturers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada dosen yang cocok.
                  </td>
                </tr>
              ) : (
                lecturers.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                      {l.nidn}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{l.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {l.prodiCode} — {l.prodiName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{l.email}</td>
                    <td className="px-4 py-3 text-slate-600">{l.isWali ? 'Ya' : '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          l.userActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {l.userActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <span className="text-xs text-slate-500">
              Halaman {page} dari {totalPages} · {total} {isStudentTab ? 'mahasiswa' : 'dosen'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tambah manual */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Tambah ${createKind === 'students' ? 'mahasiswa' : 'dosen'}`}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              Tambah {createKind === 'students' ? 'Mahasiswa' : 'Dosen'} Manual
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Password awal = {createKind === 'students' ? 'NIM' : 'NIDN'} · wajib diganti saat
              login pertama.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="am-nim" className={labelCls}>
                  {createKind === 'students' ? 'NIM' : 'NIDN'}
                </label>
                <input
                  id="am-nim"
                  className={inputCls}
                  value={
                    createKind === 'students'
                      ? (form as CreateMasterStudentInput).nim
                      : (form as CreateMasterLecturerInput).nidn
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      ...(createKind === 'students'
                        ? { nim: e.target.value }
                        : { nidn: e.target.value }),
                    }))
                  }
                  placeholder={
                    createKind === 'students' ? 'contoh: 2412345678' : 'contoh: 1234567890'
                  }
                />
                {errText('nim') && <p className="mt-1 text-xs text-red-600">{errText('nim')}</p>}
                {errText('nidn') && <p className="mt-1 text-xs text-red-600">{errText('nidn')}</p>}
              </div>
              <div>
                <label htmlFor="am-nama" className={labelCls}>
                  Nama Lengkap
                </label>
                <input
                  id="am-nama"
                  className={inputCls}
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Nama lengkap"
                />
                {errText('fullName') && (
                  <p className="mt-1 text-xs text-red-600">{errText('fullName')}</p>
                )}
              </div>
              <div>
                <label htmlFor="am-prodi" className={labelCls}>
                  Prodi
                </label>
                <select
                  id="am-prodi"
                  className={inputCls}
                  value={form.prodiCode}
                  onChange={(e) => setForm((f) => ({ ...f, prodiCode: e.target.value }))}
                >
                  <option value="">Pilih prodi…</option>
                  {prodis.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
                {errText('prodiCode') && (
                  <p className="mt-1 text-xs text-red-600">{errText('prodiCode')}</p>
                )}
              </div>
              {createKind === 'students' && (
                <div>
                  <label htmlFor="am-angkatan" className={labelCls}>
                    Angkatan
                  </label>
                  <input
                    id="am-angkatan"
                    className={inputCls}
                    value={(form as CreateMasterStudentInput).angkatan}
                    onChange={(e) => setForm((f) => ({ ...f, angkatan: e.target.value }))}
                    placeholder="contoh: 2024/2025"
                  />
                  {errText('angkatan') && (
                    <p className="mt-1 text-xs text-red-600">{errText('angkatan')}</p>
                  )}
                </div>
              )}
              <div>
                <label htmlFor="am-email" className={labelCls}>
                  Email (opsional)
                </label>
                <input
                  id="am-email"
                  type="email"
                  className={inputCls}
                  value={form.email ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="nama@kampus.ac.id"
                />
                {errText('email') && (
                  <p className="mt-1 text-xs text-red-600">{errText('email')}</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void submitCreate()}
                disabled={creating}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                {creating ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
