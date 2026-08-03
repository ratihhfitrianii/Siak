import { Link, useLocation } from 'react-router';

/** Halaman placeholder untuk menu yang dibangun di iterasi berikutnya (T1.11b/11c). */
export function ComingSoonPage() {
  const location = useLocation();
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
      <h1 className="text-lg font-bold text-slate-900">Segera hadir</h1>
      <p className="mt-2 text-sm text-slate-500">
        Halaman <code className="font-mono text-slate-700">{location.pathname}</code> akan tersedia
        di iterasi berikutnya.
      </p>
      <Link
        to="/"
        className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        ← Kembali ke Dashboard
      </Link>
    </div>
  );
}
