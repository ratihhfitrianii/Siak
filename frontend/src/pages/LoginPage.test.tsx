import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { LoginPage } from './LoginPage';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const ME = {
  id: 1,
  email: 'budi@kampus.ac.id',
  fullName: 'Budi',
  role: 'mahasiswa',
  roleName: 'Mahasiswa',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['krs.fill'],
};

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>HALAMAN_DASHBOARD</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage (T1.11a)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan form NIM/NIK/email + password', () => {
    renderLogin();
    expect(screen.getByLabelText('NIM / NIK / Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument();
  });

  it('login sukses → navigasi ke dashboard', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/auth/login')) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                accessToken: 'access-1',
                refreshToken: 'refresh-1',
                user: { mustChangePassword: false },
                expiresIn: 900,
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse({ success: true, data: ME }));
      }),
    );

    renderLogin();
    await user.type(screen.getByLabelText('NIM / NIK / Email'), 'budi@kampus.ac.id');
    await user.type(screen.getByLabelText('Password'), 'Rahasia123!');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByText('HALAMAN_DASHBOARD')).toBeInTheDocument();
  });

  it('kredensial salah → error inline tampil', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'NIM/NIK atau password salah' },
          },
          401,
        ),
      ),
    );

    renderLogin();
    await user.type(screen.getByLabelText('NIM / NIK / Email'), 'budi@kampus.ac.id');
    await user.type(screen.getByLabelText('Password'), 'Salah123!');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('NIM/NIK atau password salah');
  });

  it('field error terhubung ke input via aria-describedby (a11y T5.5)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'NIM/NIK atau email minimal 3 karakter',
              details: { fields: { identifier: ['NIM/NIK atau email minimal 3 karakter'] } },
            },
          },
          400,
        ),
      ),
    );

    renderLogin();
    await user.type(screen.getByLabelText('NIM / NIK / Email'), 'ab');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    const error = await screen.findByText('NIM/NIK atau email minimal 3 karakter');
    const input = screen.getByLabelText('NIM / NIK / Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'identifier-error');
    expect(error).toHaveAttribute('id', 'identifier-error');
  });

  it('error validasi field dari backend tampil di bawah input', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'NIM/NIK atau email minimal 3 karakter',
              details: { fields: { identifier: ['NIM/NIK atau email minimal 3 karakter'] } },
            },
          },
          400,
        ),
      ),
    );

    renderLogin();
    await user.type(screen.getByLabelText('NIM / NIK / Email'), 'ab');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByText('NIM/NIK atau email minimal 3 karakter')).toBeInTheDocument();
  });

  it('jaringan mati → pesan koneksi jelas (T5.1)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderLogin();
    await user.type(screen.getByLabelText('NIM / NIK / Email'), 'budi@kampus.ac.id');
    await user.type(screen.getByLabelText('Password'), 'Rahasia123!');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tidak dapat terhubung ke server');
  });

  it('sudah login (dengan sesi) → langsung redirect', async () => {
    localStorage.setItem('siak.access_token', 'access-ada');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: ME })));

    renderLogin();
    expect(await screen.findByText('HALAMAN_DASHBOARD')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText('NIM / NIK / Email')).not.toBeInTheDocument(),
    );
  });
});
