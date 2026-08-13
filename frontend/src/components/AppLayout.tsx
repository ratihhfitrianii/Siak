import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import {
  ApiError,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/api';
import type { AppNotification } from '../lib/types';
import { TYPE_LABEL } from '../lib/notificationLabels';

/**
 * Ikon menu (inline SVG stroke — pola sama dengan ikon lonceng di header).
 * Keluhan #5: "navbar menu ubah menjadi ikon2 sidebar, jika di handover muncul
 * penjelasan singkat menu tersebut" — menu dirender sebagai ikon di sidebar kiri,
 * tooltip (CSS) muncul saat hover dengan label + deskripsi singkat.
 */
const ICON_PATHS: Record<string, string> = {
  home: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10',
  document:
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  clipboard:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  users:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  database:
    'M4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 7c0 1.657 3.582 3 8 3s8-1.343 8-3M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3',
  card: 'M3 10h18M7 15h3M6 6h12a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z',
  receipt:
    'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  // Ikon submenu dosen (heroicons outline) — menu dashboard dosen dipindah ke sidebar (keluhan #5).
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  calendar:
    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  swap: 'M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4',
  star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
};

/** Mapping permission → item menu (RBAC UI: menu disaring dari /users/me, bukan hardcode per role).
 *  Field `roles` opsional: jika ada, item HANYA tampil untuk role tsb (submenu dosen — keluhan #5). */
const MENU_ITEMS: {
  permissions: string[];
  label: string;
  path: string;
  icon: string;
  description: string;
  roles?: string[];
}[] = [
  {
    permissions: ['krs.fill', 'krs.view_classes', 'krs.approve'],
    label: 'KRS',
    path: '/krs',
    icon: 'document',
    description: 'Isi dan lihat Kartu Rencana Studi',
  },
  {
    permissions: ['transcript.view_own', 'transcript.view_mentee'],
    label: 'Transkrip',
    path: '/transkrip',
    icon: 'clipboard',
    description: 'Lihat transkrip nilai',
  },
  {
    permissions: ['user.manage'],
    label: 'User',
    path: '/users',
    icon: 'users',
    description: 'Kelola pengguna sistem',
  },
  // Keluhan #16: Master Data — admin sistem melihat master mahasiswa/dosen, input manual atau CSV.
  {
    permissions: ['user.manage'],
    label: 'Master',
    path: '/admin/master',
    icon: 'database',
    description: 'Master data mahasiswa & dosen',
  },
  // T5.3: 'Pembayaran' = tagihan mahasiswa (krs.fill); 'Tagihan' = kelola pembayaran admin keuangan (payment.update).
  // Sebelumnya keduanya digabung ke 'Pembayaran' (payment.*) → admin keuangan dapat 403 di /pembayaran.
  {
    permissions: ['krs.fill'],
    label: 'Pembayaran',
    path: '/pembayaran',
    icon: 'card',
    description: 'Tagihan pembayaran Anda',
  },
  {
    permissions: ['payment.update'],
    label: 'Tagihan',
    path: '/keuangan/tagihan',
    icon: 'receipt',
    description: 'Kelola tagihan pembayaran',
  },
  // 'Nilai' & 'Audit' sengaja TIDAK di-menu: route-nya masih ComingSoon (dead-end). Dosen memakai tab Nilai di dashboard.
  // ---- Submenu Dashboard Dosen (keluhan #5): menu teks horizontal di halaman dipindah ke sidebar ikon ----
  {
    permissions: ['lecturer.select_course'],
    roles: ['dosen'],
    label: 'Pilih MK',
    path: '/dosen/pilih-mk',
    icon: 'book',
    description: 'Pilih mata kuliah yang diampu',
  },
  {
    permissions: ['lecturer.availability'],
    roles: ['dosen'],
    label: 'Jadwal',
    path: '/dosen/jadwal',
    icon: 'calendar',
    description: 'Lihat jadwal mengajar',
  },
  // ---- Admin Sistem: Jadwal Pengajar (keluhan #5 + T3.2) ----
  {
    permissions: ['schedule.manage'],
    roles: ['admin_sistem', 'admin_akademik'],
    label: 'Jadwal',
    path: '/admin/jadwal',
    icon: 'calendar',
    description: 'Kelola jadwal pengajar per kelas',
  },
  {
    permissions: ['attendance.input'],
    roles: ['dosen'],
    label: 'Absensi',
    path: '/dosen/absensi',
    icon: 'check',
    description: 'Input absensi pertemuan',
  },
  {
    permissions: ['guidance.manage'],
    roles: ['dosen'],
    label: 'Bimbingan',
    path: '/dosen/bimbingan',
    icon: 'chat',
    description: 'Bimbingan mahasiswa binaan',
  },
  {
    permissions: ['substitute.manage'],
    roles: ['dosen'],
    label: 'Substitute',
    path: '/dosen/substitute',
    icon: 'swap',
    description: 'Kelola penggantian jadwal',
  },
  {
    permissions: ['grade.input'],
    roles: ['dosen'],
    label: 'Nilai',
    path: '/dosen/nilai',
    icon: 'star',
    description: 'Input dan ubah nilai',
  },
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
  dosen: ['/transkrip'],
  admin_keuangan: ['/transkrip'],
};

function MenuIcon({ path }: { path: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

/**
 * Layout shell (T1.11a + keluhan #5 & #26):
 * - Sidebar kiri berisi menu berupa ikon; hover → tooltip "penjelasan singkat" (label + deskripsi).
 * - Header ramping: logo, lonceng notifikasi, dan IKON ORANG (avatar) — hover → tooltip;
 *   klik → dropdown (Edit Profil [bila permission user.edit_contact], Ganti Password, Keluar).
 * - Responsif: di layar kecil sidebar menjadi bar ikon horizontal di bawah header.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Keluhan: notifikasi berupa HALAMAN MELAYANG (floating), bukan pindah halaman.
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<AppNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // T2.5: badge notifikasi unread — fetch ringan saat mount (polling 60s; tidak menggagalkan layout).
  // Keluhan lama: "ketika notifikasi dibaca, ikon lonceng tidak berubah" — AppLayout juga
  // me-refresh badge saat NotificationsPage men-dispatch event 'siak:notif-changed'.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      getMyNotifications(1, 5)
        .then((res) => {
          if (!cancelled) setUnread(res.items.filter((n) => !n.isRead).length);
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

  // Keluhan #26: dropdown avatar — tutup saat klik di luar menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // Panel notifikasi melayang — tutup saat klik di luar panel.
  useEffect(() => {
    if (!notifOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [notifOpen]);

  // Muat ulang isi panel (5 notifikasi terbaru) — dipanggil tiap panel dibuka.
  const refreshPanel = async () => {
    setNotifLoading(true);
    try {
      const res = await getMyNotifications(1, 5);
      setNotifItems(res.items);
      setNotifError(null);
      setUnread(res.items.filter((n) => !n.isRead).length);
    } catch (e) {
      setNotifError(e instanceof ApiError ? e.message : 'Gagal memuat notifikasi');
    } finally {
      setNotifLoading(false);
    }
  };

  function toggleNotif() {
    setNotifOpen((open) => {
      if (!open) void refreshPanel();
      return !open;
    });
  }

  async function handleNotifRead(id: number) {
    // optimistik: tandai dibaca dulu, rollback bila gagal
    setNotifItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await markNotificationRead(id);
      window.dispatchEvent(new Event('siak:notif-changed')); // sinkronkan badge
    } catch {
      setNotifItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
    }
  }

  async function handleNotifAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      window.dispatchEvent(new Event('siak:notif-changed'));
    } catch {
      setNotifError('Gagal menandai semua notifikasi sebagai dibaca');
    }
  }

  if (!user) {
    return null;
  }

  const hidden = HIDDEN_MENU_BY_ROLE[user.role] ?? [];
  const menu = MENU_ITEMS.filter(
    (item) =>
      !hidden.includes(item.path) &&
      (!item.roles || item.roles.includes(user.role)) &&
      item.permissions.some((p) => user.menu.includes(p)),
  );
  const canEditContact = user.menu.includes('user.edit_contact');

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `group relative flex h-10 shrink-0 items-center rounded-md transition ${
      sidebarCollapsed ? 'w-10 justify-center' : 'w-full justify-start gap-2 px-2.5'
    } ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Sidebar — desktop: kolom vertikal di kiri (expand: label inline; collapse: ikon + tooltip hover);
          mobile: bar horizontal di bawah header. */}
      <aside
        className={`fixed inset-x-0 top-14 z-30 border-b border-slate-200 bg-white md:inset-y-0 md:left-0 md:flex-col md:border-b-0 md:border-r transition-all duration-200 ${
          sidebarCollapsed ? 'md:w-16' : 'md:w-64'
        }`}
      >
        <div className="hidden items-center justify-center border-b border-slate-100 py-3 md:flex">
          <NavLink
            to="/"
            aria-label="Beranda"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white"
          >
            S
          </NavLink>
        </div>
        <nav
          aria-label="Menu utama"
          className={`flex items-center gap-1 overflow-x-auto px-2 py-1.5 md:flex-col md:overflow-visible md:py-2 transition-all duration-200 ${
            sidebarCollapsed ? 'md:items-center md:px-0' : 'md:items-stretch md:px-2'
          }`}
        >
          <NavLink to="/" end aria-label="Dashboard" title="Dashboard" className={navItemClass}>
            <MenuIcon path={ICON_PATHS.home} />
            {!sidebarCollapsed && <span className="truncate text-sm font-medium">Dashboard</span>}
            {sidebarCollapsed && (
              <span className="pointer-events-none absolute left-full z-40 ml-2 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 md:block">
                Dashboard
                <span className="block text-[10px] font-normal text-slate-300">
                  Ringkasan aktivitas
                </span>
              </span>
            )}
          </NavLink>
          {menu.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              aria-label={item.label}
              title={item.label}
              className={navItemClass}
            >
              <MenuIcon path={ICON_PATHS[item.icon]} />
              {!sidebarCollapsed && (
                <span className="truncate text-sm font-medium">{item.label}</span>
              )}
              {sidebarCollapsed && (
                <span className="pointer-events-none absolute left-full z-40 ml-2 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 md:block">
                  {item.label}
                  <span className="block text-[10px] font-normal text-slate-300">
                    {item.description}
                  </span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        {/* Tombol expand/collapse di ujung bawah sidebar — hanya ikon (tanpa teks). */}
        <div className="hidden border-t border-slate-100 p-2 md:block">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex items-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${
              sidebarCollapsed ? 'mx-auto h-10 w-10 justify-center' : 'w-full h-10 justify-center'
            }`}
          >
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={sidebarCollapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'}
              />
            </svg>
          </button>
        </div>
      </aside>

      <div
        className={`md:transition-all md:duration-200 ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}`}
      >
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <span className="text-lg font-bold text-slate-900 md:hidden">Siak</span>
            <div className="flex-1" />

            {/* Keluhan: notifikasi HALAMAN MELAYANG (floating overlay), bukan pindah halaman.
                Klik lonceng → panel melayang berisi 5 notifikasi terbaru; arsip lengkap tetap
                di /notifikasi lewat tautan "Lihat semua". */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={toggleNotif}
                aria-label="Notifikasi"
                aria-haspopup="dialog"
                aria-expanded={notifOpen}
                title="Notifikasi"
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
              </button>

              {notifOpen && (
                <div
                  role="dialog"
                  aria-label="Notifikasi"
                  className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                    <p className="text-sm font-semibold text-slate-900">Notifikasi</p>
                    {unread > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleNotifAllRead()}
                        className="rounded-md border border-primary-300 px-2 py-1 text-xs font-medium text-primary-700 transition hover:bg-primary-50"
                      >
                        Tandai semua dibaca
                      </button>
                    )}
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {notifLoading ? (
                      <div className="flex justify-center py-10" role="status" aria-label="Memuat">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
                      </div>
                    ) : notifError ? (
                      <p className="px-4 py-8 text-center text-sm text-red-600">{notifError}</p>
                    ) : notifItems.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">
                        Belum ada notifikasi.
                      </p>
                    ) : (
                      <ul role="list" aria-label="Daftar notifikasi">
                        {notifItems.map((n) => (
                          <li
                            key={n.id}
                            className={`flex items-start justify-between gap-2 border-b border-slate-50 px-4 py-3 ${
                              n.isRead ? '' : 'bg-primary-50/40'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {TYPE_LABEL[n.type] ?? n.type}
                                </span>
                                {!n.isRead && (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-600"
                                    aria-label="Belum dibaca"
                                  />
                                )}
                              </div>
                              <p
                                className={`mt-1 truncate text-xs font-semibold ${
                                  n.isRead ? 'text-slate-600' : 'text-slate-900'
                                }`}
                              >
                                {n.title}
                              </p>
                              <p className="truncate text-xs text-slate-500">{n.message}</p>
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                {new Date(n.createdAt).toLocaleString('id-ID')}
                              </p>
                            </div>
                            {!n.isRead && (
                              <button
                                type="button"
                                onClick={() => void handleNotifRead(n.id)}
                                className="shrink-0 rounded-md border border-primary-300 px-2 py-1 text-[10px] font-medium text-primary-700 transition hover:bg-primary-50"
                              >
                                Tandai dibaca
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="border-t border-slate-100 p-2">
                    <NavLink
                      to="/notifikasi"
                      onClick={() => setNotifOpen(false)}
                      className="block rounded-md px-3 py-2 text-center text-xs font-medium text-primary-700 transition hover:bg-primary-50"
                    >
                      Lihat semua notifikasi
                    </NavLink>
                  </div>
                </div>
              )}
            </div>

            {/* Keluhan #26: header hanya menampilkan ikon orang; hover → tooltip; klik → dropdown. */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu pengguna"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Menu pengguna"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              >
                <MenuIcon path={ICON_PATHS.user} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Menu pengguna"
                  className="absolute right-0 top-full z-40 mt-2 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABEL[user.role] ?? user.roleName}
                    </p>
                  </div>
                  {canEditContact && (
                    <NavLink
                      to="/profil"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit Profil
                    </NavLink>
                  )}
                  <NavLink
                    to="/ganti-password"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    Ganti Password
                  </NavLink>
                  <div className="my-1 h-px bg-slate-100" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleLogout()}
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Keluar
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
