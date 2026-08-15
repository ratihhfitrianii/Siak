import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { getKrsPeriod, getMyNotifications, getAnnouncements } from '../lib/api';
import type { KrsPeriod, AppNotification, Announcement } from '../lib/types';

const ROLE_LABEL: Record<string, string> = {
  mahasiswa: 'Mahasiswa',
  dosen: 'Dosen',
  admin_akademik: 'Admin Akademik',
  admin_keuangan: 'Admin Keuangan',
  admin_sistem: 'Admin Sistem',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
}

/**
 * Dashboard T1.11b + keluhan #27:
 * Mahasiswa (dan semua role terautentikasi) dapat melihat "informasi terkini universitas"
 * di halaman dashboard — kartu Periode Pengisian KRS + Info Penting (notifikasi terbaru).
 * Kedua fetch bersifat opsional: gagal → section dirender dengan pesan fallback,
 * tidak menggagalkan dashboard.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<KrsPeriod | null>(null);
  const [periodError, setPeriodError] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annError, setAnnError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    if (user.menu.some((p) => p.startsWith('krs.'))) {
      getKrsPeriod()
        .then((p) => {
          if (!cancelled) {
            setPeriod(p);
            setPeriodError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setPeriodError(true);
        });
    }

    getMyNotifications(1, 3)
      .then((res) => {
        if (!cancelled) {
          setNotifs(res.items);
        }
      })
      .catch(() => {
        // notif error handled by annError + empty state
      });

    // Fetch announcements for all roles (mahasiswa, dosen, admin_akademik, admin_keuangan, admin_sistem)
    getAnnouncements(1, 5)
      .then((res) => {
        if (!cancelled) {
          setAnnouncements(res.items);
          setAnnError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setAnnError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return null;
  }

  const showPeriodCard = user.menu.some((p) => p.startsWith('krs.'));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Selamat datang, {user.fullName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Anda masuk sebagai{' '}
          <span className="font-medium text-slate-700">
            {ROLE_LABEL[user.role] ?? user.roleName}
          </span>
          .
        </p>
      </div>

      {/* Keluhan: dashboard hanya menampilkan grid INFORMASI PENTING — grid menu (kartu
          navigasi KRS/Transkrip/Kelola Pengguna) dihapus; navigasi tetap lewat sidebar ikon.
          Keluhan #27 — informasi terkini universitas (semua role; kartu periode khusus yang punya akses krs.*) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {showPeriodCard && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Periode Pengisian KRS
            </h2>
            {periodError ? (
              <p className="mt-3 text-sm text-slate-500">Info periode tidak dapat dimuat.</p>
            ) : !period ? (
              <p className="mt-3 text-sm text-slate-400">Memuat…</p>
            ) : period.status === 'closed' ? (
              <div className="mt-3">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  Tutup
                </span>
                <p className="mt-2 text-sm text-slate-600">
                  {period.message ?? 'Tidak ada periode KRS yang sedang buka.'}
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                  Buka
                </span>
                <p className="mt-2 text-base font-semibold text-slate-900">{period.semesterCode}</p>
                <p className="text-sm text-slate-600">{period.name}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {formatDate(period.startDate)} – {formatDate(period.endDate)}
                </p>
                {period.isRevision && (
                  <p className="mt-1 text-xs font-medium text-amber-600">Periode revisi</p>
                )}
                {user.role === 'mahasiswa' && (
                  <Link
                    to="/krs"
                    className="mt-3 inline-block text-sm font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Isi KRS sekarang →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        <div
          className={`rounded-2xl bg-white p-6 shadow-sm ${showPeriodCard ? 'lg:col-span-2' : 'lg:col-span-3'}`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Info Penting
            </h2>
            <Link
              to="/notifikasi"
              className="text-sm font-semibold text-primary-600 hover:text-primary-700"
            >
              Lihat semua
            </Link>
          </div>

          {annError ? (
            <p className="mt-3 text-sm text-slate-500">Informasi penting tidak dapat dimuat.</p>
          ) : announcements.length === 0 && notifs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Belum ada informasi penting.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {/* Announcements dari admin sistem (prioritas tinggi, tampil atas) */}
              {announcements.map((a) => (
                <li key={`ann-${a.id}`} className="flex items-start gap-3 py-2.5 border-l-4 border-primary-500 bg-primary-50">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" aria-label="Announcement" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="truncate text-xs text-slate-600">{a.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('id-ID') : 'Segera'} · Prioritas {a.priority}
                    </p>
                  </div>
                </li>
              ))}
              {/* Notifikasi user biasa */}
              {notifs.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.isRead ? 'bg-slate-200' : 'bg-primary-500'
                    }`}
                    aria-label={n.isRead ? 'Dibaca' : 'Belum dibaca'}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="truncate text-xs text-slate-500">{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatShortDate(n.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
