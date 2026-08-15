import { useCallback, useEffect, useState } from 'react';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../lib/api';
import type { Announcement, CreateAnnouncementInput } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

const ROLE_OPTIONS = [
  { code: 'mahasiswa', label: 'Mahasiswa' },
  { code: 'dosen', label: 'Dosen' },
  { code: 'admin_akademik', label: 'Admin Akademik' },
  { code: 'admin_keuangan', label: 'Admin Keuangan' },
  { code: 'admin_sistem', label: 'Admin Sistem' },
];

/** Halaman Informasi Penting (Admin Sistem) — CRUD Announcements. */
export function AnnouncementPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form
  const [form, setForm] = useState<CreateAnnouncementInput>({
    title: '',
    message: '',
    targetRoles: [],
    priority: 0,
    isActive: true,
    publishedAt: null,
    expiresAt: null,
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await getAnnouncements(1, 50);
      setAnnouncements(data.items);
    } catch {
      setError('Gagal memuat data informasi penting');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadAnnouncements().finally(() => setLoading(false));
  }, [loadAnnouncements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const payload = { ...form, targetRoles: (form.targetRoles ?? []).filter(Boolean) };
      if (editingId) {
        await updateAnnouncement(editingId, payload);
        setSuccess('Informasi penting berhasil diupdate');
      } else {
        await createAnnouncement(payload);
        setSuccess('Informasi penting berhasil dibuat');
      }
      setForm({
        title: '',
        message: '',
        targetRoles: [],
        priority: 0,
        isActive: true,
        publishedAt: null,
        expiresAt: null,
      });
      setEditingId(null);
      await loadAnnouncements();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan informasi penting');
    }
  };

  const handleEdit = (a: Announcement) => {
    setForm({
      title: a.title,
      message: a.message,
      targetRoles: a.targetRoles,
      priority: a.priority,
      isActive: a.isActive,
      publishedAt: a.publishedAt,
      expiresAt: a.expiresAt,
    });
    setEditingId(a.id);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan informasi penting ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteAnnouncement(id);
      setSuccess('Informasi penting dinonaktifkan');
      await loadAnnouncements();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan informasi penting');
    }
  };

  const handleCancel = () => {
    setForm({
      title: '',
      message: '',
      targetRoles: [],
      priority: 0,
      isActive: true,
      publishedAt: null,
      expiresAt: null,
    });
    setEditingId(null);
  };

  if (loading) return <div className="p-6 text-center text-slate-500">Memuat data...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Informasi Penting</h2>
        <p className="text-slate-600">
          Kelola informasi penting yang akan ditampilkan di dashboard mahasiswa dan dosen.
          Pilih target role (kosong = semua role). Priority lebih tinggi ditampilkan lebih atas.
        </p>
      </div>

      {error && <FormAlert>{error}</FormAlert>}
      {success && (
        <p role="status" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {success}
        </p>
      )}

      {/* Form */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-slate-900">
            {editingId ? 'Edit Informasi Penting' : 'Tambah Informasi Penting'}
          </h3>
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600"
          >
            Batal
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Judul *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Contoh: Jadwal UTS Semester Ganjil"
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Pesan *</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Isi informasi lengkap di sini..."
                rows={4}
                maxLength={5000}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Role (kosong = semua)</label>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <label key={r.code} className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(form.targetRoles ?? []).includes(r.code)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          targetRoles: e.target.checked
                            ? [...(form.targetRoles ?? []), r.code]
                            : (form.targetRoles ?? []).filter((c) => c !== r.code),
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prioritas (0-100)</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}
                min={0}
                max={100}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-slate-500">Lebih tinggi = ditampilkan lebih atas</p>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">Aktif (dapat ditampilkan)</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Publikasi (opsional)</label>
              <input
                type="datetime-local"
                value={form.publishedAt ? form.publishedAt.slice(0, 16) : ''}
                onChange={(e) => setForm({ ...form, publishedAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-slate-500">Kosong = segera (sebelum sekarang)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Berakhir (opsional)</label>
              <input
                type="datetime-local"
                value={form.expiresAt ? form.expiresAt.slice(0, 16) : ''}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-slate-500">Kosong = tidak kedaluwarsa</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              {editingId ? 'Update' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Daftar Informasi Penting</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-medium">Judul</th>
                <th className="pb-2 font-medium">Target Role</th>
                <th className="pb-2 font-medium">Prioritas</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Publikasi</th>
                <th className="pb-2 font-medium">Berakhir</th>
                <th className="pb-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {announcements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Belum ada informasi penting.
                  </td>
                </tr>
              ) : (
                announcements.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 text-slate-900 max-w-xs truncate" title={a.title}>
                      {a.title}
                    </td>
                    <td className="py-3 text-slate-700">
                      {a.targetRoles.length === 0 ? (
                        <span className="text-slate-500">Semua</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {a.targetRoles.map((r) => (
                            <span
                              key={r}
                              className="inline-flex px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded"
                            >
                              {ROLE_OPTIONS.find((o) => o.code === r)?.label ?? r}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                        {a.priority}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          a.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {a.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">
                      {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('id-ID') : 'Segera'}
                    </td>
                    <td className="py-3 text-slate-600">
                      {a.expiresAt ? new Date(a.expiresAt).toLocaleDateString('id-ID') : 'Tidak ada'}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(a)}
                          className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                        >
                          Nonaktifkan
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}