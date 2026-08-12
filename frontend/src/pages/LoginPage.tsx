import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth, type MeUser } from '../auth/AuthContext';
import { ApiError, NetworkError } from '../lib/api';
import { FieldError, FormAlert } from '../components/ErrorInline';

interface FieldErrors {
  identifier?: string[];
  password?: string[];
  [key: string]: string[] | undefined;
}

/**
 * Peta path → permission yang dibutuhkan (sinkron dgn prop `perm` di App.tsx).
 * Dipakai utk memastikan redirect pasca-login tidak mengirim user ke halaman
 * yang tak punya akses (keluhan #14 — admin keuangan diarahkan ke /keuangan/tagihan
 * padahal login dari halaman terlarang → 403).
 */
const ROUTE_PERMS: Record<string, string | string[]> = {
  '/krs': ['krs.fill', 'krs.approve'],
  '/transkrip': 'transcript.view_own',
  '/pembayaran': 'krs.fill',
  '/keuangan/tagihan': 'payment.update',
  '/users': 'user.manage',
  '/admin/master': 'user.manage',
  '/profil': 'user.edit_contact',
};

/** Path tujuan aman: `from` bila user punya akses, selain itu dashboard. */
function safeFrom(from: string, user: MeUser): string {
  if (from === '/' || from === '') return '/';
  // Route dinamis dosen: /dosen & /dosen/:tab — butuh lecturer.select_course.
  if (from === '/dosen' || from.startsWith('/dosen/')) {
    return user.menu.includes('lecturer.select_course') ? from : '/';
  }
  const perm = ROUTE_PERMS[from];
  if (perm === undefined) return from; // path tanpa guard → aman
  const has = Array.isArray(perm)
    ? perm.some((p) => user.menu.includes(p))
    : user.menu.includes(perm);
  return has ? from : '/';
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    const target = user.mustChangePassword ? '/ganti-password' : safeFrom(from, user);
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const me = await login(identifier, password);
      navigate(safeFrom(from, me), { replace: true });
    } catch (err) {
      if (err instanceof NetworkError) {
        setFormError(err.message);
      } else if (err instanceof ApiError) {
        setFieldErrors(err.fields ?? {});
        setFormError(err.fields && Object.keys(err.fields).length > 0 ? null : err.message);
      } else {
        setFormError('Terjadi kesalahan. Coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-xl font-bold text-white">
            S
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Masuk ke Siak</h1>
          <p className="mt-1 text-sm text-slate-600">Sistem Informasi Akademik</p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          className="rounded-2xl bg-white p-6 shadow-lg"
        >
          {formError && <FormAlert>{formError}</FormAlert>}

          <div className="mb-4">
            <label htmlFor="identifier" className="mb-1 block text-sm font-medium text-slate-700">
              NIM / NIK / Email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={Boolean(fieldErrors.identifier)}
              aria-describedby={fieldErrors.identifier ? 'identifier-error' : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary-500/40 ${
                fieldErrors.identifier
                  ? 'border-red-400'
                  : 'border-slate-300 focus:border-primary-500'
              }`}
              placeholder="NIM (mahasiswa), NIK (dosen), atau email"
            />
            {fieldErrors.identifier && (
              <FieldError id="identifier-error">{fieldErrors.identifier[0]}</FieldError>
            )}
          </div>

          <div className="mb-2">
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm outline-none transition focus:ring-2 focus:ring-primary-500/40 ${
                  fieldErrors.password
                    ? 'border-red-400'
                    : 'border-slate-300 focus:border-primary-500'
                }`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {fieldErrors.password && (
              <FieldError id="password-error">{fieldErrors.password[0]}</FieldError>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Memproses…' : 'Masuk'}
          </button>

          <p className="mt-4 text-center text-xs text-slate-600">
            Akun mahasiswa/dosen menggunakan email institusi. Hubungi Admin Sistem bila lupa
            password.
          </p>
        </form>
      </div>
    </div>
  );
}
