import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { ChangePasswordPage } from './ChangePasswordPage';

// userEvent + coverage instrumentation lambat → timeout default 5s sering kebentur
// (flaky pre-existing saat full suite; standalone selalu pass). Naikkan per-file.
vi.setConfig({ testTimeout: 20_000 });

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ganti-password']}>
      <AuthProvider>
        <Routes>
          <Route path="/ganti-password" element={<ChangePasswordPage />} />
          <Route path="/" element={<div>HALAMAN_DASHBOARD</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ChangePasswordPage (T1.11a)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validasi client: password baru < 8 karakter → error inline tanpa fetch', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await user.type(screen.getByLabelText('Password saat ini'), 'Lama123!');
    await user.type(screen.getByLabelText('Password baru'), 'pendek');
    await user.type(screen.getByLabelText('Konfirmasi password baru'), 'pendek');
    await user.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    expect(await screen.findByText('Password baru minimal 8 karakter')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validasi client: konfirmasi tidak cocok → error inline', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());

    renderPage();
    await user.type(screen.getByLabelText('Password saat ini'), 'Lama123!');
    await user.type(screen.getByLabelText('Password baru'), 'Baru123456!');
    await user.type(screen.getByLabelText('Konfirmasi password baru'), 'Beda123456!');
    await user.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    expect(await screen.findByText('Konfirmasi password tidak cocok')).toBeInTheDocument();
  });

  it('submit sukses → pesan sukses tampil', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true, data: { message: 'Password berhasil diubah' } }),
        ),
    );

    renderPage();
    await user.type(screen.getByLabelText('Password saat ini'), 'Lama123!');
    await user.type(screen.getByLabelText('Password baru'), 'Baru123456!');
    await user.type(screen.getByLabelText('Konfirmasi password baru'), 'Baru123456!');
    await user.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    expect(await screen.findByText('Password berhasil diubah.')).toBeInTheDocument();
  });

  it('error backend (password saat ini salah) → error form tampil', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Password saat ini salah' },
          },
          401,
        ),
      ),
    );

    renderPage();
    await user.type(screen.getByLabelText('Password saat ini'), 'Salah123!');
    await user.type(screen.getByLabelText('Password baru'), 'Baru123456!');
    await user.type(screen.getByLabelText('Konfirmasi password baru'), 'Baru123456!');
    await user.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password saat ini salah');
  });
});
