import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/Spinner';

// T5.6: code splitting — tiap halaman di-load on-demand (chunk terpisah),
// bundle awal hanya berisi inti (auth, layout, router).
const AdminKrsPage = lazy(() =>
  import('./pages/AdminKrsPage').then((m) => ({ default: m.AdminKrsPage })),
);
const ChangePasswordPage = lazy(() =>
  import('./pages/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })),
);
const ComingSoonPage = lazy(() =>
  import('./pages/ComingSoonPage').then((m) => ({ default: m.ComingSoonPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DosenDashboardPage = lazy(() =>
  import('./pages/DosenDashboardPage').then((m) => ({ default: m.DosenDashboardPage })),
);
const FinancePaymentsPage = lazy(() =>
  import('./pages/FinancePaymentsPage').then((m) => ({ default: m.FinancePaymentsPage })),
);
const KrsPage = lazy(() => import('./pages/KrsPage').then((m) => ({ default: m.KrsPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const MyPaymentPage = lazy(() =>
  import('./pages/MyPaymentPage').then((m) => ({ default: m.MyPaymentPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const TranscriptPage = lazy(() =>
  import('./pages/TranscriptPage').then((m) => ({ default: m.TranscriptPage })),
);
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const AdminMasterPage = lazy(() =>
  import('./pages/AdminMasterPage').then((m) => ({ default: m.AdminMasterPage })),
);
const AnnouncementPage = lazy(() =>
  import('./pages/AnnouncementPage').then((m) => ({ default: m.AnnouncementPage })),
);
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.default })));
const WaitingRoomPage = lazy(() =>
  import('./pages/WaitingRoomPage').then((m) => ({ default: m.WaitingRoomPage })),
);
const AdminSchedulePage = lazy(() =>
  import('./pages/AdminSchedulePage').then((m) => ({ default: m.AdminSchedulePage })),
);

const MahasiswaCheckIn = lazy(() =>
  import('./pages/MahasiswaCheckIn').then((m) => ({ default: m.MahasiswaCheckIn })),
);

const MahasiswaAjukanBimbingan = lazy(() =>
  import('./pages/MahasiswaAjukanBimbingan').then((m) => ({ default: m.MahasiswaAjukanBimbingan })),
);

const MahasiswaSidang = lazy(() =>
  import('./pages/MahasiswaSidang').then((m) => ({ default: m.MahasiswaSidang })),
);
// Dosen Bimbingan pages
const DosenProposalReview = lazy(() =>
  import('./pages/DosenProposalReview').then((m) => ({ default: m.DosenProposalReview })),
);
const DosenBimbinganBerjalan = lazy(() =>
  import('./pages/DosenBimbinganBerjalan').then((m) => ({ default: m.DosenBimbinganBerjalan })),
);
const DosenBimbinganMahasiswaBinaan = lazy(() =>
  import('./pages/DosenBimbinganMahasiswaBinaan').then((m) => ({
    default: m.DosenBimbinganMahasiswaBinaan,
  })),
);

const DosenAttendanceRecap = lazy(() =>
  import('./pages/DosenAttendanceRecap').then((m) => ({ default: m.DosenAttendanceRecap })),
);
const DosenSalarySlip = lazy(() =>
  import('./pages/DosenSalarySlip').then((m) => ({ default: m.DosenSalarySlip })),
);
const FinancePayrollPage = lazy(() =>
  import('./pages/FinancePayrollPage').then((m) => ({ default: m.FinancePayrollPage })),
);

const AdminCourseReviewPage = lazy(() =>
  import('./pages/AdminCourseReviewPage').then((m) => ({ default: m.AdminCourseReviewPage })),
);

/** Fallback saat chunk halaman di-download (T5.6) — spinner konsisten dengan pola loading existing. */
function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner label="Memuat halaman" />
    </div>
  );
}

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
 * Router aplikasi T1.11c (+T5.6 code splitting).
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
      <Suspense fallback={<PageFallback />}>
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
          {/* Keluhan #5: submenu dashboard dosen di sidebar → route /dosen/:tab.
              Dosen juga tetap bisa buka / (dashboard default = Pilih MK). */}
          <Route
            path="/dosen/:tab?"
            element={
              <ProtectedRoute perm="lecturer.select_course">
                <AppLayout>
                  <DosenDashboardPage />
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
          {/* Mahasiswa Check-In Absensi */}
          <Route
            path="/absensi/check-in"
            element={
              <ProtectedRoute perm="krs.fill">
                <AppLayout>
                  <MahasiswaCheckIn />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Skripsi — Ajukan Bimbingan */}
          <Route
            path="/skripsi/ajukan"
            element={
              <ProtectedRoute perm="thesis.submit">
                <AppLayout>
                  <MahasiswaAjukanBimbingan />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Skripsi — Sidang */}
          <Route
            path="/skripsi/sidang"
            element={
              <ProtectedRoute perm="thesis.submit">
                <AppLayout>
                  <MahasiswaSidang />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Dosen — Pengajuan Proposal */}
          <Route
            path="/dosen/bimbingan/proposal"
            element={
              <ProtectedRoute perm="thesis.review">
                <AppLayout>
                  <DosenProposalReview />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Dosen — Bimbingan Berjalan */}
          <Route
            path="/dosen/bimbingan/berjalan"
            element={
              <ProtectedRoute perm="guidance.manage">
                <AppLayout>
                  <DosenBimbinganBerjalan />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Dosen — Bimbingan Mahasiswa Binaan */}
          <Route
            path="/dosen/bimbingan/mahasiswa-binaan"
            element={
              <ProtectedRoute perm="guidance.manage">
                <AppLayout>
                  <DosenBimbinganMahasiswaBinaan />
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
          {/* Keluhan #16: Master Data (admin_sistem) — list + input manual + import CSV */}
          <Route
            path="/admin/master"
            element={
              <ProtectedRoute perm="user.manage">
                <AppLayout>
                  <AdminMasterPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Admin Sistem / Admin Akademik: Kelola Jadwal Pengajar (T3.2, perm schedule.manage) */}
          <Route
            path="/admin/jadwal"
            element={
              <ProtectedRoute perm="schedule.manage">
                <AppLayout>
                  <AdminSchedulePage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Dosen — Rekap Kehadiran Mahasiswa */}
          <Route
            path="/dosen/absensi/rekap"
            element={
              <ProtectedRoute perm="attendance.recap">
                <AppLayout>
                  <DosenAttendanceRecap />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Dosen — Slip Gaji */}
          <Route
            path="/dosen/slip-gaji"
            element={
              <ProtectedRoute perm="payroll.view">
                <AppLayout>
                  <DosenSalarySlip />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Admin Keuangan — Payroll */}
          <Route
            path="/keuangan/payroll"
            element={
              <ProtectedRoute perm="payroll.view">
                <AppLayout>
                  <FinancePayrollPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/persetujuan-mk"
            element={
              <ProtectedRoute perm="kurikulum.manage">
                <AppLayout>
                  <AdminCourseReviewPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Admin Sistem: Informasi Penting (Announcements) */}
          <Route
            path="/admin/informasi-penting"
            element={
              <ProtectedRoute perm="user.manage">
                <AppLayout>
                  <AnnouncementPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Student Profile (mahasiswa — permission student.profile) */}
          <Route
            path="/profil"
            element={
              <ProtectedRoute perm="student.profile">
                <AppLayout>
                  <ProfilePage />
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
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
