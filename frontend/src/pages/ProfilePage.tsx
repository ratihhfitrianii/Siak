import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, updateMyContact } from '../lib/api';
import { FieldError, FormAlert } from '../components/ErrorInline';

/**
 * Edit Profil (keluhan #26: dropdown avatar → "Edit Profil").
 * PUT /users/me/contact — nama & email; permission user.edit_contact (mahasiswa, admin_sistem).
 */
export function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) {
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await updateMyContact({
        fullName: fullName.trim().length > 0 ? fullName.trim() : undefined,
        email: email.trim().length > 0 ? email.trim() : undefined,
      });
      setSuccess(res.message ?? 'Kontak berhasil diperbarui');
      // Header (nama/role di dropdown avatar) ikut ter-update.
      await refreshMe();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui kontak');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">Edit Profil</h1>
      <p className="mt-1 text-sm text-slate-500">Perbarui nama dan email Anda.</p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        {success && (
          <div
            role="status"
            className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-slate-700">
            Nama Lengkap
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            minLength={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {fullName.length > 0 && fullName.length < 2 && (
            <FieldError id="fullName-error">Nama minimal 2 karakter</FieldError>
          )}
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
        </button>
      </form>
    </div>
  );
}
