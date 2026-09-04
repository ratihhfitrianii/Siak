import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  createUser,
  deleteUser,
  listAcademicFaculties,
  listUsers,
  lookupUserForCreate,
  updateUserRole,
} from '../lib/api';
import type {
  CreateUserInput,
  UserListItem,
  UserCreateLookup,
  UpdateRoleInput,
  Faculty,
} from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

const ROLE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'mahasiswa', label: 'Mahasiswa' },
  { code: 'dosen', label: 'Dosen' },
  { code: 'admin_akademik', label: 'Admin Akademik' },
  { code: 'admin_keuangan', label: 'Admin Keuangan' },
  { code: 'admin_sistem', label: 'Admin Sistem' },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.code, o.label]),
);

const PAGE_SIZE = 20;

interface UserFormState {
  email: string;
  password: string;
  fullName: string;
  roleCode: string;
  isWali: boolean;
  nim: string;
  nik: string;
  adminFacultyCode: string;
}

const EMPTY_FORM: UserFormState = {
  email: '',
  password: '',
  fullName: '',
  roleCode: 'mahasiswa',
  isWali: false,
  nim: '',
  nik: '',
  adminFacultyCode: '',
};

type LookupStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: UserCreateLookup }
  | { status: 'notfound' }
  | { status: 'error'; message: string };

/** Peran berbasis NIM/NIK (lookup master data; kolom lain auto + readonly). */
const NIM_NIK_ROLES = new Set(['mahasiswa', 'dosen']);

