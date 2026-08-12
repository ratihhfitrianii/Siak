import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/api';
import type { AppNotification, NotificationsResponse } from '../lib/types';
import { TYPE_LABEL } from '../lib/notificationLabels';

/**
 * Halaman Notifikasi (T2.5) — AC-04d (arsip lengkap; panel ringkas di header AppLayout):
 * - daftar notifikasi sendiri (in-app; GET /notifications/my?page&limit=5)
 * - infinite scroll / pagination (5 item per page)
 * - tandai dibaca per item (PUT /notifications/:id/read)
 * - tandai semua dibaca (PUT /notifications/read-all)
 * - badge unread di header (AppLayout) memakai endpoint yang sama
 */
export function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (pageNum: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data: NotificationsResponse = await getMyNotifications(pageNum, 5);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setHasMore(data.pagination?.hasMore ?? false);
      setTotal(data.pagination?.total ?? data.items.length);
      setPage(pageNum);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat notifikasi');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loadingMore && !loading && hasMore) {
      void load(page + 1, true);
    }
  }, [load, loading, loadingMore, hasMore, page]);

  // Intersection Observer untuk infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );
    const el = document.getElementById('notif-load-more');
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  async function handleMarkRead(id: number) {
    if (readIds.has(id)) return;
    setReadIds((prev) => new Set(prev).add(id)); // optimistik
    try {
      await markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      window.dispatchEvent(new Event('siak:notif-changed')); // sinkronkan badge header
    } catch {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setReadIds(new Set());
      window.dispatchEvent(new Event('siak:notif-changed')); // sinkronkan badge header
    } catch {
      setError('Gagal menandai semua notifikasi sebagai dibaca');
    }
  }

  const unread = items.filter((n) => !n.isRead && !readIds.has(n.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Notifikasi</h1>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="rounded-md border border-primary-300 px-3 py-1 text-xs font-medium text-primary-700 transition hover:bg-primary-50"
            >
              Tandai semua dibaca
            </button>
          )}
          {unread > 0 && (
            <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700">
              {unread} belum dibaca
            </span>
          )}
          {total > 0 && (
            <span className="text-xs text-slate-500">
              {items.length} / {total}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-label="Memuat">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Belum ada notifikasi.
        </div>
      ) : (
        <>
          <ul className="space-y-3" role="list" aria-label="Daftar notifikasi">
            {items.map((n) => {
              const isRead = n.isRead || readIds.has(n.id);
              return (
                <li
                  key={n.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                    isRead ? 'border-slate-200' : 'border-primary-200 bg-primary-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {TYPE_LABEL[n.type] ?? n.type}
                        </span>
                        {!isRead && (
                          <span
                            className="h-2 w-2 rounded-full bg-primary-600"
                            aria-label="Belum dibaca"
                          />
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(n.createdAt).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <h2
                        className={`mt-1 text-sm font-semibold ${isRead ? 'text-slate-600' : 'text-slate-900'}`}
                      >
                        {n.title}
                      </h2>
                      <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                    </div>
                    {!isRead && (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(n.id)}
                        className="shrink-0 rounded-md border border-primary-300 px-3 py-1 text-xs font-medium text-primary-700 transition hover:bg-primary-50"
                      >
                        Tandai dibaca
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div id="notif-load-more" className="flex justify-center py-4">
              {loadingMore ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              ) : (
                <button
                  type="button"
                  onClick={loadMore}
                  className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Muat lebih banyak
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
