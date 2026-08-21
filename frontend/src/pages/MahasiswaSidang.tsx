import { Link } from 'react-router';

/**
 * Halaman placeholder — Sidang Skripsi.
 * Fitur ini akan segera tersedia.
 */
export function MahasiswaSidang() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Placeholder Card */}
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-10 w-10 text-purple-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Segera Tersedia</h2>
        <p className="text-slate-500 mt-2 text-sm">Fitur sidang skripsi akan segera tersedia.</p>
        <p className="text-slate-400 text-xs mt-1">
          Silakan hubungi bagian akademik untuk informasi mengenai jadwal sidang.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
        >
          ← Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
