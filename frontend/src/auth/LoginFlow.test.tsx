import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../components/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { ProtectedRoute } from './ProtectedRoute';
import type { MeUser } from './AuthContext';
/**
 * Reproduksi keluhan: mahasiswa logout dari /pembayaran, lalu dosen login →
 * dosen TIDAK boleh berakhir di /pembayaran (menu itu tidak ada untuk dosen).
 * Jalur: ProtectedRoute /pembayaran saat user=null me-render <Navigate state={{from}}>
 * yang bisa menimpa state location → LoginPage `from` = /pembayaran.
 */
let mockUser: MeUser | null = null;
const mockLogout = vi.fn();
const mockLogin = vi.fn();

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: mockUser, booting: false, logout: mockLogout, login: mockLogin }),
}));

const MAHASISWA: MeUser = {
  id: 7,
  email: 'budi@kampus.ac.id',
  fullName: 'Budi',
  role: 'mahasiswa',
  roleName: 'Mahasiswa',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: 7,
  adminFacultyCode: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['krs.fill', 'krs.view_classes', 'transcript.view_own'],
};

const DOSEN: MeUser = {
  id: 4,
  email: 'dosen@kampus.ac.id',
  fullName: 'Pak Guru',
  role: 'dosen',
  roleName: 'Dosen',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  adminFacultyCode: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['lecturer.select_course', 'grade.input'],
};

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location-probe">
      path={location.pathname} state={JSON.stringify(location.state)}
    </div>
  );
}

function renderFlow() {
  return (
    <MemoryRouter initialEntries={['/pembayaran']}>
      <Routes>
        <Route
          path="/pembayaran"
          element={
            <ProtectedRoute perm="krs.fill">
              <AppLayout>
                <div>HALAMAN_PEMBAYARAN</div>
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>DASHBOARD</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('LoginFlow — logout dari halaman tanpa akses role lain (regresi)', () => {
  beforeEach(() => {
    mockUser = null;
    mockLogout.mockReset();
    mockLogin.mockReset();
    mockLogout.mockImplementation(async () => {
      mockUser = null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mahasiswa logout dari /pembayaran → /login (tanpa from), dosen login → dashboard', async () => {
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    const view = render(renderFlow());

    // Mahasiswa di /pembayaran
    expect(screen.getByText('HALAMAN_PEMBAYARAN')).toBeInTheDocument();

    // Logout via dropdown avatar
    await user.click(screen.getByRole('button', { name: 'Menu pengguna' }));
    await user.click(screen.getByRole('menuitem', { name: 'Keluar' }));

    // Harusnya di /login
    expect(await screen.findByText('Masuk ke Siak')).toBeInTheDocument();
    const probe1 = screen.getByTestId('location-probe').textContent ?? '';
    expect(probe1).toContain('path=/login');
    expect(probe1).toContain('null'); // state.from TIDAK boleh terbawa

    // Dosen login → set user → re-render → LoginPage `if (user)` Navigate ke target
    mockUser = DOSEN;
    view.rerender(renderFlow());

    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    const probe2 = screen.getByTestId('location-probe').textContent ?? '';
    expect(probe2).toContain('path=/');
    expect(probe2).not.toContain('pembayaran');
  });

  it('race: state.from=/pembayaran tersimpan di /login → dosen login tetap ke dashboard', async () => {
    // Simulasi hasil passive effect Navigate (ProtectedRoute) yang menimpa state /login:
    // /login membawa state {from:'/pembayaran'}. Dosen (tanpa krs.fill) login →
    // safeFrom harus mengarahkan ke '/', BUKAN /pembayaran.
    mockUser = DOSEN;
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/pembayaran' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>DASHBOARD</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    // `if (user)` → Navigate safeFrom('/pembayaran', dosen) = '/'
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe').textContent ?? '';
    expect(probe).toContain('path=/');
    expect(probe).not.toContain('pembayaran');
  });

  it('race: dosen logout dari /dosen/jadwal → mahasiswa login TIDAK diarahkan ke /dosen (safeFrom prefix)', async () => {
    mockUser = DOSEN;
    const view = render(
      <MemoryRouter initialEntries={['/dosen/jadwal']}>
        <Routes>
          <Route
            path="/dosen/:tab?"
            element={
              <ProtectedRoute perm="lecturer.select_course">
                <AppLayout>
                  <div>HALAMAN_DOSEN</div>
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>DASHBOARD</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    // Logout
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Menu pengguna' }));
    await user.click(screen.getByRole('menuitem', { name: 'Keluar' }));
    expect(await screen.findByText('Masuk ke Siak')).toBeInTheDocument();

    // Race menimpa state → /login membawa from=/dosen/jadwal (simulasi)
    mockUser = MAHASISWA; // mahasiswa login (tanpa lecturer.select_course)
    view.rerender(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/dosen/jadwal' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>DASHBOARD</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe').textContent ?? '';
    expect(probe).toContain('path=/');
    expect(probe).not.toContain('dosen');
  });
});
