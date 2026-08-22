import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { FieldError, FormAlert } from '../components/ErrorInline';

interface FieldErrors {
  currentPassword?: string[];
  newPassword?: string[];
  confirmPassword?: string[];
  [key: string]: string[] | undefined;
}

/**
 * Ganti password (F-18, T1.11a) — wajib untuk akun impor (mustChangePassword=true).
 * Validasi client: new ≥ 8 karakter + konfirmasi cocok; error field dari backend ditampilkan inline.
 */
export function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);

    const clientErrors: FieldErrors = {};
    if (newPassword.length < 8) {
      clientErrors.newPassword = ['Password baru minimal 8 karakter'];
    }
    if (confirmPassword !== newPassword) {
      clientErrors.confirmPassword = ['Konfirmasi password tidak cocok'];
    }
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess('Password berhasil diubah.');
      setTimeout(() => navigate('/', { replace: true }), 800);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields ?? {});
        setFormError(err.fields && Object.keys(err.fields).length > 0 ? null : err.message);
      } else {
        setFormError('Terjadi kesalahan. Coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary-500/40 ${
      hasError ? 'border-red-400' : 'border-slate-300 focus:border-primary-500'
    }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Ganti Password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Anda harus mengganti password sebelum dapat melanjutkan.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          className="rounded-2xl bg-white p-6 shadow-lg"
        >
          {formError && <FormAlert>{formError}</FormAlert>}
          {success && (
            <div
              role="status"
              className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
            >
              {success}
            </div>
          )}

          <div className="mb-4">
            <label
              htmlFor="currentPassword"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password saat ini
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              aria-describedby={fieldErrors.currentPassword ? 'currentPassword-error' : undefined}
              className={inputClass(Boolean(fieldErrors.currentPassword))}
            />
            {fieldErrors.currentPassword && (
              <FieldError id="currentPassword-error">{fieldErrors.currentPassword[0]}</FieldError>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-slate-700">
              Password baru
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby={fieldErrors.newPassword ? 'newPassword-error' : undefined}
              className={inputClass(Boolean(fieldErrors.newPassword))}
              placeholder="Minimal 8 karakter"
            />
            {fieldErrors.newPassword && (
              <FieldError id="newPassword-error">{fieldErrors.newPassword[0]}</FieldError>
            )}
          </div>

          <div className="mb-4">
            <label
              htmlFor="confirmPassword"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Konfirmasi password baru
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined}
              className={inputClass(Boolean(fieldErrors.confirmPassword))}
            />
            {fieldErrors.confirmPassword && (
              <FieldError id="confirmPassword-error">{fieldErrors.confirmPassword[0]}</FieldError>
            )}
          </div>

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={loading}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses…' : 'Simpan Password Baru'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
