import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const ME = {
  id: 1,
  email: 'mahasiswa@kampus.ac.id',
  fullName: 'Budi Mahasiswa',
  role: 'mahasiswa',
  roleName: 'Mahasiswa',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['auth.profile', 'krs.fill', 'transcript.view_own'],
};

function Probe() {
  const { user, booting, logout } = useAuth();
  return (
    <div>
      <span data-testid="booting">{String(booting)}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('AuthContext (T1.11a)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restore sesi dari localStorage → user dimuat dari /users/me', async () => {
    localStorage.setItem('siak.access_token', 'access-ada');
    localStorage.setItem('siak.refresh_token', 'refresh-ada');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: ME })));

    renderProbe();
    expect(await screen.findByTestId('user')).toHaveTextContent('mahasiswa@kampus.ac.id');
    expect(screen.getByTestId('booting')).toHaveTextContent('false');
  });

  it('tanpa token → booting selesai tanpa user', async () => {
    renderProbe();
    expect(await screen.findByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('booting')).toHaveTextContent('false');
  });

  it('token invalid → sesi dibersihkan (tanpa user)', async () => {
    localStorage.setItem('siak.access_token', 'access-basi');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false }, 401)));

    renderProbe();
    expect(await screen.findByTestId('user')).toHaveTextContent('none');
    expect(localStorage.getItem('siak.access_token')).toBeNull();
  });

  it('restore gagal 5xx (server error) → token DIPERTAHANKAN (session recovery T5.1)', async () => {
    localStorage.setItem('siak.access_token', 'access-ada');
    localStorage.setItem('siak.refresh_token', 'refresh-ada');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false }, 503)));

    renderProbe();
    expect(await screen.findByTestId('user')).toHaveTextContent('none');
    expect(localStorage.getItem('siak.access_token')).toBe('access-ada');
    expect(localStorage.getItem('siak.refresh_token')).toBe('refresh-ada');
  });

  it('restore gagal jaringan → token DIPERTAHANKAN (session recovery T5.1)', async () => {
    localStorage.setItem('siak.access_token', 'access-ada');
    localStorage.setItem('siak.refresh_token', 'refresh-ada');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderProbe();
    expect(await screen.findByTestId('user')).toHaveTextContent('none');
    expect(localStorage.getItem('siak.access_token')).toBe('access-ada');
    expect(localStorage.getItem('siak.refresh_token')).toBe('refresh-ada');
  });

  it('logout → user hilang dan token dibersihkan', async () => {
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: ME })));

    renderProbe();
    await screen.findByTestId('user');
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('mahasiswa@kampus.ac.id'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
    expect(localStorage.getItem('siak.access_token')).toBeNull();
  });
});
