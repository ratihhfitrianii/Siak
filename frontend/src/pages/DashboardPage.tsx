import { useAuth } from '../auth/AuthContext';

/** Dashboard placeholder T1.11a — konten peran menyusul di T1.11b (mahasiswa) & T1.11c (admin). */
export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const roleLabel =
    {
      mahasiswa: 'Mahasiswa',
      dosen: 'Dosen',
      admin_akademik: 'Admin Akademik',
      admin_keuangan: 'Admin Keuangan',
      admin_sistem: 'Admin Sistem',
    }[user.role] ?? user.roleName;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Selamat datang, {user.fullName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Anda masuk sebagai <span className="font-medium text-slate-700">{roleLabel}</span>.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-700">KRS & Nilai</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pengisian KRS dan transkrip tersedia di iterasi T1.11b.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-700">Informasi Akun</h2>
          <p className="mt-1 text-sm text-slate-500">Email: {user.email}</p>
          <p className="mt-1 text-sm text-slate-500">ID: {user.id}</p>
        </div>
      </div>
    </div>
  );
}
