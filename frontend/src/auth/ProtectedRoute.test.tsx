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
  isActive: true,
  mustChangePassword: false,
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>HALAMAN_LOGIN</div>} />
          <Route path="/ganti-password" element={<div>HALAMAN_GANTI_PASSWORD</div>} />
          <Route
            path="/aman"
            element={
              <ProtectedRoute>
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
});
