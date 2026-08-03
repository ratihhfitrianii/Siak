import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  mahasiswa: 'Mahasiswa',
  dosen: 'Dosen',
  admin_akademik: 'Admin Akademik',
  admin_keuangan: 'Admin Keuangan',
  admin_sistem: 'Admin Sistem',
};

/**
 * Dashboard T1.11b — kartu aksi disaring dari permission (menu) user.
 * Mahasiswa: KRS + Transkrip. Admin: kelola pengguna (T1.11c menyusul).
 */
export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const cards = [
    user.menu.includes('krs.fill') && {
      title: 'KRS',
      desc: 'Isi & pantau Kartu Rencana Studi periode aktif',
      to: '/krs',
    },
    user.menu.includes('transcript.view_own') && {
      title: 'Transkrip',
      desc: 'Nilai & IPK per semester',
      to: '/transkrip',
    },
    user.menu.includes('user.manage') && {
      title: 'Kelola Pengguna',
      desc: 'Daftar, buat, dan atur peran pengguna',
      to: '/users',
    },
  ].filter((c): c is { title: string; desc: string; to: string } => Boolean(c));

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Selamat datang, {user.fullName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Anda masuk sebagai{' '}
        <span className="font-medium text-slate-700">{ROLE_LABEL[user.role] ?? user.roleName}</span>
        .
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-primary-300 hover:bg-primary-50"
          >
            <h2 className="text-sm font-semibold text-slate-900 group-hover:text-primary-700">
              {card.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{card.desc}</p>
          </Link>
        ))}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-700">Informasi Akun</h2>
          <p className="mt-1 text-sm text-slate-500">Email: {user.email}</p>
          <p className="mt-1 text-sm text-slate-500">ID: {user.id}</p>
        </div>
      </div>
    </div>
  );
}
