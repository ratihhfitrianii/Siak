import { Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * Router aplikasi T1.11a.
 * - /login        → halaman masuk (redirect ke '/' bila sudah login)
 * - /ganti-password → wajib saat mustChangePassword (F-18)
 * - /             → dashboard (protected)
 * - menu peran (krs, transkrip, nilai, users, audit, pembayaran) → ComingSoon di T1.11a,
 *   diisi konten nyata di T1.11b (mahasiswa) & T1.11c (admin).
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/ganti-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/krs"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ComingSoonPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transkrip"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ComingSoonPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nilai"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ComingSoonPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ComingSoonPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ComingSoonPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pembayaran"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ComingSoonPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
