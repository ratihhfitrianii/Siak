/**
 * Halaman fondasi T1.1 — placeholder aplikasi.
 * Halaman Login/Dashboard mahasiswa & admin diimplementasikan pada T1.11.
 */
function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <main className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">
          Sistem Informasi Akademik
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Siak</h1>
        <p className="mt-3 text-sm text-slate-600">
          Fondasi iterasi 1 (T1.1) sudah siap. Halaman login dan dashboard menyusul.
        </p>
        <p className="mt-6 text-xs text-slate-400">
          Backend: <code className="font-mono">http://localhost:3000</code> · Frontend dev:{' '}
          <code className="font-mono">http://localhost:5173</code>
        </p>
      </main>
    </div>
  );
}

export default App;
