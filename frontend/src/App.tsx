import { Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { AdminKrsPage } from './pages/AdminKrsPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { DosenDashboardPage } from './pages/DosenDashboardPage';
import { FinancePaymentsPage } from './pages/FinancePaymentsPage';
import { KrsPage } from './pages/KrsPage';
import { LoginPage } from './pages/LoginPage';
import { MyPaymentPage } from './pages/MyPaymentPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { TranscriptPage } from './pages/TranscriptPage';
import { UsersPage } from './pages/UsersPage';
import { WaitingRoomPage } from './pages/WaitingRoomPage';

/** Pilih halaman KRS sesuai peran: mahasiswa (krs.fill) → KRS sendiri; admin (krs.approve) → persetujuan. */
function KrsRoute() {
  const { user } = useAuth();
  if (!user) return null;
  return user.menu.includes('krs.fill') ? <KrsPage /> : <AdminKrsPage />;
}

/** Dashboard sesuai peran: dosen → DosenDashboardPage; lainnya → DashboardPage. */
function DashboardRoute() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'dosen' ? <DosenDashboardPage /> : <DashboardPage />;
}

/**
 * Router aplikasi T1.11c.
 * - /login          → halaman masuk (redirect ke '/' bila sudah login)
 * - /ganti-password → wajib saat mustChangePassword (F-18)
 * - /               → dashboard (protected, role-aware)
 * - /krs            → KRS mahasiswa (krs.fill) / persetujuan admin (krs.approve)
 * - /transkrip      → transkrip nilai (permission transcript.view_own)
 * - /users          → manajemen pengguna (permission user.manage)
 * - /nilai, /audit, /pembayaran → ComingSoon (iterasi berikutnya)
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* T1.13: waiting room — publik (token antrean di sessionStorage, bukan JWT) */}
        <Route path="/tunggu" element={<WaitingRoomPage />} />
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
                <DashboardRoute />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/krs"
          element={
            <ProtectedRoute perm={['krs.fill', 'krs.approve']}>
              <AppLayout>
                <KrsRoute />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transkrip"
          element={
            <ProtectedRoute perm="transcript.view_own">
              <AppLayout>
                <TranscriptPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pembayaran"
          element={
            <ProtectedRoute perm="krs.fill">
              <AppLayout>
                <MyPaymentPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/keuangan/tagihan"
          element={
            <ProtectedRoute perm="payment.update">
              <AppLayout>
                <FinancePaymentsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute perm="user.manage">
              <AppLayout>
                <UsersPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        {/* T2.5: notifikasi — semua role terautentikasi (melihat miliknya saja, AC-10) */}
        <Route
          path="/notifikasi"
          element={
            <ProtectedRoute>
              <AppLayout>
                <NotificationsPage />
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
