import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext';

/**
 * Guard rute T1.11a:
 * - booting (restore sesi) → spinner
 * - belum login → /login (simpan lokasi asal untuk redirect setelah login)
 * - mustChangePassword → paksa /ganti-password (kecuali sudah di halaman itu)
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
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

  return <>{children}</>;
}
