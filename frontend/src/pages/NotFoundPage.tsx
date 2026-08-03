import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-center">
      <h1 className="text-5xl font-bold text-slate-300">404</h1>
      <p className="mt-3 text-slate-600">Halaman tidak ditemukan.</p>
      <Link to="/" className="mt-5 text-sm font-medium text-primary-600 hover:text-primary-700">
        ← Kembali ke Dashboard
      </Link>
    </div>
  );
}
