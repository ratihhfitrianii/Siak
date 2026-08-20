import { Link } from 'react-router';

/**
 * Halaman placeholder — Sidang Skripsi.
 * Fitur ini akan segera tersedia.
 */
export function MahasiswaSidang() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-8 w-8 text-purple-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Sidang Skripsi</h1>
        <p className="text-slate-500 mt-1">Manajemen jadwal dan dokumen sidang skripsi</p>
      </div>

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
