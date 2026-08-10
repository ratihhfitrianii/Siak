import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { getMyNotifications } from '../lib/api';

/** Mapping permission → item menu (RBAC UI: menu disaring dari /users/me, bukan hardcode per role). */
const MENU_ITEMS: { permissions: string[]; label: string; path: string }[] = [
  { permissions: ['krs.fill', 'krs.view_classes', 'krs.approve'], label: 'KRS', path: '/krs' },
  {
    permissions: ['transcript.view_own', 'transcript.view_mentee'],
    label: 'Transkrip',
    path: '/transkrip',
  },
  { permissions: ['user.manage'], label: 'User', path: '/users' },
  // T5.3: 'Pembayaran' = tagihan mahasiswa (krs.fill); 'Tagihan' = kelola pembayaran admin keuangan (payment.update).
  // Sebelumnya keduanya digabung ke 'Pembayaran' (payment.*) → admin keuangan dapat 403 di /pembayaran.
  { permissions: ['krs.fill'], label: 'Pembayaran', path: '/pembayaran' },
  { permissions: ['payment.update'], label: 'Tagihan', path: '/keuangan/tagihan' },
  // 'Nilai' & 'Audit' sengaja TIDAK di-menu: route-nya masih ComingSoon (dead-end). Dosen memakai tab Nilai di dashboard.
];

const ROLE_LABEL: Record<string, string> = {
  mahasiswa: 'Mahasiswa',
  dosen: 'Dosen',
  admin_akademik: 'Admin Akademik',
  admin_keuangan: 'Admin Keuangan',
  admin_sistem: 'Admin Sistem',
};

/**
 * Menu yang disembunyikan per role — keluhan lama: "jika menu tidak tersedia untuk user
 * admin/dosen tidak perlu ditampilkan (mis. menu transkip dan KRS)". Backend tetap otoritas
 * final (policy.ts); ini hanya penyaringan tampilan.
 * - admin_sistem: superuser punya semua permission (can()=true), tapi menu KRS/Transkrip/
 *   Pembayaran/Tagihan bukan domainnya → disembunyikan.
 * - dosen: Transkrip tidak termasuk menu dosen (meski permission transcript.view_own ada
 *   dari matriks §6.1 — UI tidak menampilkannya).
 */
const HIDDEN_MENU_BY_ROLE: Record<string, string[]> = {
  admin_sistem: ['/krs', '/transkrip', '/pembayaran', '/keuangan/tagihan'],
  dosen: ['/transkrip'],
};

/** Layout shell: navbar sticky + konten (T1.11a). */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  // T2.5: badge notifikasi unread — fetch ringan saat mount (polling 60s; tidak menggagalkan layout).
  // Keluhan lama: "ketika notifikasi dibaca, ikon lonceng tidak berubah" — AppLayout juga
  // me-refresh badge saat NotificationsPage men-dispatch event 'siak:notif-changed'.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      getMyNotifications()
        .then((items) => {
          if (!cancelled) setUnread(items.filter((n) => !n.isRead).length);
        })
        .catch(() => {
          /* badge opsional — gagal fetch tidak menggagalkan layout */
        });
    };
    load();
    const t = setInterval(load, 60_000);
    const onNotifChanged = () => load();
    window.addEventListener('siak:notif-changed', onNotifChanged);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener('siak:notif-changed', onNotifChanged);
    };
  }, [user]);

  if (!user) {
    return null;
  }

  const hidden = HIDDEN_MENU_BY_ROLE[user.role] ?? [];
  const menu = MENU_ITEMS.filter(
    (item) => !hidden.includes(item.path) && item.permissions.some((p) => user.menu.includes(p)),
  );

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
              S
            </span>
            <span className="text-lg font-bold text-slate-900">Siak</span>
          </NavLink>

          <nav className="flex flex-1 flex-wrap items-center gap-1" aria-label="Menu utama">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              Dashboard
            </NavLink>
            {menu.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <NavLink
              to="/notifikasi"
              aria-label="Notifikasi"
              className="relative rounded-md p-2 text-slate-600 transition hover:bg-slate-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[user.role] ?? user.roleName}</p>
            </div>
            <NavLink
              to="/ganti-password"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Ganti Password
            </NavLink>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
