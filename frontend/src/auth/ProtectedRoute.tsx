import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext';

/**
 * Guard rute T1.11a:
 * - booting (restore sesi) → spinner
 * - belum login → /login (simpan lokasi asal untuk redirect setelah login)
 * - mustChangePassword → paksa /ganti-password (kecuali sudah di halaman itu)
 * - perm (opsional) → user tanpa permission mendapat AccessDenied (403)
 */
export function ProtectedRoute({ children, perm }: { children: ReactNode; perm?: string }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-100"
        role="status"
        aria-label="Memuat"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/ganti-password') {
    return <Navigate to="/ganti-password" replace />;
  }

  if (perm && !user.menu.includes(perm)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-center">
        <p className="text-5xl font-bold text-slate-300">403</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">Akses ditolak</h1>
        <p className="mt-1 text-sm text-slate-500">Anda tidak memiliki izin untuk halaman ini.</p>
      </div>
    );
  }

  return <>{children}</>;
}