/** Halaman manajemen pengguna (T1.11c, perm user.manage) — list + filter + buat user + ubah role. */
export function UsersPage() {
  const [items, setItems] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // modal buat user
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [creating, setCreating] = useState(false);
  const [lookup, setLookup] = useState<LookupStatus>({ status: 'idle' });
  const [faculties, setFaculties] = useState<Faculty[]>([]);

  // modal ubah role
  const [editTarget, setEditTarget] = useState<UserListItem | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editWali, setEditWali] = useState(false);
  const [editFaculty, setEditFaculty] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async (p: number, role: string, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers({
        page: p,
        limit: PAGE_SIZE,
        role: role || undefined,
        search: q || undefined,
      });
      setItems(data.items);
      setTotal(data.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat daftar pengguna');
    } finally {
      setLoading(false);
    }
  }, []);

  // debounce pencarian 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void load(page, roleFilter, debouncedSearch);
  }, [page, roleFilter, debouncedSearch, load]);

  // Load daftar fakultas sekali saat mount (dipakai create & edit modal Admin Akademik).
  useEffect(() => {
    void listAcademicFaculties({ limit: 100 })
      .then((res) => setFaculties(res.items ?? []))
      .catch(() => setFaculties([]));
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFieldErrors(null);
    setActionError(null);
    setLookup({ status: 'idle' });
    setCreateOpen(true);
  };

  // Lookup master data saat ketik NIM/NIK (debounce 400ms) — preview kolom auto + readonly.
  const useNimNik = NIM_NIK_ROLES.has(form.roleCode);
  const identifier = form.roleCode === 'mahasiswa' ? form.nim : form.nik;
  useEffect(() => {
    if (!useNimNik || !createOpen) {
      setLookup({ status: 'idle' });
      return;
    }
    const id = identifier.trim();
    if (!id) {
      setLookup({ status: 'idle' });
      return;
    }
    setLookup((l) => (l.status === 'ok' || l.status === 'notfound' ? { status: 'loading' } : l));
    const t = setTimeout(() => {
      lookupUserForCreate(form.roleCode as 'mahasiswa' | 'dosen', id)
        .then((d) => setLookup(d.found ? { status: 'ok', data: d } : { status: 'notfound' }))
        .catch(() => setLookup({ status: 'error', message: 'Gagal mencari data. Coba lagi.' }));
    }, 400);
    return () => clearTimeout(t);
  }, [useNimNik, createOpen, form.roleCode, identifier]);

  const submitCreate = useCallback(async () => {
    setCreating(true);
    setActionError(null);
    setFieldErrors(null);
    try {
      const useNimNikFlow = NIM_NIK_ROLES.has(form.roleCode);
      const input: CreateUserInput = useNimNikFlow
        ? {
            roleCode: form.roleCode as 'mahasiswa' | 'dosen',
            ...(form.roleCode === 'mahasiswa'
              ? { nim: form.nim.trim() }
              : { nik: form.nik.trim() }),
          }
        : {
            roleCode: form.roleCode as 'admin_akademik' | 'admin_keuangan' | 'admin_sistem',
            email: form.email.trim(),
            password: form.password,
            fullName: form.fullName.trim(),
            isWali: form.roleCode === 'dosen' && form.isWali,
            ...(form.roleCode === 'admin_akademik'
              ? { adminFacultyCode: form.adminFacultyCode || undefined }
              : {}),
          };
      const res = await createUser(input);
      setCreateOpen(false);
      setSuccess(res.message ?? `User ${res.email} berhasil dibuat.`);
      setPage(1);
      await load(1, roleFilter, debouncedSearch);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) {
          setFieldErrors(err.fields);
        } else {
          setActionError(err.message);
        }
      } else {
        setActionError('Gagal membuat user');
      }
    } finally {
      setCreating(false);
    }
  }, [form, roleFilter, debouncedSearch, load]);

  const openEdit = (u: UserListItem) => {
    setEditTarget(u);
    setEditRole(u.roleCode);
    setEditWali(u.isWali);
    setEditFaculty(u.adminFacultyCode ?? '');
    setActionError(null);
  };

  const submitEdit = useCallback(async () => {
    if (!editTarget) return;
    setEditing(true);
    setActionError(null);
    try {
      const input: UpdateRoleInput = {
        roleCode: editRole as UpdateRoleInput['roleCode'],
        isWali: editRole === 'dosen' && editWali,
        adminFacultyCode: editRole === 'admin_akademik' ? editFaculty || undefined : undefined,
      };
      await updateUserRole(editTarget.id, input);
      setEditTarget(null);
      setSuccess(
        `Role ${editTarget.email} diperbarui menjadi ${ROLE_LABEL[editRole] ?? editRole}.`,
      );
      await load(page, roleFilter, debouncedSearch);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Gagal mengubah role');
    } finally {
      setEditing(false);
    }
  }, [editTarget, editRole, editWali, editFaculty, page, roleFilter, debouncedSearch, load]);

  // Keluhan lama: "hanya admin sistem yang dapat menghapus ... user" — soft-delete (nonaktifkan).
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const handleDelete = useCallback(
    async (u: UserListItem) => {
      const ok = window.confirm(
        `Nonaktifkan user ${u.fullName} (${u.email})? Akun tidak bisa login lagi.`,
      );
      if (!ok) return;
      setDeletingId(u.id);
      setActionError(null);
      try {
        const res = await deleteUser(u.id);
        setSuccess(res.message ?? `User ${u.email} dinonaktifkan.`);
        await load(page, roleFilter, debouncedSearch);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Gagal menonaktifkan user');
      } finally {
        setDeletingId(null);
      }
    },
    [page, roleFilter, debouncedSearch, load],
  );

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const labelCls = 'block text-sm font-medium text-slate-700';
  const errText = (field: string): string | undefined =>
    fieldErrors?.[field] ? fieldErrors[field].join(', ') : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          type="button"
          onClick={openCreate}
          className="w-full sm:w-auto rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
        >
          + Buat User
        </button>
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

      {/* Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari nama atau email…"
          aria-label="Cari pengguna"
          className="w-full sm:w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter peran"
          className="w-full sm:w-auto rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">Semua peran</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void load(page, roleFilter, debouncedSearch)}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Nama
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Peran
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Wali
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Tidak ada pengguna yang cocok.
                    </td>
                  </tr>
                ) : (
                  items.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{u.fullName}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                          {ROLE_LABEL[u.roleCode] ?? u.roleCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.isWali ? 'Ya' : '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            u.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {u.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            Ubah Peran
                          </button>
                          {u.isActive && (
                            <button
                              type="button"
                              onClick={() => void handleDelete(u)}
                              disabled={deletingId === u.id}
                              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingId === u.id ? 'Menghapus…' : 'Hapus'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <span className="text-xs text-slate-500">
              Halaman {page} dari {totalPages} · {total} pengguna
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

      {/* Modal buat user */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Buat user"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Buat User Baru</h2>
            <p className="mt-1 text-sm text-slate-500">
              {useNimNik
                ? 'Cukup pilih peran + isi NIM/NIK — kolom lain terisi otomatis (readonly).'
                : 'Peran admin tidak punya NIM/NIK — isi manual.'}
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="cu-role" className={labelCls}>
                  Peran
                </label>
                <select
                  id="cu-role"
                  className={inputCls}
                  value={form.roleCode}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, roleCode: e.target.value }));
                    setLookup({ status: 'idle' });
                  }}
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {useNimNik ? (
                <>
                  <div>
                    <label htmlFor="cu-nimnik" className={labelCls}>
                      {form.roleCode === 'mahasiswa' ? 'NIM' : 'NIK'}
                    </label>
                    <input
                      id="cu-nimnik"
                      className={inputCls}
                      value={identifier}
                      onChange={(e) =>
                        setForm((f) =>
                          form.roleCode === 'mahasiswa'
                            ? { ...f, nim: e.target.value }
                            : { ...f, nik: e.target.value },
                        )
                      }
                      placeholder={
                        form.roleCode === 'mahasiswa' ? 'cth: 22051001' : 'cth: 198512342010011001'
                      }
                    />
                  </div>

                  {lookup.status === 'loading' && (
                    <p className="text-xs text-slate-500" role="status">
                      Mencari data…
                    </p>
                  )}
                  {lookup.status === 'notfound' && (
                    <p className="text-xs text-red-600" role="alert">
                      {form.roleCode === 'mahasiswa' ? 'NIM' : 'NIK'} tidak ditemukan di data{' '}
                      {form.roleCode === 'mahasiswa' ? 'mahasiswa' : 'dosen'} — impor data atau
                      tambah via Master Data dulu.
                    </p>
                  )}
                  {lookup.status === 'error' && (
                    <p className="text-xs text-red-600" role="alert">
                      {lookup.message}
                    </p>
                  )}

                  {lookup.status === 'ok' && lookup.data && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <label htmlFor="cu-preview-nama" className={labelCls}>
                          Nama Lengkap
                        </label>
                        <input
                          id="cu-preview-nama"
                          className={inputCls}
                          value={lookup.data.fullName ?? ''}
                          readOnly
                          aria-readonly="true"
                        />
                      </div>
                      <div>
                        <label htmlFor="cu-preview-email" className={labelCls}>
                          Email
                        </label>
                        <input
                          id="cu-preview-email"
                          className={inputCls}
                          value={lookup.data.email ?? ''}
                          readOnly
                          aria-readonly="true"
                        />
                      </div>
                      <div>
                        <label htmlFor="cu-preview-prodi" className={labelCls}>
                          Prodi
                        </label>
                        <input
                          id="cu-preview-prodi"
                          className={inputCls}
                          value={lookup.data.prodiName ?? ''}
                          readOnly
                          aria-readonly="true"
                        />
                      </div>
                      <p className="text-xs text-slate-600">
                        Password awal ={' '}
                        <strong>{form.roleCode === 'mahasiswa' ? 'NIM' : 'NIK'}</strong> · wajib
                        diganti saat login pertama
                        {lookup.data.isActive === false &&
                          ' · akun nonaktif akan diaktifkan kembali'}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="cu-nama" className={labelCls}>
                      Nama Lengkap
                    </label>
                    <input
                      id="cu-nama"
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
                    <label htmlFor="cu-email" className={labelCls}>
                      Email
                    </label>
                    <input
                      id="cu-email"
                      type="email"
                      className={inputCls}
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="nama@kampus.ac.id"
                    />
                    {errText('email') && (
                      <p className="mt-1 text-xs text-red-600">{errText('email')}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="cu-password" className={labelCls}>
                      Password Awal
                    </label>
                    <input
                      id="cu-password"
                      type="password"
                      className={inputCls}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Minimal 8 karakter"
                    />
                    {errText('password') && (
                      <p className="mt-1 text-xs text-red-600">{errText('password')}</p>
                    )}
                  </div>
                  {form.roleCode === 'admin_akademik' && (
                    <div>
                      <label htmlFor="cu-fakultas" className={labelCls}>
                        Fakultas
                      </label>
                      <select
                        id="cu-fakultas"
                        className={inputCls}
                        value={form.adminFacultyCode}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, adminFacultyCode: e.target.value }))
                        }
                      >
                        <option value="">— Pilih Fakultas —</option>
                        {faculties
                          .filter((f) => f.isActive)
                          .map((f) => (
                            <option key={f.id} value={f.code}>
                              {f.code} - {f.name}
                            </option>
                          ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        Admin akademik wajib terikat ke 1 fakultas. Maksimal 3 admin per fakultas.
                      </p>
                      {errText('adminFacultyCode') && (
                        <p className="mt-1 text-xs text-red-600">{errText('adminFacultyCode')}</p>
                      )}
                    </div>
                  )}
                </>
              )}
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
                disabled={creating || (useNimNik && lookup.status !== 'ok')}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                {creating ? 'Membuat…' : 'Buat User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ubah peran */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ubah peran"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Ubah Peran</h2>
            <p className="mt-1 text-sm text-slate-500">
              {editTarget.fullName} · {editTarget.email}
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ur-role" className={labelCls}>
                  Peran Baru
                </label>
                <select
                  id="ur-role"
                  className={inputCls}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {editRole === 'dosen' && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editWali}
                    onChange={(e) => setEditWali(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600"
                  />
                  Dosen Wali
                </label>
              )}
              {editRole === 'admin_akademik' && (
                <div>
                  <label htmlFor="ur-fakultas" className={labelCls}>
                    Fakultas
                  </label>
                  <select
                    id="ur-fakultas"
                    className={inputCls}
                    value={editFaculty}
                    onChange={(e) => setEditFaculty(e.target.value)}
                  >
                    <option value="">— Pilih Fakultas —</option>
                    {faculties
                      .filter((f) => f.isActive)
                      .map((f) => (
                        <option key={f.id} value={f.code}>
                          {f.code} - {f.name}
                        </option>
                      ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Maksimal 3 admin akademik per fakultas.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={editing}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void submitEdit()}
                disabled={editing}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                {editing ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
