import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
import * as api from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, updateMyContact: vi.fn(), ApiError: actual.ApiError };
});
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 7,
      email: 'budi@kampus.ac.id',
      fullName: 'Budi Santoso',
      role: 'mahasiswa',
      roleName: 'Mahasiswa',
      isWali: false,
      isActive: true,
      mustChangePassword: false,
      studentId: 7,
      createdAt: '2026-01-01T00:00:00Z',
      menu: ['user.edit_contact'],
    },
    booting: false,
    refreshMe: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  }),
}));

const mockedApi = vi.mocked(api);

describe('ProfilePage (keluhan #26 — Edit Profil)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan form dengan nilai awal dari user', () => {
    render(<ProfilePage />);

    expect(screen.getByLabelText('Nama Lengkap')).toHaveValue('Budi Santoso');
    expect(screen.getByLabelText('Email')).toHaveValue('budi@kampus.ac.id');
  });

  it('submit → updateMyContact dipanggil dengan nilai yang diedit + pesan sukses', async () => {
    mockedApi.updateMyContact.mockResolvedValue({
      id: 7,
      email: 'budi.baru@kampus.ac.id',
      fullName: 'Budi Santoso',
      message: 'Kontak berhasil diperbarui',
    });
    render(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'budi.baru@kampus.ac.id' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => {
      expect(mockedApi.updateMyContact).toHaveBeenCalledWith({
        fullName: 'Budi Santoso',
        email: 'budi.baru@kampus.ac.id',
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Kontak berhasil diperbarui');
  });

  it('nama kosong → undefined (tidak dikirim) + error inline jika < 2 karakter', async () => {
    mockedApi.updateMyContact.mockResolvedValue({
      id: 7,
      email: 'budi@kampus.ac.id',
      fullName: 'Budi Santoso',
      message: 'Kontak berhasil diperbarui',
    });
    render(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Nama Lengkap'), { target: { value: 'A' } });
    expect(screen.getByText('Nama minimal 2 karakter')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nama Lengkap'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => {
      expect(mockedApi.updateMyContact).toHaveBeenCalledWith({
        fullName: undefined,
        email: 'budi@kampus.ac.id',
      });
    });
  });

  it('gagal → pesan error ditampilkan', async () => {
    mockedApi.updateMyContact.mockRejectedValue(
      new api.ApiError(409, 'VALIDATION_ERROR', 'Email sudah digunakan'),
    );
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    expect(await screen.findByText('Email sudah digunakan')).toBeInTheDocument();
  });
});
