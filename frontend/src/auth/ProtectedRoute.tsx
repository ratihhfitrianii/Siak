import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { Spinner } from '../components/Spinner';

/**
 * Guard rute T1.11a:
 * - booting (restore sesi) → spinner
 * - belum login → /login (simpan lokasi asal untuk redirect setelah login)
 * - mustChangePassword → paksa /ganti-password (kecuali sudah di halaman itu)
 * - perm (opsional) → user tanpa permission mendapat AccessDenied (403);
 *   array = cukup salah satu (OR)
 */
export function ProtectedRoute({
  children,
  perm,
}: {
  children: ReactNode;
  perm?: string | string[];
}) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spinner label="Memuat" />
      </div>
    );
  }

  if (!user) {
    // Saat sudah di /login (mis. logout dari halaman terproteksi), JANGAN render Navigate:
    // <Navigate state={{from}}> dari sini bisa menimpa state /login lewat passive effect
    // (race) → user yang login berikutnya diarahkan ke halaman yang bukan haknya
    // (keluhan: mahasiswa logout dari /pembayaran → dosen login malah diarahkan ke sana).
    if (location.pathname === '/login') {
      return null;
    }
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/ganti-password') {
    return <Navigate to="/ganti-password" replace />;
  }

  const denied =
    perm !== undefined &&
    (Array.isArray(perm) ? !perm.some((p) => user.menu.includes(p)) : !user.menu.includes(perm));

  if (denied) {
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
