import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, type MeUser } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

const USER: MeUser = {
  id: 1,
  email: 'budi@kampus.ac.id',
  fullName: 'Budi',
  role: 'mahasiswa',
  roleName: 'Mahasiswa',
  isWali: false,
  isKaprodi: false,
  isWakilKaprodi: false,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  adminFacultyCode: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: [],
};

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function renderAt(path: string, perm?: string | string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>HALAMAN_LOGIN</div>} />
          <Route path="/ganti-password" element={<div>HALAMAN_GANTI_PASSWORD</div>} />
          <Route
            path="/aman"
            element={
              <ProtectedRoute perm={perm}>
                <div>KONTEN_PROTEKSI</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute (T1.11a)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('belum login → redirect ke /login', async () => {
    renderAt('/aman');
    expect(await screen.findByText('HALAMAN_LOGIN')).toBeInTheDocument();
  });

  it('sudah login → konten ditampilkan', async () => {
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: USER })));

    renderAt('/aman');
    expect(await screen.findByText('KONTEN_PROTEKSI')).toBeInTheDocument();
  });

  it('mustChangePassword → paksa ke /ganti-password', async () => {
    const forced = { ...USER, mustChangePassword: true };
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: forced })),
    );

    renderAt('/aman');
    expect(await screen.findByText('HALAMAN_GANTI_PASSWORD')).toBeInTheDocument();
  });

  it('perm tidak dimiliki user → Access Denied 403', async () => {
    const tanpaIzin = { ...USER, menu: ['krs.fill'] };
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: tanpaIzin })),
    );

    renderAt('/aman', 'user.manage');
    expect(await screen.findByText('Akses ditolak')).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.queryByText('KONTEN_PROTEKSI')).not.toBeInTheDocument();
  });

  it('perm dimiliki user → konten ditampilkan', async () => {
    const berizin = { ...USER, menu: ['krs.fill'] };
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: berizin })),
    );

    renderAt('/aman', 'krs.fill');
    expect(await screen.findByText('KONTEN_PROTEKSI')).toBeInTheDocument();
  });

  it('array perm (OR): salah satu dimiliki → konten ditampilkan', async () => {
    const admin = { ...USER, menu: ['krs.approve'] };
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: admin })));

    renderAt('/aman', ['krs.fill', 'krs.approve']);
    expect(await screen.findByText('KONTEN_PROTEKSI')).toBeInTheDocument();
  });

  it('array perm (OR): tidak ada yang dimiliki → Access Denied 403', async () => {
    const tanpaIzin = { ...USER, menu: ['transcript.view_own'] };
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: tanpaIzin })),
    );

    renderAt('/aman', ['krs.fill', 'krs.approve']);
    expect(await screen.findByText('Akses ditolak')).toBeInTheDocument();
  });

  it('belum login & SUDAH di /login → tidak render Navigate (anti race state.from)', async () => {
    // Reproduksi race: logout dari halaman terproteksi → ProtectedRoute me-render
    // <Navigate state={{from}}> yang bisa menimpa state /login. Guard: pathname==='/login'
    // → return null. Konten /login (bukan Navigate berulang) yang tampil.
    const view = render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>HALAMAN_LOGIN</div>} />
            <Route
              path="/aman"
              element={
                <ProtectedRoute perm="krs.fill">
                  <div>KONTEN_PROTEKSI</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('HALAMAN_LOGIN')).toBeInTheDocument();

    // Tetap di /login setelah re-render (tidak ada Navigate loop / state tertimpa)
    view.rerender(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>HALAMAN_LOGIN</div>} />
            <Route
              path="/aman"
              element={
                <ProtectedRoute perm="krs.fill">
                  <div>KONTEN_PROTEKSI</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('HALAMAN_LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('KONTEN_PROTEKSI')).not.toBeInTheDocument();
  });
});
